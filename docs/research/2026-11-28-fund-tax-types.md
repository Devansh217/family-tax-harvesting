# Fund tax types: equity oriented, specified MF and holding periods for hybrids, FoFs and ETFs

28 Nov 2026 · FY 2026-27 · Short name for the feature list: **FUNDTAX**

Companion notes: **UNIVERSE** (`2026-11-15-product-universe.md`), **TAX** (`2026-11-15-family-financial-planning.md`).

Labels used for evidence: **Regulator** (Income-tax Act 2025 text, SEBI, SCRA), **Institution** (AMFI, AMC scheme documents), **Practitioner** (law firm notes, tax portals, news), **Opinion** (mine), **Calc** (my arithmetic). Confidence: High / Medium / Low. Anything not read in a primary source is marked **(unconfirmed)** and listed in §7.

**Source status.**
- The Income-tax Act 2025 sections were read on incometaxindia.gov.in (section pages and the "as amended by Finance Act 2026" listing). WebFetch got 403 there, so they were read in the built-in browser.
- The Securities Contracts (Regulation) Act 1956 was read from the IFSCA copy of the bare Act (PDF).
- **sebi.gov.in could not be opened** from this machine (DNS failure in every tool; the archive copy was refused; a GitHub mirror returned 404). The SEBI Feb 2026 circular is therefore described from a law-firm note (ELP) and a taxguru reproduction. Its number and title come from the sebi.gov.in search listing. Every SEBI rule in §2 is Practitioner-sourced and marked **(unconfirmed)** until someone reads the SEBI PDF.
- AMC documents were read in full text: one SID per example, plus one factsheet. The AMFI scheme master CSV and NAVAll.txt were downloaded and inspected.

The app's tax types, for reference (`prototype/src/engine/types.ts`, `tax.ts`):
- `equity`: 20% short-term, 12.5% long-term above Rs 1.25 L, long-term after 12 months.
- `slab`: specified MF, all gains at slab. Lots bought before 1 Apr 2023 become `other_lt`.
- `other_lt`: slab short-term, 12.5% long-term, no exemption. Long-term after 12 months if listed, 24 if unlisted.
- `check`: type not known; the app asks the family.

---

## 1. Summary

1. **Unlisted non-equity units are long-term only after 24 months.** s.2(101) of the 2025 Act sets 24 months as the default. It cuts this to 12 only for listed securities, UTI units, equity oriented fund units and zero-coupon bonds. A gold FoF, an overseas FoF, a balanced hybrid fund, and any fund that fails the 65% test are all unlisted and not equity oriented, so 24 months applies (Regulator, **High**).
2. **Listed ETF units of any kind are long-term after 12 months.** The 2025 Act uses "security" as defined in SCRA s.2(h), and SCRA s.2(h)(id) includes mutual fund units. The 1961 Act said "security (other than a unit)"; the 2025 text drops that carve-out (Regulator, **High** for the text; **Medium** for the conclusion until a CA confirms).
3. **A domestic FoF is equity oriented only in one narrow case.** s.198(8)(i): at least 90% in units of another fund **traded on a recognised stock exchange**, which itself holds at least 90% in listed domestic equity shares. So an FoF of an equity ETF can qualify. An FoF of unlisted equity mutual funds or index funds cannot, and is `other_lt` with a 24-month period (Regulator, **High**). AMFI asked for this to be widened in its Budget 2026-27 suggestions; the Year-2026 text shows it was not.
4. **The equity test is 65% of total proceeds in listed domestic equity shares**, computed as "the annual average of the monthly averages of the opening and closing figures" (s.198(8)). Hedged (arbitrage) shares count by the letter of the Act, because they are still equity shares held. Derivatives and foreign shares do not count (Regulator for the text, **High**; Opinion for the arbitrage reading, **Medium**).
5. **The specified MF test is now "more than 65% in debt and money market instruments"**, or 65% or more in units of such funds, on an annual average of daily closing figures (s.76(5)(b)). The old "not more than 35% in equity" wording is gone. So gold, silver and international funds are no longer specified MFs at transfer under the 2025 Act (Regulator, **High**). Units bought between Apr 2023 and Mar 2025 in those funds are `other_lt`, not `slab` (Opinion, **Medium**; CA question).
6. **SEBI circular:** "Categorization and Rationalization of Mutual Fund Schemes", No. HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, dated 26 Feb 2026. It took effect on issue; existing schemes had 6 months to comply (Practitioner via ELP and taxguru; SEBI text **(unconfirmed)**).
7. **SEBI bands that settle the tax type:** conservative hybrid (10-25% equity) and balanced hybrid (40-60%) can never pass 65%. Aggressive hybrid (65-80%), arbitrage and equity savings (65% minimum) normally pass, but SEBI counts "equity and equity-related", which is not the Act's test. Dynamic asset allocation and multi asset have no SEBI band that decides it (Practitioner, **Medium**).
8. **No dataset gives the tax type.** The AMFI scheme master CSV has category but no tax or equity-share field. The only per-scheme statement is the SID's free-text taxation section, which varies: the quant multi asset SID says "Equity oriented fund"; a Tata balanced advantage SID gives the equity rates without the words; a Tata domestic equity FoF SID gives the non-equity rates (Institution, **High** for those three documents).
9. **Best machine-readable source for a CI build script:** the AMFI scheme master CSV (`portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0`) for code, ISIN, category and launch date, joined to a small hand-kept override table for the `check` categories. The override table cites each scheme's SID taxation section. Monthly portfolio files are per-AMC and not uniform, so they are not a reliable feed for an automatic 65% test.
10. **Recommendation for the engine (Opinion):** keep `check` for dynamic asset allocation, multi asset, hybrid index/ETF, domestic FoF and life-cycle headings. Change the unlisted holding period for these when the family answers "not equity" to 24 months, as `other_lt` already does. Do not guess equity status from the SEBI label.

---

## 2. The Income-tax Act 2025 definitions

### 2.1 Equity oriented fund (s.198(8))

| # | Finding | Evidence |
|---|---|---|
| 1 | An equity oriented fund is a fund set up under a mutual fund scheme specified in Schedule VII (Table Sl. No. 20 or 21). | Regulator, **High** [S1] |
| 2 | Limb (i), funds investing in other funds: at least 90% of total proceeds in units of **another fund that is traded on a recognised stock exchange**, and that other fund invests at least 90% in equity shares of domestic companies listed on a recognised stock exchange. | Regulator, **High** [S1] |
| 3 | Limb (ii), all other funds: at least 65% of total proceeds in equity shares of domestic companies listed on a recognised stock exchange. | Regulator, **High** [S1] |
| 4 | The percentage is "computed with reference to the annual average of the monthly averages of the opening and closing figures". | Regulator, **High** [S1] |
| 5 | s.198 charges long-term gains above Rs 1,25,000 at 12.5% where STT was paid on transfer. s.196 charges short-term gains at 20%. s.196(5) takes the definition from s.198. | Regulator, **High** [S1][S2] |
| 6 | These replace s.112A, s.111A and s.2(42A) of the 1961 Act. The AMFI submission maps s.112A to s.198. | Institution, **High** [S6] |

What counts as equity:
- **Listed domestic equity shares only.** Foreign shares, ADRs, REIT and InvIT units, gold, debt and derivatives do not count. An overseas or global fund that SEBI files as an equity "thematic" scheme fails unless 65% is in Indian listed shares (Regulator, **High**).
- **Hedged and arbitrage positions.** The Act asks what the fund "invests in", not its net exposure. A share held against a short future is still an equity share held. By the letter, arbitrage funds and balanced advantage funds count gross equity. No explicit arbitrage provision exists in s.198. This is the reading AMCs use in their SIDs (Opinion with Institution support, **Medium**; CA question Q3).
- **Monthly-average test.** A fund that is 70% equity at year end but averaged 60% over the year fails. The family cannot check this from a factsheet; only the AMC can state it.

### 2.2 Specified mutual fund (s.76)

| # | Finding | Evidence |
|---|---|---|
| 1 | s.76(2)(a): gains on a unit of a Specified Mutual Fund acquired on or after 1 Apr 2023 are deemed short-term, whatever the holding period. | Regulator, **High** [S3] |
| 2 | s.76(5)(b): a Specified Mutual Fund is one that invests **more than 65%** of its total proceeds in debt and money market instruments, or a fund that invests 65% or more in units of such a fund. | Regulator, **High** [S3] |
| 3 | The percentage uses "the annual average of the daily closing figures". Debt and money market instruments include any securities SEBI classifies or regulates as such. | Regulator, **High** [S3] |
| 4 | The 2023 wording in the 1961 Act was "not more than 35% in equity shares of domestic companies". That wording made gold, international and some hybrid funds specified MFs. It is not in the 2025 text. | Regulator, **High** [S3]; 1961 wording from memory **(unconfirmed)** |

Consequences:
- A debt FoF or liquid FoF (65% or more in debt funds) stays specified: `slab` (High).
- A gold FoF, silver FoF or international FoF is not specified: `other_lt` (High).
- A conservative hybrid holding 75% debt is specified. One holding, say, 60% debt plus 15% gold plus 25% equity is not. SEBI's 75-90% debt band suggests most are specified, but SEBI also allows gold and REITs in the residual. Treat as `slab` with a note (Medium).

### 2.3 Holding periods (s.2(101))

| # | Finding | Evidence |
|---|---|---|
| 1 | (a) A short-term capital asset is one held for **not more than 24 months**. | Regulator, **High** [S4] |
| 2 | (b) The limit is 12 months for: (i) a security listed in a recognised stock exchange in India; (ii) a unit of UTI; (iii) a unit of an equity oriented fund; (iv) a zero coupon bond. | Regulator, **High** [S4] |
| 3 | "Equity oriented fund" has the s.198(8) meaning; "security" has the SCRA s.2(h) meaning. | Regulator, **High** [S4] |
| 4 | SCRA s.2(h)(id): securities include "units or any other such instrument issued to the investors under any mutual fund scheme". | Regulator, **High** [S5] |
| 5 | The 1961 Act clause read "security (other than a unit) listed". The 2025 text has no such carve-out. | Regulator for 2025 text, **High**; 1961 wording from an older page, Medium [S4] |

Answer to the brief's question: **yes, unlisted non-equity units are long-term only after 24 months.** That covers gold FoF, international FoF, a 35-65% hybrid, an FoF of equity mutual funds, and any balanced advantage or multi asset fund that fails the 65% average. Listed ETFs of the same assets are long-term after 12 months.

The section page for s.2(101) is marked "Year 2025". The s.198 page is marked "Year 2026". I did not find a Finance Act 2026 change to s.2(101) **(unconfirmed)**.

### 2.4 Fund of funds, case by case

| FoF type | Limb (i) met? | Limb (ii) met? | Tax type | Long-term after |
|---|---|---|---|---|
| 90%+ in one Nifty or Sensex ETF | Yes | No (holds units, not shares) | `equity` | 12 months |
| 90%+ in unlisted equity MFs or index funds | No (not exchange-traded) | No | `other_lt` | 24 months |
| Split across several equity ETFs (multi-underlying) | Unclear: Act says "another fund" | No | `check` | ask CA |
| Gold ETF or silver ETF FoF | No | No | `other_lt` | 24 months |
| Overseas FoF | No | No | `other_lt` | 24 months |
| Debt or liquid FoF (65%+ in specified MFs) | n/a | n/a | `slab` (s.76) | n/a |
| Asset-allocation FoF (mix of equity, debt, gold funds) | No | No | `other_lt`, or `slab` if 65%+ in debt funds | 24 months |

AMFI's Budget 2026-27 submission says FoFs that invest in equity oriented funds are taxed as non-equity because the FoF limb is restricted to ETFs. It asked for "90% in equity oriented funds" to qualify. It also flagged that "another fund" (singular) is unclear for FoFs holding more than one ETF (Institution, **High** that AMFI said so [S6]). The Year-2026 s.198 text still reads "another fund".

---

## 3. SEBI Feb 2026 categorisation circular

All rows in this section come from the ELP note [S8] and the taxguru reproduction [S9]. The SEBI PDF [S7] could not be opened, so every row is **(unconfirmed)** against the primary text.

### 3.1 Identity and timing

| Item | Value |
|---|---|
| Title | Categorization and Rationalization of Mutual Fund Schemes |
| Number | HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026 |
| Date | 26 Feb 2026 |
| Modifies | Clause 2.6 of the SEBI Master Circular for Mutual Funds of 27 Jun 2024. SIDs from mid-2026 cite a newer Master Circular dated 20 Mar 2026. |
| Effective | On issue. Existing schemes had 6 months to comply (to about 26 Aug 2026). Sectoral and thematic overlap limits have a 3-year glide path. |
| Other changes | Solution-oriented category discontinued. Life Cycle Funds added (Annex B, not read). Multi-underlying FoF framework of 30 Jun 2025 merged in. |

### 3.2 Hybrid and other rules relevant to tax type

| SEBI category | Asset rule (per ELP) | Passes the Act's 65% test? |
|---|---|---|
| Conservative Hybrid | Equity 10-25%, debt 75-90% | **Never.** Usually specified MF (`slab`) |
| Balanced Hybrid | Equity 40-60%, debt 40-60%, no arbitrage | **Never.** `other_lt`, 24 months |
| Aggressive Hybrid | Equity and equity-related 65-80%, debt 20-35% | Usually yes, if the 65% is listed domestic shares on the monthly average |
| Dynamic Asset Allocation (balanced advantage) | Equity and debt managed dynamically; no numeric band | Depends on the fund |
| Multi Asset Allocation | At least 3 asset classes, at least 10% each | Depends on the fund |
| Arbitrage | At least 65% equity and equity-related; debt only short G-secs and G-sec repo | Yes, on gross holdings (see §2.1) |
| Equity Savings | At least 65% equity, net equity 15-40%, at least 10% debt | Yes, on gross holdings |
| FoF (domestic and overseas) | At least 95% in the underlying fund(s) | Only through limb (i), see §2.4 |
| Index funds and ETFs | At least 95% in the index's securities | Domestic equity index: yes. Others: no |

Notes:
- SEBI's percentages are "equity and equity-related instruments" of total assets. That includes derivatives and may include foreign shares. The Act counts only listed domestic shares on a monthly-average basis. So **no SEBI minimum guarantees the tax test**, though 65% minimums make passing very likely (Opinion, **Medium**).
- SEBI caps at 25% and 60% equity do guarantee failure, because the Act's figure cannot exceed the fund's total equity (Opinion, **High**).
- The hybrid residual may hold InvITs (not arbitrage), exchange-traded commodity derivatives, and gold and silver ETFs (Practitioner).

### 3.3 New disclosure duties

- Monthly category-wise portfolio overlap on the AMC website (for sectoral and thematic schemes).
- Equity savings SIDs must state hedged and unhedged exposure, maximum arbitrage and any defensive allocation.
- **No duty to state tax status** was found in either secondary source (Practitioner, Medium).

---

## 4. What AMC documents say

### 4.1 SID taxation sections

Each SID read has a "Section II, Part III, F. Taxation" heading. The same layout across AMCs suggests the SEBI SID format requires a taxation section. The SEBI format itself was not read **(unconfirmed)**. KIM wording was not checked **(unconfirmed)**.

| Example (source only, not a recommendation) | Category | What the taxation section says | Label |
|---|---|---|---|
| Tata Balanced Advantage Fund SID, dated 28 Nov 2025 [S10] | Dynamic Asset Allocation | Asset allocation: equity, equity-related and equity derivatives 65-100%; debt 0-35%; REITs and InvITs 0-10%; unhedged equity up to 80%. Tax table shows long-term 12.5% above Rs 1.25 lakh "provided transfer of such units is subject to STT" and short-term 20%. It does **not** use the words "equity oriented"; it refers to the SAI. | Institution, **High** |
| quant Multi Asset Allocation Fund SID, dated 6 Jul 2026 [S11] | Multi Asset Allocation | Taxation note 3: the scheme "is classified as an 'Equity oriented fund'". Quotes s.198 and shows 12-month long-term periods. | Institution, **High** |
| Tata Multi Sector Passive FOF SID, NFO Jun-Jul 2026 [S12] | "Equity Oriented FOF (Domestic) Sectorial FOF" | Invests 95-100% in passive domestic equity index funds or ETFs. Its tax section is titled "Taxation for other than Equity Oriented Mutual Fund Schemes": long-term 12.5% for units held more than 24 months, short-term at slab. | Institution, **High** |

Lessons:
- **SEBI's "Equity Oriented FOF" label is not the tax status.** The Tata FoF above is named equity oriented by SEBI category and taxed as non-equity by its own SID.
- **Wording varies.** One SID states the status in words, one implies it through the rate table, one states the opposite. A parser needs both the "equity oriented" phrase and the rate table (20% short-term, 12-month long-term) as signals.
- **SIDs are updated once a year or on change.** A fund can move across the 65% line during the year; the SID will not show that.

### 4.2 Factsheets

- The Tata Multi Asset Allocation Fund factsheet for Oct 2026 [S13] gives NAV, benchmark (65% BSE 200 TRI + 15% short-term bond + 20% commodity index), top holdings and a link to "Allocation of Net Asset by Asset Class". No gross or net equity figure appears in the text layer (Institution, **High** for this one factsheet).
- Factsheet practice across AMCs was not surveyed. Some AMCs show "net equity" and "hedged equity" for balanced advantage funds **(unconfirmed)**. Either way a month-end figure is not the Act's annual average.

---

## 5. Machine-readable sources for a CI build script

| Source | URL | Format | Tax type or equity share? | Update | Limits |
|---|---|---|---|---|---|
| AMFI scheme master | `https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0` | CSV, about 4 MB. Columns: AMC, Code, Scheme Name, Scheme Type, Scheme Category, Scheme NAV Name, Scheme Minimum Amount, Launch Date, Closure Date, ISIN Div Payout/ISIN Growth, ISIN Div Reinvestment | No. Category only | Daily (observed) | No tax field. Category strings are SEBI labels, not tax status. Undocumented endpoint |
| AMFI NAVAll.txt | `https://www.amfiindia.com/spages/NAVAll.txt` | Semicolon text; category headings as section lines | No | Daily | Same as above; the app already parses its headings |
| AMFI portfolio disclosure page | `https://www.amfiindia.com/online-center/portfolio-disclosure` | Links out to each AMC's site | Equity share could be derived from holdings | Monthly, fortnightly for debt | Each AMC uses its own file layout; month-end only, not the annual monthly average |
| SID PDFs | `https://portal.amfiindia.com/spages/NNNNN.pdf` | PDF | Yes, as free text in section F | On change | PDF parsing; wording varies (§4.1); new schemes only for some codes |
| mfapi.in | `https://api.mfapi.in/mf` | JSON | No | Daily | Unofficial mirror of AMFI NAVs (Practitioner) |
| RTA (CAMS, KFintech), BSE StAR MF, NSE NMF masters | n/a | n/a | Unknown | n/a | Need distributor or member login **(unconfirmed)** |

Conclusion (Opinion, **Medium**):
- No free public dataset carries an equity-oriented flag or a tax category.
- The practical build is: AMFI scheme master for the universe, then a checked-in override file keyed by AMFI code for the `check` headings, each row citing the SID page and date. A CI step can flag new codes in `check` headings that lack an override.
- Do not compute the 65% test from monthly portfolios in CI. The formats differ by AMC, and a month-end snapshot is not the legal measure.

---

## 6. Conclusion per AMFI heading (today `check` or `other_lt`)

"Today" is what `prototype/src/engine/categories.ts` returns. "Proposed" is Opinion based on §2-§4.

| AMFI heading (as matched today) | Today | Proposed tax type | Long-term after | Confidence |
|---|---|---|---|---|
| Hybrid - Dynamic Asset Allocation / Balanced Advantage | `check` | Keep `check`. Most hold 65-100% gross equity and state equity rates in the SID, but SEBI sets no floor | 12 if equity, else 24 | Medium |
| Hybrid - Multi Asset Allocation | `check` | Keep `check`. Some SIDs say equity oriented (quant); many hold under 65% Indian equity | 12 if equity, else 24 | Medium |
| Hybrid - Balanced Hybrid | `other_lt` | `other_lt` (40-60% equity cannot pass) | 24 | **High** |
| Hybrid - Conservative Hybrid | `slab` | `slab` if over 65% debt (the usual case); `other_lt` if gold or REITs push debt below that | n/a or 24 | Medium |
| ETFs - Gold ETF, Silver ETF | `other_lt` | `other_lt`; listed security | 12 | **High** |
| ETFs - ETFs investing overseas | `other_lt` | `other_lt`; listed security | 12 | **High** |
| ETFs - Hybrid ETF | `check` | `check`: `slab` if over 65% debt, else `other_lt`; equity only if 65% listed domestic shares | 12 | Medium |
| Other ETFs and Equity ETFs that are not domestic equity (by name) | `check` | Debt-like: `slab` if over 65% debt. Commodity or overseas: `other_lt` | 12 | Medium |
| Index Funds - Hybrid | `check` | `check`; unlisted, so 24 if not equity | 12 or 24 | Medium |
| Index Funds that are not domestic equity (global, gold) | `check` | `other_lt` | 24 | **High** |
| Other Scheme - FoF Domestic / Fund of Funds Scheme (Domestic) | `check` | Keep `check` with four answers: equity (90%+ in one domestic equity ETF), slab (debt or liquid FoF), other (gold, silver, FoF of equity MFs, asset allocation) | 12 / n/a / 24 | **High** for the rules, per-fund answer needed |
| Other Scheme - FoF Overseas | `other_lt` | `other_lt` | 24 | **High** |
| Equity headings whose name matches overseas | `check` | `other_lt` unless 65% Indian listed shares on average | 24 | Medium |
| Life Cycle Funds headings (no rule matches; fall to `check`) | `check` | Keep `check`; glide paths move funds across 65% over time, so recheck yearly | 12 or 24 | Low |
| Solution Oriented - Retirement / Children's (legacy headings) | `check` (via no rule) | Depends on the fund's asset allocation | 12 or 24 | Low |

Engine points to raise as issues (not changed here):
- `longTermMonthsFor` returns 12 for `check`. For an unlisted `check` holding this is the optimistic answer. A safer default is 24 until the family answers.
- `lotTaxType` (`tax.ts`) only turns `slab` into `other_lt` for lots bought before 1 Apr 2023; it never touches a gold or overseas FoF, which are `check` or `other_lt`. The open point is the opposite: if specified-fund status is tested at purchase (CA question Q5), lots of those funds bought 1 Apr 2023 to 31 Mar 2025 should be `slab`, not `other_lt`. (Corrected after the guardrail review.)

---

## 7. Open items

### 7.1 Unconfirmed

1. The SEBI circular text and annexures on sebi.gov.in (could not be reached). All of §3 rests on ELP and taxguru.
2. The clause numbers in the SEBI Master Circular of 20 Mar 2026.
3. Whether the SEBI SID and KIM formats mandate a taxation section, and its required wording.
4. The SEBI-mandated monthly portfolio disclosure format (spreadsheet layout and deadline).
5. Whether the Finance Act 2026 amended s.2(101) (page marked Year 2025).
6. The 1961 Act's exact 2023 specified MF wording and the "security (other than a unit)" wording, quoted here from memory and an older page.
7. How factsheets across AMCs show gross versus net equity.
8. Access terms for RTA, BSE StAR MF and NSE NMF scheme masters.
9. Life Cycle Funds asset rules (Annex B of the circular).

### 7.2 Questions for a CA

- Q1. Is a listed gold, silver or overseas ETF unit a "security listed in a recognised stock exchange" under s.2(101)(b)(i), so long-term after 12 months?
- Q2. Does an FoF that splits 90%+ across two or more domestic equity ETFs meet s.198(8)(i), given the words "another fund"?
- Q3. For the 65% test, do shares held against short futures (arbitrage) count in full?
- Q4. If a balanced advantage or multi asset fund's SID says equity oriented but its annual average falls under 65%, which treatment applies to the investor, and who bears the error?
- Q5. A gold FoF unit bought in Jun 2024 and sold in Dec 2026: is it governed by s.76 (deemed short-term) or by s.2(101) (long-term after 24 months)? In other words, is specified MF status tested at transfer under the 2025 wording?
- Q6. A conservative hybrid holding 70% debt, 10% gold and 20% equity: specified MF or not?
- Q7. Is STT charged on redemption of an equity FoF unit, as s.198 requires for the 12.5% rate?

---

## 8. Sources

| # | Source | Label | Confidence |
|---|---|---|---|
| S1 | Income-tax Act 2025, s.198 (page marked Year 2026). https://www.incometaxindia.gov.in/w/section-198-78 (read Nov 2026) | Regulator | **High** |
| S2 | Income-tax Act 2025, s.196. https://www.incometaxindia.gov.in/w/section-196-76 (read Nov 2026) | Regulator | **High** |
| S3 | Income-tax Act 2025, s.76. https://www.incometaxindia.gov.in/w/section-76-106 (read Nov 2026) | Regulator | **High** |
| S4 | Income-tax Act 2025, s.2 (clause 101, page marked Year 2025). https://www.incometaxindia.gov.in/w/section-2-1 ; Act listing as amended by Finance Act 2026: https://www.incometaxindia.gov.in/web/guest/income-tax-act-202511 (read Nov 2026) | Regulator | **High** |
| S5 | Securities Contracts (Regulation) Act 1956, s.2(h)(id), IFSCA copy. https://www.ifsca.gov.in/Document/Legal/75-the-securities-contracts-regulation-act-195612092020035255.pdf (read Nov 2026) | Regulator | **High** |
| S6 | AMFI, Suggestions for Union Budget 2026-27. https://www.amfiindia.com/uploads/Suggestions_Union_Budget2026_27_cf01baf81e.pdf (read Nov 2026) | Institution | **High** |
| S7 | SEBI circular HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, 26 Feb 2026. https://www.sebi.gov.in/legal/circulars/feb-2026/categorization-and-rationalization-of-mutual-fund-schemes_99983.html ; PDF https://www.sebi.gov.in/sebi_data/attachdocs/feb-2026/1772079826878.pdf (could not be opened, Nov 2026) | Regulator | not read |
| S8 | ELP, "SEBI's Revised Categorisation and Rationalisation of Mutual Fund Schemes", Mar 2026. https://elplaw.in/wp-content/uploads/2026/03/SEBIs-Revised-Categorisation-and-Rationalisation-of-Mutual-Fund-Schemes.pdf (read Nov 2026) | Practitioner | Medium |
| S9 | taxguru reproduction of the SEBI circular. https://taxguru.in/?p=1028699 (read Nov 2026) | Practitioner | Medium |
| S10 | Tata Balanced Advantage Fund SID, 28 Nov 2025. https://www.tatamutualfund.com/system/files/2025-12/Tata%20Balanced%20Advantage%20Fund-SID_0.pdf (read Nov 2026) | Institution | **High** |
| S11 | quant Multi Asset Allocation Fund SID, 6 Jul 2026. https://quantmutual.com/Admin/SIDPdf/SID_quant_Multi_Asset_Allocation_Fund_March_2026.pdf (read Nov 2026) | Institution | **High** |
| S12 | Tata Multi Sector Passive FOF SID (AMFI-hosted). https://portal.amfiindia.com/spages/14491.pdf (read Nov 2026) | Institution | **High** |
| S13 | Tata Multi Asset Allocation Fund factsheet, Oct 2026. https://www.tatamutualfund.com/system/files/2026-11/Tata%20Multi%20Asset%20Allocation%20Fund_1.pdf (read Nov 2026) | Institution | **High** |
| S14 | AMFI scheme master CSV. https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0 (downloaded Nov 2026) | Institution | **High** |
| S15 | AMFI NAVAll.txt. https://www.amfiindia.com/spages/NAVAll.txt (read Nov 2026) | Institution | **High** |
| S16 | AMFI portfolio disclosure page. https://www.amfiindia.com/online-center/portfolio-disclosure (read Nov 2026) | Institution | **High** |
| S17 | mfapi.in. https://api.mfapi.in/mf (not fetched this session; known public mirror) | Practitioner | Low |
