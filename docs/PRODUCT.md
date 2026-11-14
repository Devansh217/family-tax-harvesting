# Product spec v1 — Family Tax Harvesting (India)

**Status:** Draft for review · **Date:** 14 Nov 2026 · **Name:** Harvesting
**Companion docs:** [ARCHITECTURE.md](ARCHITECTURE.md) (system design for 50K families) · [DESIGN.md](DESIGN.md) (design system and screens) · [IDEA.md](IDEA.md) (original idea)

---

## 1. Product in one line

Every PAN in your family gets ₹1.25 lakh of tax-free long-term equity gains each year, and it lapses on 31 March. Harvesting shows how much room each person has left, and the exact steps to use it before it lapses.

## 2. Who it is for

| Persona | Who | What they need | Role in app |
|---|---|---|---|
| **Family CFO** (primary) | 28–45, salaried or founder, uses Zerodha, Groww, Angel One or ET Money, already handles parents' and spouse's investments | One screen for the whole family's tax room; a plan they can execute in an evening; no spreadsheet | Owner |
| **Members** | Spouse, parents (often 60+), adult children, siblings | Approve data access once, then get a short "do this" list or let the CFO do it | Member |
| **Viewer** (later) | Family CA or advisor | Read-only access at filing time, export | Viewer |

Not for v1: CAs managing 100+ families (B2B dashboard), NRIs, F&O traders, US stocks, property.

## 3. Jobs to be done

1. **"Don't let free room lapse."** Show unused exemption per person and in total, with a countdown to 31 March.
2. **"Know the tax before I sell."** Any proposed sale shows tax due, and which family member is best placed to sell.
3. **"Use the family's room legally."** Fill each member's room from their own holdings first, then by gift where clubbing rules allow.
4. **"Get filing right."** An ITR-ready capital gains schedule per person, reconciled with the broker's tax P&L.

## 4. Scale and quality targets

| Target | Number | Notes |
|---|---|---|
| Families supported at launch scale | **50,000** | Architecture sized for 100K (2× headroom) |
| Members per family | **5 typical, up to 12** | Each member can link several demats and MF folios |
| Total PANs | ~250K (design 1M) | |
| App open to family home rendered | **< 1.0 s** p75 on a mid-range Android over 4G | Cached snapshot shown instantly, refreshed in background |
| Any tap that changes a number | **< 100 ms** | Tax engine runs on the device for what-ifs |
| Statement import (CAS PDF) | **< 30 s** p95, with progress | Asynchronous, notifies when done |
| Accuracy | Matches broker tax P&L within ₹1 per lot | Shown as a "Reconciled" badge per member |
| Availability | 99.9% monthly, **99.95% in Feb–Mar** | Harvest season freeze on risky deploys |

## 5. Core concepts (shared vocabulary)

| Term | Meaning |
|---|---|
| **Family** | The unit of billing and the home screen. One Owner, many Members. |
| **Member** | One person with one PAN. Has their own consent, data sources and tax profile (age, regime, residency). |
| **Source** | Where data comes from: CAS PDF, broker tradebook, Account Aggregator link. Belongs to one member. |
| **Lot** | One purchase of one security, with date, quantity and cost. The atom of every calculation. |
| **Room** | The ₹1.25 L LTCG exemption for a member this tax year, split into **Used** (gains booked), **Planned** (in the plan, not yet done) and **Free**. |
| **Bonus room** | Unused basic exemption that residents can set against special-rate gains (low-income parents, students). |
| **Move** | One suggested step: harvest gain, harvest loss, wait, or gift. Has a rupee saving and a state (suggested, in plan, done, dismissed). |
| **Plan** | The family's list of moves for this tax year. |
| **Clubbing** | Gifts to spouse, minor child, son's wife or HUF are taxed back in the giver's hands. Those members never receive gift moves. |

## 6. Information architecture

Mobile bottom tabs, same structure as a left rail on desktop:

```
Home ─────────── Family room total · days left · saving available · member rooms · top 3 moves
 └ Member ────── Room meter · bonus room · gains booked YTD · lots turning long-term · holdings
Plan ─────────── Moves grouped by member · checklist · saving achieved vs available
 └ Move detail ─ Exact lots, quantities, buy-back note, what changes in the room
Simulate ─────── "If I sell ₹X of Y" → tax per member who holds it, best seller highlighted
Family ───────── Members, consent status, sources, clubbing tags, invite
 └ Gift planner  Giver → receiver suggestions with clubbing rules applied
(Avatar) ─────── Profile · subscription · data and privacy · export ITR schedule · delete everything
```

## 7. Key flows

### 7.1 Onboarding (target: first room number in under 3 minutes)
1. Phone number + OTP. No password.
2. "Who is in your family?" Add yourself (name, PAN, date of birth, tax regime). Others can be added later.
3. Connect data, in order of friction: **upload CAS PDF** (most complete, one file covers all demats and MFs) → broker tradebook CSV (for equity cost basis) → Account Aggregator (when eligible, see §10).

**Supported platforms at launch**

| Platform | What it holds | One-time history | Ongoing updates |
|---|---|---|---|
| Zerodha | Shares, ETFs, MFs (Coin) | Tradebook CSV + tax P&L from Console | Kite Connect login (daily re-login) or monthly CAS |
| Groww | Shares, MFs | Order history / tax P&L export | Groww trade API login or monthly CAS |
| Angel One | Shares, ETFs, MFs | Trade history + tax P&L report | SmartAPI login or monthly CAS |
| ET Money | Mainly mutual funds (direct plans) | CAMS/KFintech CAS (ET Money's own transaction statement as a cross-check) | Monthly CAS email forward; no public API known |
| Any other broker or fund platform | — | CDSL/NSDL + CAMS/KFintech CAS | Monthly CAS email forward |

Mutual fund units bought through any platform, ET Money included, sit with CAMS or KFintech, so the CAS covers them with full purchase history. Broker files are needed mainly for exact share buy prices. Export formats and API terms must be checked against each platform before build.
4. First result: your room meter, before anything else is asked.
5. Prompt to add the next member: "Your parents have ₹2.5 L of room you can't see yet."

### 7.2 Member invite and consent (DPDP)
- Owner adds a member and sends a WhatsApp/SMS link. The member verifies by OTP on **their own phone** and grants consent for specific purposes (compute room, show to Owner, suggest moves).
- Senior parents can choose "Let Arjun manage this for me" after verifying once.
- Minor children: guardian consent by the Owner, flagged as clubbing.
- Any member can revoke and delete their data at any time. The Owner sees "Consent withdrawn", never the data.

### 7.3 The harvest season loop (Jan–Mar)
1. Weekly digest from January: "₹4.95 L of family room left · 137 days".
2. Owner opens Plan, adds moves, executes them in their broker app (Harvesting never places trades).
3. New tradebook/CAS import (or AA refresh) marks moves **Done** automatically by matching the sells.
4. 15 Mar, 25 Mar, 29 Mar: deadline nudges for unused room. Last trading day called out explicitly.

### 7.4 Sell simulator
Pick a holding and an amount → for every member who holds it: gain split ST/LT, room consumed, tax due. Best member highlighted. Changing the amount updates in under 100 ms (computed on the device).

## 8. Scope by release

| Release | Window | Scope |
|---|---|---|
| **R0 Engine** | Nov–Dec 2026 | Lot engine (FIFO, grandfathering at 31 Jan 2018 FMV, carried-forward losses), CAS PDF + Zerodha, Groww, Angel One and ET Money statement parsers, reconciliation against broker tax P&L. Internal only. |
| **R1 Beta** | Jan 2027 | Mobile web (PWA): onboarding, Home, Member, Plan (gain + loss + wait moves), Family with consent. 500 invited families for the FY 26-27 season. |
| **R2 Season** | Feb–Mar 2027 | Simulator, gift planner, deadline nudges, auto-mark Done on import, payments. Open to 5K families. |
| **R3 Scale** | Apr–Sep 2027 | Android + iOS apps, ITR schedule export, AIS mismatch check, Account Aggregator (if eligible). Target 50K families for FY 27-28. |
| Later | | CA/advisor view, ESOP/RSU, US stocks, debt and gold, HUF. |

## 9. Business model

- **Free:** room meters for up to 5 members, days left, total saving available.
- **Harvesting Plus — ₹1,499 per family per year** (placeholder, test ₹999–₹2,999): moves with exact lots, simulator, gift planner, nudges, ITR export, up to 12 members. Positioned against the saving shown ("Unlocks ₹64,350 of savings").
- Season pass pricing for first-time users in March.

**North-star metric:** rupees of tax saved per family per year, from moves marked Done and verified by import.
**Activation:** a family with at least 2 members' data and a room number.
**Retention signal:** returns in the next season (Jan) without a nudge.

## 10. Compliance and trust (gating items)

| Item | Position for v1 | Decision needed |
|---|---|---|
| **SEBI Investment Adviser rules** | Show tax arithmetic on the user's own holdings. Moves are "sell and buy back the same security" (no new security is ever suggested). Still close to personalised advice. | Legal opinion before R1. Strong option: register as a SEBI RIA (also unlocks the AA route below). |
| **Account Aggregator** | FIUs must be regulated by a financial regulator, so Harvesting cannot pull AA data on its own today. v1 uses user-supplied CAS and broker files. | Become RIA, or partner with a regulated FIU. |
| **DPDP Act 2023** | Per-member consent with purposes, revocation, deletion, breach notice process, data in India. | Appoint a grievance officer; consent notice copy reviewed. |
| **Identity data** | PAN only, encrypted. **No Aadhaar, no broker passwords, ever.** | — |
| **Not tax advice** | Every screen with a move carries "Planning estimate. Check large moves with a CA." | — |

## 11. Open questions for the founder

1. Families first or CAs first? (Spec assumes families; the data model keeps a Viewer role so CAs can be added.)
2. RIA registration: pursue now (cost, 3–6 months) or launch as a calculator and accept the risk?
3. Price point and whether the free tier shows the rupee saving (it is the strongest upgrade hook).
4. Brand name: the app is named Harvesting (working names Fasal, then Harvesting, both changed on 14 Nov 2026). "Harvesting" is an ordinary word, so it is hard to register as a trademark on its own; a distinctive logo or a fuller name will be needed before launch.
