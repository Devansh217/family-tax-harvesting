# Docs digest

Short digest of the project docs, made with the headroom plugin on 14 Nov 2026. Read this first; open the source at the cited lines only when you need detail. Refresh it when a doc changes.

## docs/PRODUCT.md (142 lines)

- **Product** (L8–10): every PAN gets ₹1.25 L of tax-free LTCG a year, lapsing 31 March. App ("Devansh") shows each member's room left and the steps to use it.
- **Personas** (L14–20): Family CFO (owner, 28–45), Members (spouse, parents, kids), Viewer/CA later. Not v1: CA dashboards, NRIs, F&O, US stocks, property.
- **Jobs** (L24–27): don't let room lapse; know tax before selling; use family room legally (own holdings, then gifts per clubbing); ITR-ready schedule.
- **Targets** (L31–40): 50K families (sized 100K), 5 members typical / 12 max, home < 1 s p75, number-changing tap < 100 ms (engine on device), CAS import < 30 s p95, match broker P&L within ₹1/lot, 99.95% uptime Feb–Mar.
- **Vocabulary** (L44–54): Family, Member (one PAN), Source, Lot, Room (Used / Planned / Free), Bonus room, Move (gain / loss / wait / gift; suggested / in plan / done / dismissed), Plan, Clubbing (spouse, minor, son's wife, HUF never get gift moves).
- **IA** (L60–69): Home, Member, Plan → Move detail, Simulate, Family → Gift planner, Avatar.
- **Onboarding** (L73–90): phone OTP; add self; CAS PDF → broker CSV → AA. Platforms: Zerodha, Groww, Angel One, ET Money, others via CAS (L80–88).
- **Consent** (L92–96): DPDP, member verifies on own phone, "let X manage" for seniors, guardian for minors, revoke any time.
- **Season loop** (L98–102): weekly digest from Jan; app never places trades; import auto-marks moves Done; nudges 15/25/29 Mar.
- **Releases** (L109–115): R0 engine Nov–Dec 2026; R1 PWA beta Jan 2027 (500 families); R2 season Feb–Mar 2027 (5K); R3 native apps Apr–Sep 2027 (50K).
- **Pricing** (L119–125): free room meters; Plus ₹1,499/family/yr (test ₹999–₹2,999). North star: ₹ tax saved per family, verified by import.
- **Compliance** (L129–135): SEBI IA risk (RIA registration option), AA needs regulated FIU, DPDP, PAN only (no Aadhaar, no broker passwords), "Planning estimate" disclaimer.
- **Open questions** (L139–142): families vs CAs first, RIA now or later, price/free tier, brand name.

## docs/ARCHITECTURE.md (155 lines)

> Check against memory: build decisions on 14 Nov 2026 moved to a local-first backend. This doc still describes the AWS design.

- **Sizing** (L7–17): 250K PANs, ~10M open lots, ~60M txns; snapshot 20–60 KB; 31 Mar peak ~300 rps (design 1,500), ~40K imports.
- **Principles** (L23–27): one pure-TS engine on server and device; precomputed snapshot read model; imports are queued jobs; `family_id` is the shard key; boring infra.
- **Diagram** (L31–49): Expo app/PWA → Fastify API → Postgres 16 + Redis 7 + S3; SQS → parse (Python), compute (Node), prices, notify workers. AWS Mumbai.
- **Stack** (L53–66): Expo + Expo Router, TanStack Query + MMKV, `@fasal/engine` in paise integers, Zod shared schemas, pdfplumber parsers, phone OTP, KMS.
- **Data model** (L70–92): family, member, consent, source, import_job, security, price, txn (source of truth, `dedupe_key` UNIQUE), derived lot / realised / snapshot, carry_loss, move, audit_log.
- **Hot paths** (L96–110): cached snapshot + ETag 304; what-ifs on device < 16 ms for ~5K lots; import pipeline with SSE progress; nightly price recompute coalesced per family.
- **31 March** (L112–118): load test by 31 Jan, change freeze from 15 Mar, final nudges two trading days early.
- **Security** (L122–130): encrypted + hashed PAN, statements deleted 7 days after parse, RLS, DPDP erasure in 24 h.
- **Engine correctness** (L134–137): paise ints; golden broker-P&L tests; property tests (room ≥ 0, used + planned + free = limit, 12-month ST/LT boundary); tax rules per year in a table.
- **Cost** (L141–149): ~₹3 L/month normal, ~₹5 L in March (₹6–10/family/month).
- **Decisions** (L153–155): Expo everywhere, AWS vs Indian cloud, raw-statement retention.

## Other files (outline only)

- `docs/DESIGN.md` (85 lines): "Quiet ledger" design system. Principles L5, tokens L14 (colour L16, type L36, space/shape/motion L49), signature components L55, screens L68, copy rules L80.
- `docs/IDEA.md` (68 lines): original idea. Problem L8, core experience L11, roadmap L23–46, monetisation L48, risks L52, MVP L59, next steps L62.
- `index.html` (501 lines, 40 KB): single-file prototype; CSS tokens at L21–22, panels from ~L118, inline script below.
- `prototype/package-lock.json` (87 KB): lockfile; never read it whole.
