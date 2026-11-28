# Fund tax types from sources, not user picks (design)

28 Nov 2026. Issue #40 (D1). Research: `docs/research/2026-11-28-fund-tax-types.md` (**FUNDTAX**). Fresh-run notes: "Fund tax types shouldn't be asked of users" and finding 17c ("a sold ETF needs checking but there's no Pick"). **Status: approved by the founder on 28 Nov 2026 (decisions at the end). The build waits until the SEBI circular itself is read.** Nothing here is built.

## Why

Today the member page's "Funds to check" asks the family to pick Equity, Long-term 12.5% or Slab for balanced advantage, multi asset, domestic fund-of-funds and a few other headings. Families can't be expected to know this. Until they pick, the fund's gains are taxed at slab and it gets no moves. A sold fund in the same state can't be picked at all.

## What the research settled

- **No free dataset states a fund's tax type.** AMFI's NAVAll.txt and scheme master give the SEBI category only. The one per-scheme statement is the taxation section of the scheme's SID, in free text that varies by AMC (FUNDTAX §4, §5).
- **SEBI's label is not the tax status.** The Act's test is 65% in listed Indian shares on an annual average of monthly figures (s.198(8)). SEBI's bands use "equity and equity-related". A SID for a fund SEBI calls an "Equity Oriented FOF" taxes it as non-equity (FUNDTAX §4.1).
- **Some headings are settled by the bands.** Conservative hybrid (25% equity cap) and balanced hybrid (60% cap) can never be equity. Gold, silver and overseas funds are never equity (FUNDTAX §3.2, §6).
- **Domestic FoFs are equity only in one narrow case:** 90% or more in one exchange-traded fund that holds 90% or more in listed Indian shares (s.198(8)(i)). An FoF of ordinary equity funds is `other_lt` (FUNDTAX §2.4).
- **The `other_lt` holding periods are right in the engine today.** Unlisted non-equity units are long-term after 24 months (s.2(101)); listed ETFs of any asset after 12 months. `otherLongTermMonths: 24` stays (FUNDTAX §2.3). Only the display term of an unanswered `check` fund needs a fix (§7).
- **The SEBI circular text was not read** (sebi.gov.in unreachable). The bands above rest on a law-firm note. The build should not start until someone reads the circular, or the founder accepts that risk.

## Goals

1. Category defaults where the rule is clear, so fewer funds reach the family at all.
2. A curated `fund-overrides.json`: one entry per scheme, every entry citing the document, section and month it was read.
3. A refresh path in the daily price build that flags funds still unknown and entries that are getting old, without changing anyone's tax on its own.
4. For funds still unknown: a confirm-only prompt with a suggested answer and the reason, on held **and** sold funds.

## Non-goals

- Parsing SIDs or monthly portfolios automatically. Formats differ by AMC, and a month-end snapshot is not the Act's annual average (FUNDTAX §5).
- Computing the 65% test from holdings.
- Changing tax rates, set-off or move sizing.
- Any change to shares, ELSS lock-in or the specified-fund cutoff (`lotTaxType`).

## Anti-goals

- **A fund marked `equity` that the family did not confirm and no cited source supports.** Equity unlocks the ₹1.25 L exemption and harvest moves, so a wrong `equity` is the worst mistake (GUARDRAILS §1).
- **A fund marked `slab` that is really `other_lt` or `equity`.** The ₹12 L rebate (s.156) cancels slab tax but not special-rate tax, so for a member under the line a wrong `slab` shows "no tax now" on a sale or a direct-plan switch that is really taxed (`tax.ts` rebate, `family.ts` switch moves). Found by the guardrail review: an "income" name word would have done this to about 25 "Income Plus Arbitrage" FoFs.
- A suggestion worded as advice, or naming a fund to buy (GUARDRAILS §6). Scheme names appear only for funds the family already holds or held.
- A saved family whose computed tax changes without a visible reason.

## Design

### 1. Precedence (unchanged order, one new layer)

`user` (the family's answer) > `override` (curated, cited) > `amfi` (category rule) > `suggested` (shown, not applied).

A suggestion is never applied until the family confirms it. Until then the fund stays `check`: slab tax, no moves, as today. Confirming writes the same `taxTypeOverrides[isin]` entry a pick writes today, so **the stored family shape does not change** and no migration is needed.

### 2. Category defaults (`engine/categories.ts`)

Changes to the rules, with FUNDTAX confidence. Everything else stays as it is.

| AMFI heading | Today | New | Why |
|---|---|---|---|
| Index Funds, not domestic equity by name: gold, silver, overseas words | `check` | `other_lt`, unlisted | Never 65% Indian shares (High) |
| Index Funds, name has a debt word and no equity index word | `check` | `slab` | Debt index funds hold over 65% debt (High) |
| Other ETFs / Equity ETF, not domestic equity: gold, silver, overseas words | `check` | `other_lt`, listed | Same, listed (High) |
| Other ETFs / Equity ETF, name has a debt word and no equity index word | `check` | `slab`, listed | Same (High) |
| FoF Domestic, name has gold or silver | `check` | `other_lt`, unlisted | Holds commodity ETFs. Never equity (High); 12.5% for lots bought Apr 2023 to Mar 2025 rests on CA question 25 (Medium) |
| FoF Domestic, name has a debt word and no "arbitrage" or equity word | `check` | `slab`, unlisted | 65%+ in specified funds (High) |
| Everything else now `check` (balanced advantage, multi asset, hybrid ETF and index, other FoF Domestic, overseas-named equity, life cycle, solution oriented) | `check` | `check`, with a suggestion where one exists (§4) | Depends on the fund |

Name words, as one explicit list each in `categories.ts`:
- **Debt words:** gilt, SDL, bond, liquid, money market, overnight, "debt". Not "income" (it matches "Income Plus Arbitrage" FoFs, which are `other_lt`), not "G-Sec" or "PSU" (they appear in equity index funds such as "… Nifty … Plus … G-Sec 70:30 Index Fund" and PSU Bank funds). Do **not** reuse `NOT_DOMESTIC_EQUITY` for this: it holds g-sec, gsec, psu and crisil.
- **Commodity words:** gold, silver. **Overseas words:** the existing `OVERSEAS` pattern.
- **Equity index words** (Nifty, Sensex, BSE) or "arbitrage" next to a debt word: the fund stays `check`. So does a name with both a debt and a commodity word.
- Tests use real public AMFI names for each case, including an "Income Plus Arbitrage" FoF and a G-Sec 70:30 equity index fund, both staying `check`.

Saved families: a fund that moves from `check` to `other_lt` or `slab` changes from "slab, no moves" to its true type. It never yields `equity`. This is a correction, and the computed tax can go **up**: today a low-income member's `check` gain sits in the slab bucket and the rebate cancels it; as `other_lt` it gets no rebate. GUARDRAILS §3 asks for "the same or better"; here the honest figure is the better one. The member page says so the first time: "We now know how 2 funds are taxed. Your tax figures may change."

The gold and silver FoF default (and the existing `other_lt` rule for overseas FoFs, already on `main`) gives 12.5% after 24 months to lots bought Apr 2023 to Mar 2025. That depends on CA question 25 (is specified-fund status tested at sale?). If the CA says no, those lots are `slab` and `lotTaxType` gains a second date window. D1a can build the rule now; the CA answer may add that window later.

### 3. Curated overrides (`engine/fund-overrides.json`)

Shape (replaces the documented `{ isin, taxType, listed?, reason, date }`; the file is empty today, so nothing to migrate):

```jsonc
{
  "scheme": "<scheme name as in AMFI, without plan and option>",
  "isins": ["INF…", "INF…"],          // every plan and option of the scheme
  "taxType": "equity" | "other_lt" | "slab",
  "listed": false,                     // optional, as today
  "source": {
    "doc": "SID" | "KIM" | "SAI" | "Factsheet",
    "url": "https://…",
    "section": "Section II, Part III, F. Taxation",
    "read": "2026-11"                 // month the curator read it
  },
  "note": "SID says 'classified as an Equity oriented fund'"
}
```

Rules:
- One entry per scheme: tax type follows the portfolio, which every plan and option of a scheme shares.
- `equity` needs a source that says so in words or shows the 20% short-term rate with a 12-month long-term period. A rate table alone is enough only for a balanced advantage or multi asset fund whose SID also gives a 65% or higher equity floor.
- An entry older than 12 months is still used, and flagged for re-reading (SIDs are updated yearly).
- A test checks the shape, that ISINs are unique across entries, and that every `source.read` is a real month.
- Seed list in the build: the largest schemes in each heading of §2's last row, by number of plan options in NAVAll. The three SIDs FUNDTAX read are the first entries. The seed is never picked from real family files: a public list of the funds a family holds would leak their holdings (GUARDRAILS §4).

When the curated entry and the family's own earlier pick disagree, the family's pick still wins for tax figures, and:
- "Funds to check" also lists such funds (today it lists only `check` funds, so the row would have nowhere to show). The row says: "The fund's SID says Long-term 12.5% (read Nov 2026). Use that?" with one button.
- While a family `equity` pick contradicts a cited non-equity source, the fund's equity-only moves (harvest, use of the ₹1.25 L room) are held back. A wrong pick must not keep unlocking the exemption once the app knows better.

### 4. Suggestions for the funds still unknown

A suggestion is a type plus a short reason. Only these, from the research:

| Fund | Suggest | Reason shown |
|---|---|---|
| Balanced advantage / dynamic asset allocation | none (founder, 28 Nov) | Choices only, until a curated entry exists |
| Domestic FoF, name says ETF and Nifty or Sensex | none | Choices only. Could be split across several ETFs (CA question 22) |
| Other domestic FoF | Long-term 12.5% | "A fund of ordinary equity funds is not taxed as equity." |
| Equity heading, overseas name | Long-term 12.5% | "Funds that invest abroad are not taxed as equity." |
| Multi asset, hybrid ETF or index, life cycle, solution oriented | none | Choices only |

**No suggestion is ever Equity.** The guardrail review showed a one-tap "That's right" turns an equity guess into an applied equity type. Equity comes only from a curated, cited entry or from the family choosing it among the three choices. This follows the founder's decision 3 and extends it from balanced advantage to every heading. No suggestion counts as a source.

### 5. The prompt (`ui/screens/FundsToCheck.tsx`)

- Lists every fund still `check` that the member **holds or sold this tax year** (fixes finding 17c), plus funds whose family pick disagrees with a curated entry (§3). Sold funds read from the realised list.
- With a suggestion: "<fund> · Looks like **Long-term 12.5%**. <reason>" and two buttons: **That's right** and **It's different**. "It's different" opens today's three choices.
- Without one: today's three choices, one line each, and "The fund's SID has a Taxation section that says which."
- Shorter than today (E1 #34): the long help list goes into the buttons' tooltips.
- Wording stays estimate-only; no "recommended".

### 6. Refresh path (`scripts/build-prices.ts`)

The daily build already writes `funds.json` from NAVAll.txt. Add a report step, written to the CI job summary, that never fails the deploy and never edits the overrides file:

- ISINs in `check` headings with no override, counted per heading, with the top 20 scheme names by count of plan options (public data only).
- New AMFI headings not in `KNOWN_AMFI_HEADINGS` (today this is a test failure only when someone runs it).
- Override ISINs no longer in NAVAll (scheme merged or wound up).
- Override entries whose `source.read` is over 12 months old.

A curator turns the report into new entries by hand. A later, optional helper (`scripts/sid-hint.ts`, local only) could fetch one SID PDF from AMFI's site and print the taxation section and whether it says "equity oriented", to speed up curating. Not part of this build.

### 7. Small engine fix

`longTermMonthsFor('check', listed=false)` returns 12. Return 24 for unlisted `check` holdings, so a fund the family has not answered is never shown as long-term early. Tax is unchanged (still slab); only the term label and "becomes long-term on" dates move later.

## Tests (hand-checked where they touch tax)

- Each new category rule, by heading and name word, including the both-words, "Income Plus Arbitrage" FoF and G-Sec 70:30 equity index cases staying `check`.
- A member under the ₹12 L line selling a fund that moved from `check` to `other_lt`: the tax figure rises, with worked rupee figures.
- A family `equity` pick contradicted by a curated `other_lt` entry: the fund is listed in "Funds to check" and gets no harvest moves.
- A saved family with a gold FoF in `check`: after the change it is `other_lt`; gain after 24 months taxed at 12.5% with no exemption; worked rupee figures.
- A family override beats a curated entry; a curated entry beats the category rule; a suggestion changes nothing until confirmed.
- A sold `check` fund appears in the prompt; confirming it re-taxes the booked gain.
- Overrides file shape test.
- Build report: fixture NAVAll with a new heading, a stale entry and an orphan ISIN.

## Build split (tracked in #40 until the build starts)

1. **D1a engine and data:** category defaults (§2), overrides shape and test (§3), engine fix (§7), first curated entries. `status: ready`.
2. **D1b prompt:** suggestions (§4), confirm-only prompt with sold funds (§5). Shares `FundsToCheck.tsx` with C3 #33 (finding 17c); build after C3 or tell C3 to leave 17c to D1b.
3. **D1c build report:** §6. Independent of D1b.

## Decisions (founder, 28 Nov 2026)

1. **Design approved**, including the rule that equity is never applied without a cited source or the family's tap.
2. **Wait for the SEBI text.** D1a does not start until someone reads the SEBI circular itself (No. HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, 26 Feb 2026) and confirms the hybrid bands in FUNDTAX §3. The law-firm note is not enough.
3. **No suggestion for balanced advantage funds.** They show the three choices until a curated entry exists (§4 table updated).
4. **CA questions added** to `docs/research/2026-11-15-questions-for-ca-and-lawyer.md` as questions 21 to 27.
6. **Tightened after approval** by the guardrail review on PR #59, all in the direction of fewer applied types: no "income" debt word and an explicit debt word list (§2); a wrong `slab` named as an anti-goal (rebate); no Equity suggestion anywhere (§4); disagreeing family picks shown and their equity moves held back (§3); the possible tax rise on saved families stated (§2). The founder should glance at these before D1a starts.
5. **Tracking stays in issue #40.** The founder asked for the findings to go into #40; the D1a to D1c split above is recorded there for when the build starts.
