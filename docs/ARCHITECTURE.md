# Architecture v1 — built for 50,000 families

**Status:** Draft for review · **Date:** 14 Nov 2026 · Read with [PRODUCT.md](PRODUCT.md)

## 1. Sizing

| Quantity | Launch (50K families) | Designed for (2×) |
|---|---|---|
| Families | 50,000 | 100,000 |
| Members (PANs) | 250,000 | 1,000,000 (12/family cap) |
| Sources (demats, folios, broker files) | ~750,000 | 2.5M |
| Open lots | ~10M | 40M |
| Transactions (10 years history) | ~60M | 250M |
| Family snapshot size | 20–60 KB JSON (gzip ~8 KB) | |
| Normal day: active families | ~2,500 | |
| **31 March peak**: active families / peak API rate | ~20,000 / ~300 rps | design for 1,500 rps |
| Statement imports, peak day | ~40,000 | |

The numbers are small for a database and large for a single engineer's patience. The hard parts are not throughput; they are **correctness of the tax engine**, **import reliability**, **the 31 March spike**, and **protecting financial and identity data**.

## 2. Principles

1. **One engine, two places.** The tax engine is a pure TypeScript package with no I/O. The server runs it to build snapshots; the app runs the same code for what-ifs, so every slider and simulator answer is instant and offline.
2. **Read models, not live joins.** Each family has one precomputed **snapshot** (rooms, moves, totals). Home is one request and one render.
3. **Imports are jobs.** Uploads go to storage and a queue; the user sees progress and gets a push when done. The API never blocks on parsing.
4. **Family is the shard key.** Every row carries `family_id`; access control, caching, partitioning and deletion all key on it.
5. **Boring infrastructure.** One managed Postgres, one Redis, one queue, in one Indian region. Split only when a measured limit is hit.

## 3. System diagram

```
 Android / iOS app (Expo)        Web PWA (same code, Expo Router web)
        │   @fasal/engine runs on device for what-ifs
        ▼
   CDN (static assets only) ── API (Node, Fastify, stateless, autoscaled 3–20 pods)
                                 │        │            │
                         Postgres 16   Redis 7      Object store (S3, ap-south-1)
                         (primary +    (snapshot     encrypted raw statements,
                          2 replicas)   cache, rate   deleted 7 days after parse
                                        limits, OTP)
                                 │
                         Queue (SQS) ──► Workers
                                          ├ parse-worker (Python: CAS PDF, broker CSV)
                                          ├ compute-worker (Node: @fasal/engine → snapshot)
                                          ├ prices-worker (daily NSE/BSE bhavcopy, AMFI NAV)
                                          └ notify-worker (push, WhatsApp, email)
```

All in AWS Mumbai (ap-south-1), with backups to Hyderabad (ap-south-2). Data stays in India.

## 4. Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + Expo Router**, one codebase for Android, iOS and web | India is ~85% Android; push notifications matter in March; web for desktop users and SEO |
| UI | Own component library on design tokens (see DESIGN.md), Reanimated for meters | Consistent across platforms, 60 fps |
| Client data | TanStack Query + persisted cache (MMKV) | Instant start from last snapshot, background refresh |
| Engine | **`@fasal/engine`** pure TS, decimal arithmetic in paise (integers), property-based tests | Same answers on server and device; no float errors |
| API | Node 22, Fastify, Zod schemas shared with the app | Typed end to end |
| Parsers | Python 3.12 (`pdfplumber`-based CAS parser, broker adapters for Zerodha, Groww, Angel One and ET Money statements) | Best PDF tooling; emits normalised transactions only |
| Database | Postgres 16 (Aurora or RDS), hash-partitioned by `family_id` on large tables | Relational integrity for money; easily handles 250M rows |
| Cache | Redis: snapshots, OTP, rate limits | |
| Queue | SQS with dead-letter queues | Retries and visibility for failed imports |
| Auth | Phone OTP (SMS + WhatsApp fallback), passkeys later, app lock via biometrics | No passwords to leak |
| Secrets/keys | AWS KMS, envelope encryption for PAN and raw files | |
| Observability | OpenTelemetry → Grafana stack, Sentry for app crashes | |

## 5. Data model (core tables)

```
family(id, name, plan, owner_member_id, created_at)
member(id, family_id, display_name, pan_enc, pan_hash, dob, residency, regime,
       relation_to_owner, clubbing_with_member_id NULL, role[owner|member|viewer])
consent(id, member_id, purposes[], granted_at, revoked_at, method[otp|guardian])
source(id, member_id, kind[cas_pdf|tradebook|aa], broker, status, last_synced_at)
import_job(id, source_id, status, progress, error_code, file_key, created_at)
security(isin, symbol, name, kind[equity|equity_mf|debt_mf|etf], fmv_2018_01_31)
price(isin, date, close)                         -- daily, ~10K ISINs
txn(id, family_id, member_id, source_id, isin, date, kind[buy|sell|bonus|split|gift_in|gift_out],
    qty, price_paise, charges_paise, dedupe_key UNIQUE)
lot(id, family_id, member_id, isin, open_date, qty_open, cost_paise, origin_txn_id)   -- derived
realised(id, family_id, member_id, tax_year, isin, sell_date, term[st|lt], gain_paise)  -- derived
carry_loss(member_id, tax_year_origin, term, amount_paise)
move(id, family_id, member_id, tax_year, kind[gain|loss|wait|gift], payload jsonb,
     saving_paise, state[suggested|planned|done|dismissed], matched_txn_id)
snapshot(family_id PK, tax_year, version, computed_at, body jsonb)   -- read model
audit_log(id, family_id, actor_member_id, action, at)
```

- `txn` is the source of truth. `lot`, `realised` and `snapshot` are **derived** and can be rebuilt for any family from `txn` in under a second.
- `dedupe_key` (member, isin, date, qty, price, broker ref) makes re-importing the same file harmless.
- Row-level security: every query is scoped by `family_id` from the session, and member-level visibility is applied for data a member has not shared.

## 6. Hot paths

### 6.1 Open the app (the path that must feel instant)
1. App renders the **cached snapshot** from local storage immediately (0 network).
2. `GET /families/:id/snapshot` with `If-None-Match: <version>` → `304` most of the time.
3. Server reads Redis (`snap:{family_id}:{version}`), falls back to Postgres `snapshot` row. Never recomputes on the request path.
Budget: p95 < 80 ms server, < 1 s to fresh data on 4G.

### 6.2 What-if (simulator, plan edits)
Runs entirely on the device with `@fasal/engine` over the lots included in the snapshot. Zero network. Target < 16 ms per recompute for a 12-member family (~5,000 lots).

### 6.3 Import a statement
`POST /sources/:id/imports` → presigned upload URL → object store → queue → parse-worker → normalised `txn` rows (idempotent) → compute-worker rebuilds that family's lots, realised gains, moves, snapshot → push notification. Progress over Server-Sent Events while the screen is open.
Budget: p95 < 30 s end to end; password-protected CAS PDFs use the PAN-based password the user enters once (never stored).

### 6.4 Daily prices
After market close: fetch bhavcopy and AMFI NAVs (~10K ISINs) → write `price` → enqueue a recompute for every family (50K jobs). At ~5 ms each on 8 workers this completes in under a minute. Recomputes are coalesced: one pending job per family at most.

## 7. Surviving 31 March

- Traffic is ~10× a normal day and concentrated in the evening after market close.
- Snapshot reads are cache hits; API pods autoscale on CPU and request rate; Postgres replicas serve reads.
- Imports are the real load: queue depth alarms, worker autoscaling on queue age, and a visible "imports are busy, ~4 min" message instead of timeouts.
- **Load test to 1,500 rps and 10K imports/hour by 31 Jan.** Change freeze from 15 March except fixes.
- Final nudges go out two trading days before 31 March, since a sell on the last day leaves no margin for mistakes.

## 8. Security and privacy

| Threat | Control |
|---|---|
| Database leak exposes PANs | PAN encrypted with KMS envelope keys; lookups use a salted hash; PAN shown masked (`ABCPD••••F`) |
| Raw statements leak | Encrypted in S3, deleted 7 days after successful parse, never served back |
| Cross-family access | `family_id` from session on every query, Postgres RLS as a second wall, automated tests that try cross-family reads |
| Account takeover | OTP rate limits, device binding, new-device alert to the Owner, biometric app lock |
| Member privacy inside a family | Per-member consent purposes; a member can hide holdings and share only room numbers |
| Right to erasure (DPDP) | "Delete my data" removes the member's rows and files within 24 h; audit log keeps only the fact of deletion |
| Insider access | No production data access without break-glass, logged and reviewed |

## 9. Correctness of the engine

- Paise integers everywhere, no floats.
- Golden test set: real (anonymised) family portfolios with the broker's tax P&L as expected output; every engine change must match within ₹1 per lot.
- Property tests: room never negative, used + planned + free = limit, ST/LT boundary exactly at 12 months, grandfathering never increases tax.
- Tax rules live in a versioned table per tax year (limit, rates, cess, holding period), not in code, so Budget changes are a data change.

## 10. Cost estimate at 50K families (monthly, rough)

| Item | ₹ / month |
|---|---|
| Postgres (r6g.xlarge + 2 replicas) | 1.2 L |
| API + workers (containers, autoscaled) | 0.6 L |
| Redis, S3, SQS, CDN, logs | 0.4 L |
| SMS/WhatsApp OTP and nudges | 0.8 L (season peak 2 L) |
| **Total** | **~3 L normal, ~5 L in March** |

About ₹6–10 per family per month, well under the subscription price.

## 11. Decisions to confirm

1. Expo for all three platforms vs a native Android app first. (Recommend Expo.)
2. AWS Mumbai vs an Indian cloud. (Recommend AWS for managed Postgres and KMS.)
3. Keep raw statements 7 days or delete immediately after parse.
