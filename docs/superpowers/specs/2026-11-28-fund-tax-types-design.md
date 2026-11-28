# Fund tax types from sources, not user picks (design)

28 Nov 2026. Issue #40 (D1). Research: `docs/research/2026-11-28-fund-tax-types.md` (**FUNDTAX**). Fresh-run notes: "Fund tax types shouldn't be asked of users" and finding 17c ("a sold ETF needs checking but there's no Pick"). **Status: waiting for the founder's approval.** Nothing here is built.

## Why

Today the member page's "Funds to check" asks the family to pick Equity, Long-term 12.5% or Slab for balanced advantage, multi asset, domestic fund-of-funds and a few other headings. Families can't be expected to know this. Until they pick, the fund's gains are taxed at slab and it gets no moves. A sold fund in the same state can't be picked at all.

## What the research settled

- **No free dataset states a fund's tax type.** AMFI's NAVAll.txt and scheme master give the SEBI category only. The one per-scheme statement is the taxation section of the scheme's SID, in free text that varies by AMC (FUNDTAX §4, §5).
- **SEBI's label is not the tax status.** The Act's test is 65% in listed Indian shares on an annual average of monthly figures (s.198(8)). SEBI's bands use "equity and equity-related". A SID for a fund SEBI calls an "Equity Oriented FOF" taxes it as non-equity (FUNDTAX §4.1).
- **Some headings are settled by the bands.** Conservative hybrid (25% equity cap) and balanced hybrid (60% cap) can never be equity. Gold, silver and overseas funds are never equity (FUNDTAX §3.2, §6).
- **Domestic FoFs are equity only in one narrow case:** 90% or more in one exchange-traded fund that holds 90% or more in listed Indian shares (s.198(8)(i)). An FoF of ordinary equity funds is `other_lt` (FUNDTAX §2.4).
- **Holding periods are right in the engine today.** Unlisted non-equity units are long-term after 24 months (s.2(101)); listed ETFs of any asset after 12 months. `otherLongTermMonths: 24` stays (FUNDTAX §2.3).
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

- **A fund marked `equity` that the family did not confirm and no cited source supports.** Equity is the only type that unlocks the ₹1.25 L exemption and harvest moves, so a wrong `equity` is the one mistake that can create tax (GUARDRAILS §1). Every other wrong answer only hides moves.
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
| Index Funds, not domestic equity by name: debt words (gilt, SDL, bond, liquid, money market) | `check` | `slab` | Debt index funds hold over 65% debt (High) |
| Other ETFs / Equity ETF, not domestic equity: gold, silver, overseas words | `check` | `other_lt`, listed | Same, listed (High) |
| Other ETFs / Equity ETF, not domestic equity: debt words | `check` | `slab`, listed | Same (High) |
| FoF Domestic, name has gold or silver | `check` | `other_lt`, unlisted | Holds commodity ETFs (High) |
| FoF Domestic, name has liquid, debt, gilt, bond, money market, income | `check` | `slab`, unlisted | 65%+ in specified funds (High) |
| Everything else now `check` (balanced advantage, multi asset, hybrid ETF and index, other FoF Domestic, overseas-named equity, life cycle, solution oriented) | `check` | `check`, with a suggestion where one exists (§4) | Depends on the fund |

Name words reuse the existing `OVERSEAS` and `NOT_DOMESTIC_EQUITY` patterns in one place, with a test per heading and per word. A fund whose name matches both a debt and a commodity word stays `check`.

Saved families: a fund that moves from `check` to `other_lt` or `slab` changes from "slab, no moves" to its true type. That can only add correct moves (`other_lt` long-term at 12.5%) or keep slab. It never yields `equity`, so it cannot create tax. The member page shows a one-line note the first time ("We now know how 2 funds are taxed").

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

When the curated entry and the family's own earlier pick disagree, the family's pick still wins, and the fund row says: "The fund's SID says Long-term 12.5% (read Nov 2026). Use that?" with one button.

### 4. Suggestions for the funds still unknown

A suggestion is a type plus a short reason. Only these, from the research:

| Fund | Suggest | Reason shown |
|---|---|---|
| Balanced advantage / dynamic asset allocation | Equity | "Most of these hold 65% or more in Indian shares. The fund's SID says for sure." |
| Domestic FoF, name says ETF and Nifty or Sensex | Equity | "Funds that put 90% in one Indian share ETF are taxed as equity." |
| Other domestic FoF | Long-term 12.5% | "A fund of ordinary equity funds is not taxed as equity." |
| Equity heading, overseas name | Long-term 12.5% | "Funds that invest abroad are not taxed as equity." |
| Multi asset, hybrid ETF or index, life cycle, solution oriented | none | Choices only |

Equity suggestions still need the confirm tap. No suggestion counts as a source.

### 5. The prompt (`ui/screens/FundsToCheck.tsx`)

- Lists every fund still `check` that the member **holds or sold this tax year** (fixes finding 17c). Sold funds read from the realised list.
- With a suggestion: "<fund> · Looks like **Equity**. <reason>" and two buttons: **That's right** and **It's different**. "It's different" opens today's three choices.
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

- Each new category rule, by heading and name word, including the both-words case staying `check`.
- A saved family with a gold FoF in `check`: after the change it is `other_lt`; gain after 24 months taxed at 12.5% with no exemption; worked rupee figures.
- A family override beats a curated entry; a curated entry beats the category rule; a suggestion changes nothing until confirmed.
- A sold `check` fund appears in the prompt; confirming it re-taxes the booked gain.
- Overrides file shape test.
- Build report: fixture NAVAll with a new heading, a stale entry and an orphan ISIN.

## Proposed build issues (opened after approval)

1. **D1a engine and data:** category defaults (§2), overrides shape and test (§3), engine fix (§7), first curated entries. `status: ready`.
2. **D1b prompt:** suggestions (§4), confirm-only prompt with sold funds (§5). Shares `FundsToCheck.tsx` with C3 #33 (finding 17c); build after C3 or tell C3 to leave 17c to D1b.
3. **D1c build report:** §6. Independent of D1b.

## Questions for the founder

1. **Approve the design?** In particular the rule that equity is never applied without a cited source or the family's tap.
2. **SEBI text:** start D1a before anyone reads the SEBI circular itself (the bands rest on a law-firm note), or wait?
3. **Balanced advantage suggestion:** suggest Equity (most are), or show no suggestion until a curated entry exists?
4. **CA questions** in FUNDTAX §7.2 (seven of them): add to `docs/research/2026-11-15-questions-for-ca-and-lawyer.md`?
