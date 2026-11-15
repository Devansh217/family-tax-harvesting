# Behaviour and explanation: getting families to understand, trust and act

15 Nov 2026 · FY 2026-27 · Research agenda topic 10 · Short name for the feature list: **NUDGE**

Companion notes: **GOAL** (`2026-11-15-goal-based-planning.md`, probability wording §2.3), **TAX** (`2026-11-15-family-financial-planning.md`, ₹12 L cliff), **SELL** (`2026-11-15-tax-aware-selling-rebalancing.md`), **PLACE** (`2026-11-15-family-asset-placement.md`, gifts), **RISK** (`2026-11-15-risk-profiling.md`, SEBI IA rules), **DEBT**. Design rules in `docs/DESIGN.md` ("Quiet ledger") still apply; this note adds to them and changes none.

Labels used for evidence: **Paper** (peer-reviewed or working paper), **Regulator** (SEBI, CCPA, RBI text), **Institution** (Morningstar, Vanguard, AMFI, industry body), **Practitioner** (press, law firms, planners), **Opinion** (mine). Confidence: High / Medium / Low.

---

## 1. Summary

1. **The app's job is to close the gap between "knows" and "does".** Families rarely fail because the plan is wrong; they fail by delaying, by stopping SIPs after a fall, by selling winners and keeping losers, and by trading too much. Each has strong evidence and a matching design response (§2.1).
2. **Inertia is the strongest force, so whatever the app pre-fills becomes the plan.** Defaults moved 401(k) enrolment from 49% to 86% (Madrian & Shea) and pre-committed step-ups took savings from 3.5% to 13.6% (Save More Tomorrow). The same inertia kept people at a poor default. Pre-fill only numbers the engine would defend.
3. **Label money by goal, and keep the family to one headline goal at a time.** Earmarking with a visual cue raised savings among Indian labourers (Soman & Cheema); one goal saved more than several, unless the several were framed as serving one common goal (Soman & Zhao). Reminders that named the goal raised savings by 16%, generic ones did nothing (Karlan et al.).
4. **Deadlines beat nagging.** Odean found US investors drop the disposition effect only in December, the tax deadline. India's 31 March lapse is the app's one honest urgency; use it fully and invent no other.
5. **Reminders work best when they name the goal and ask for a date.** Asking people to write down a date and time raised flu vaccination by 4.2 points (Milkman et al.). For harvesting, the date pair is "sell Tuesday, buy back Wednesday".
6. **Show probability as frequencies and ranges, never as a single number.** "7 in 10 market paths" is understood better than "70%" (Gigerenzer & Hoffrage); always pair it with the bad-case rupee gap and the lever that closes it (GOAL §2.3, Kitces).
7. **Show tax savings in rupees, never as a percentage of the portfolio.** People value the same rupee saving less when it is a small share of a large sum (Tversky & Kahneman). "Saves ₹16,250" beats "0.4% of portfolio".
8. **"Why this" explanations help calibrated trust more than raw uptake.** Feature-based explanations raised adoption and softened the drop after an error (Ben David et al.); a 2026 pension experiment found rationales did not change how much advice people followed (Choi et al.). Build the explain sheet for trust and to repair it after errors, and test whether it changes action.
9. **The guardrails are already in Indian law.** SEBI's IA advertisement code bans implied assured, minimum or target returns, superlatives, unverified past performance, and games or prizes. CCPA's 2023 guidelines name 13 dark patterns, including false urgency, confirm shaming and nagging. SEBI's Common Advertisement Code (board-approved 24 Sep 2026) keeps those bans and adds dark patterns.
10. **Notification policy: one monthly digest plus a small set of dated alerts with a rupee floor, no market-move alerts, no streaks.** Track "acted on" by matching the next statement import to each move; measure rupees realised, not taps.

---

## 2. Findings with citations

### 2.1 Behavioural finance: why families do not act, or act badly

| # | Finding | Evidence | Label |
|---|---|---|---|
| B1 | **Defaults and inertia.** Automatic 401(k) enrolment raised participation from 49% to 86% for new hires, but most stayed at the default 3% contribution and default money-market fund, below what they chose before. Inertia makes defaults powerful in both directions. | Madrian & Shea 2001, *QJE* 116(4):1149–1187 | Paper, High |
| B2 | **Pre-commitment to future increases (Save More Tomorrow).** Employees agreed now to raise saving at each future pay rise; about 78% joined, and their saving rate rose from 3.5% to 13.6% over 40 months. Works because the cost lands later and with a raise, so it never feels like a loss. | Thaler & Benartzi 2004, *JPE* 112(S1):S164–S187 | Paper, High |
| B3 | **Earmarking plus a visual cue raises saving.** Among low-income construction labourers in rural India, savings put in envelopes with a picture of the household's children, and split across two envelopes, were spent less. Partitioning creates a "pause" before spending. | Soman & Cheema 2011, *JMR* 48(SPL):S14–S22 ([SSRN abstract](https://ssrn.com/abstract=1732709)) | Paper, High (direction); Medium (effect sizes, not checked against the paper) |
| B4 | **One goal beats many.** In an Indian field study (83 households, six months), a single goal with an envelope saved about three times the control's 3.5% of income; adding more goals lowered saving. Several goals framed as serving one common goal did as well as a single goal. | Soman & Zhao 2011, *JMR* 48(6), via [World Bank Development Impact](https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings) | Paper, Medium |
| B5 | **Reminders work when they name the goal.** Monthly reminders raised savings 6%; in Peru, where accounts were labelled with a future purchase, reminders naming it raised savings 16% and generic ones had no effect. Goal plus incentive messages worked best; gain vs loss framing made no difference. | Karlan, McConnell, Mullainathan & Zinman 2016, *Management Science* 62(12) ([NBER summary](https://img.nber.org/conferences/2010/SI2010/SAV/Executive%20Summary%20--%20Getting%20to%20the%20Top%20of%20Mind%20-.pdf)) | Paper, High |
| B6 | **Implementation intentions.** A reminder mail asking employees to write down the date and time they would get a flu shot raised vaccination by 4.2 percentage points at no extra cost. | Milkman, Beshears, Choi, Laibson & Madrian 2011, *PNAS* 108(26) ([PubMed](https://pubmed.ncbi.nlm.nih.gov/21670283/)) | Paper, High |
| B7 | **Social commitment inside Indian villages.** Letting a savings "monitor" from the person's village see progress raised total savings by 35% on average, more with central, well-connected monitors. | Breza & Chandrasekhar 2019, *Econometrica* 87(1) ([NBER w21169](https://www.nber.org/papers/w21169)) | Paper, High |
| B8 | **Disposition effect.** Investors sold gains about 1.5 times as readily as losses; the winners they sold beat the losers they kept by 3.4% over the next year. The effect vanished in December, the tax deadline. Seen in Finland, China, Australia and Indian market-level data; costly and stable per person (Seru et al. put the cost at 3.2–5.7%). | Odean 1998, *J. Finance* 53(5); review in Kaustia ([Aalto](https://www.aalto.fi/sites/default/files/2018-12/disposition_effect.pdf)) | Paper, High |
| B9 | **Overtrading.** US households that traded most earned 11.4% a year against a market of 17.9% (1991–96), mainly through costs. | Barber & Odean 2000, *J. Finance* 55(2) "Trading is hazardous to your wealth" | Paper, High |
| B10 | **Indian F&O losses and persistence.** 93% of over 1 crore individual F&O traders lost money in FY22–FY24, average ₹2 L each, aggregate over ₹1.8 lakh crore; more than 75% of loss-makers kept trading after two loss years. | [SEBI press release, 23 Sep 2024](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html) | Regulator, High |
| B11 | **The investor return gap.** US fund investors earned 8.7% a year against funds' 9.9% (10 years to 2025), a 1.2-point gap; the gap was 0.4 points for the least volatile funds and over 2 points for the most volatile. Systematic investing and automated rebalancing narrow it. **Contested:** a 2026 FAJ paper re-estimates the timing cost at about 0.10% a year on the same data. No Indian edition found. | [Morningstar Mind the Gap 2026](https://www.morningstar.com/business/insights/research/mind-the-gap); Fulkerson, Jordan, Riley & Yan 2026, [*FAJ* 82(3)](https://rpc.cfainstitute.org/research/financial-analysts-journal/2026/bad-timing-does-not-cost-investors-funds-returns) | Institution, Medium (size of gap is disputed; direction for volatile funds is not) |
| B12 | **SIP stoppages.** AMFI's stoppage ratio (SIPs stopped or matured per new SIP) reached 116.7% in Oct 2026 (59.12 lakh stopped vs 50.68 lakh new), from 78.5% in Sep. The ratio counts completed tenures and was distorted by a 2025 folio clean-up, so it is noisy evidence of panic stopping. | [Mint, Nov 2026](https://www.livemint.com/market/stock-market-news/sip-stoppage-ratio-october-2026-hits-18-month-high-amfi-data-11794386284354.html); [Value Research](https://www.valueresearchonline.com/learn/mutual-funds/amfi-sip-inflows-data-explained-five-distinctions/) | Practitioner (AMFI data via press), Medium |
| B13 | **Why Indian investors quit.** Among "lapsers", 84% cite poor performance (lower than expected returns 28%, volatility 26%, significant losses 26%), and **32% cite negative experiences shared by friends or family**. 59% gather information from friends, family and colleagues, 56% from finfluencers, 25% from professionals. Nearly 8 in 10 prefer risk-free returns. Only 9.5% of households (3.21 crore) hold securities-market products. | [SEBI Investor Survey 2025](https://www.sebi.gov.in/sebi_data/commondocs/jan-2026/Investor%20Survey%202025%20Main%20Report.pdf), Table 10.2, Fig 9.1 | Regulator, High |
| B14 | **Behavioural coaching is the largest single source of advice value**, Vanguard estimates: 0 to over 200 basis points a year, 150 bp in its central case, mainly by preventing panic selling and performance chasing. A model estimate, not a measured effect. | [Vanguard Advisor's Alpha](https://www.vanguard.ca/content/dam/intl/americas/canada/en/documents/gas/quantifying-your-value-to-clients-advisor.pdf) | Institution, Medium |

**Implications for this app.** The family acts outside the app, so the costs of acting (open the broker app, find the fund, remember the next-day buyback) all fall on the Family CFO. Present bias says shrink each move to one step per member with a date (B6). Inertia says pre-fill amounts carefully (B1, B2). Earmarking says tie each SIP to a named goal (B3–B5). Loss aversion says the app's main value in a fall is not suggesting moves but keeping the SIPs running (B11–B14). Overtrading says every suggestion must clear a rupee floor after costs (B9, B10). Family influence cuts both ways (B7, B13): a family member who sees the plan can help keep it, and one with a bad story can end it.

### 2.2 Communicating risk and probability

| # | Finding | Evidence | Label |
|---|---|---|---|
| R1 | **Natural frequencies beat percentages.** People solved Bayesian problems correctly 46% of the time with frequencies ("10 in 1,000") against 16% with probabilities. | Gigerenzer & Hoffrage 1995, *Psychological Review* 102(4) | Paper, High |
| R2 | **Show the spread, not a line.** The Bank of England has published inflation projections as fan charts since 1996 so that readers see that the central path is one of many. Spiegelhalter et al. recommend several formats together and warn that a single best guess is read as a forecast. | Britton, Fisher & Whitley 1998, *BoE Quarterly Bulletin*; Spiegelhalter, Pearson & Short 2011, *Science* 333(6048) | Institution / Paper, High |
| R3 | **Probability alone hides how bad the bad case is.** Show the size of the shortfall in rupees and the adjustment that fixes it; call a miss "a mid-course adjustment", not a failure. | Kitces, three posts cited in GOAL §2.3 | Opinion, High |
| R4 | **A single assumed return gives about even odds** (GOAL §2.3), so a projection with one line is quietly a coin toss. | GOAL, DATA | Paper/Opinion, High |
| R5 | **False precision erodes trust.** With 2,000 paths, a probability near 75% has a standard error of about 1 point (GOAL §3.4), so "73.4%" claims precision the model lacks, and the inputs (returns, inflation) are far less certain than that. | GOAL §3.4; Opinion | Opinion, High |

### 2.3 Explaining recommendations ("why this")

| # | Finding | Evidence | Label |
|---|---|---|---|
| X1 | In an incentivised game, accuracy-based explanations raised early adoption of an AI financial adviser, and feature-based or accuracy-based explanations cut the drop in adoption after the model erred. People paid more for explained AI advice. | Ben David, Resheff & Tron 2021 ([arXiv 2101.02555](https://arxiv.org/abs/2101.02555)) | Paper (working), Medium |
| X2 | A single error caused a sharp fall in trust in an AI financial adviser; an explanation after the error restored it, sometimes above the starting level. | Han & Ko 2025, *Behavioral Sciences* 15(10):1370 | Paper, Medium |
| X3 | In a Korean pension experiment (400 adults), about 37% of the recommended change passed into final portfolios; 81% revised, and among revisers 95% moved toward the advice. **A short rationale did not change pass-through.** | Choi et al. 2026 ([arXiv 2608.11371](https://arxiv.org/abs/2608.11371)) | Paper (working), Medium |
| X4 | Self-reported trust and actual reliance are different things; measure behaviour, not survey trust. | Spillner et al. 2026 ([arXiv 2603.05229](https://arxiv.org/abs/2603.05229)) | Paper (working), Medium |

**Reading.** The evidence supports "why this" for trust and for recovering from mistakes (the app will be wrong sometimes: a stale NAV, a lot it could not see). It does not show that a rationale by itself makes people act. Action comes from the reminder, date and one-step design in §2.1. DESIGN.md's "show the arithmetic" principle is right and should stay a tap away, not in the way.

### 2.4 Framing tax savings

| # | Finding | Evidence | Label |
|---|---|---|---|
| T1 | **Relative thinking.** People drive across town to save $5 on a $15 item but not on a $125 item. A saving shown as a share of a large portfolio feels smaller than the same rupees shown alone. | Tversky & Kahneman 1981, *Science* 211(4481) | Paper, High |
| T2 | **Gain vs loss framing of the same message made no difference** to saving in the reminder trials; naming the goal and the incentive did. | Karlan et al. 2016 (B5) | Paper, High |
| T3 | **Deadlines overcome the disposition effect**: losses were realised in December (B8). India's 31 March lapse of each member's ₹1.25 L exemption is a real, dated loss of value. | Odean 1998; SELL §2.4 | Paper, High |
| T4 | The cliffs and gifts that need simple explanation: harvesting ₹1 L instead of ₹75,000 in a salaried spouse near ₹12 L costs ₹26,000 (feature list §2.5); ₹1 L more gains can cost ₹61,750 (TAX §4.2 ex. 3). A gift to a relative is tax-free but irrevocable; clubbing brings spouse and minor-child income back to the giver. | TAX, PLACE, ARCH | Regulator text via TAX, High |

### 2.5 Regulation of nudges and communications

| # | Rule | Source | Label |
|---|---|---|---|
| G1 | **SEBI IA advertisement code** (circular of 5 Apr 2023, now para 10 of the IA Master Circular of 27 Jun 2025). An advertisement must not contain: false, misleading or deceptive statements, "based on assumptions or projections"; misleading testimonials; anything exploiting investors' lack of experience; heavy jargon; "free" unless it is truly free and without condition; any promise of assured or risk-free return, nor imply "assured returns or minimum returns or target return or percentage accuracy"; unfair comparisons with other intermediaries; past performance unless verified by PaRRVA; superlatives ("Best", "No. 1"); the SEBI logo. IAs must not run games, leagues or competitions with prizes. Mandatory standard warning, unchanged wording: "Investment in securities market are subject to market risks. Read all the related documents carefully before investing." Plus: "Registration granted by SEBI … in no way guarantee performance". | [SEBI circular](https://www.sebi.gov.in/legal/circulars/apr-2023/advertisement-code-for-investment-advisers-ia-and-research-analysts-ra-_69798.html); [Master Circular text](https://avantiscdnprodstorage.blob.core.windows.net/legalupdatedocs/44017/SEBI-issued-Master-Circular-for-Investment-Advisers-JUN272025.pdf) | Regulator, High |
| G2 | **AI disclosure.** IA Reg 18(9): disclose to the client the extent of AI tool use in advice, at agreement and when it changes. | IA Master Circular §1.xii | Regulator, High |
| G3 | **SEBI Common Advertisement Code**, approved by SEBI's board on 24 Sep 2026 (consultation 23 Jun 2026), covering brokers, DPs, IAs, RAs, PMS, MFs. Keeps the bans on assured returns and misleading past performance and prohibits dark patterns; allows advertising PaRRVA ratings. Circular text not yet read. | [Lexology (L&S), Oct 2026](https://www.lexology.com/library/detail.aspx?g=4da300d3-97dc-45b6-a077-90a1ba5d1bda) | Practitioner, Medium |
| G4 | **Finfluencers.** SEBI (board decision Jun 2024, regulations Aug 2024) bars registered entities and their agents from associating with unregistered persons who give advice or make return claims; no money, referral or client-data sharing with them. | [SEBI board memo, Jul 2024](https://www.sebi.gov.in/sebi_data/meetingfiles/jul-2024/1719916854117_1.pdf) | Regulator, High |
| G5 | **CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023** (notified 30 Nov 2023, Consumer Protection Act s.18). 13 specified patterns: false urgency, basket sneaking, confirm shaming, forced action, subscription trap, interface interference, bait and switch, drip pricing, disguised advertisement, nagging, trick question, SaaS billing, rogue malware. Enforcement examples: IndiGo's "No, I will take risk" opt-out was changed to neutral wording after a CCPA notice. | [Rajya Sabha answer, 4 Aug 2026](https://sansad.in/getFile/annex/271/AU1798_Gxsxwg.pdf?source=pqars); [NLSIU annotated text](https://www.nls.ac.in/wp-content/uploads/2021/04/Dark-Patterns.pdf); [Neeti Niyaman](https://neetiniyaman.com/dark-patterns-digital-platforms/) | Regulator, High |

---

## 3. Recommended design rules

Each rule names its evidence. Copy follows DESIGN.md: sentence case, rupees in Indian grouping, "₹4.95 L" only in summaries, verbs on buttons, every move ends "Planning estimate, not advice. Check large moves with a CA."

### 3.1 Structure of every move

**Rule M1: one move = one person, one action, one date, one rupee figure.** (B6 implementation intentions; present bias.) Each move card answers, in this order: *who* acts (avatar), *what* they do, *by when*, *what comes home*. A move that needs two people becomes two linked cards.

**Rule M2: the date is chosen by the person, not just shown.** On "Add to plan", ask "When will Meera do this?" with two suggested dates (the next trading day, and the last safe day). Store the date and remind on it. (B6: date-and-time prompt +4.2 points.)

**Rule M3: tie the move to a goal when it has one.** "Saves ₹16,250 — that's 2 months of Kabir's college SIP." Only when the goal exists and the arithmetic is true. (B3–B5: naming the goal raised reminder effect from nil to 16%.)

**Rule M4: rupee floor.** No move is shown as a card if what comes home, after exit load, STT, stamp duty and the spread on buyback, is under ₹1,000 (tunable; a named constant). Smaller items go into a collapsed "Small moves (₹2,400 in all)" row. (B9 overtrading; T1 small sums are ignored anyway.)

**Rule M5: "Why this" is one tap away, in three layers.** Line 1 in the card (the reason in plain words); the explain sheet (the arithmetic, per DESIGN.md); "What we assumed" (data date, return assumptions, what the app could not see). (X1, X2 trust and repair; R5.)

**Rule M6: always say what happens if they do nothing.** One neutral line: "If you skip this, Meera's ₹1,25,000 room for this year lapses on 31 Mar. Nothing else changes." Neutral, factual, no fear words. (T3 deadlines; G5 no confirm shaming.)

### 3.2 Copy patterns by move type

Plain English first, technical name second and smaller (DESIGN.md §5).

| Move | Card text | "Why this" line | If skipped |
|---|---|---|---|
| **Harvest gain** | "Meera: sell 210 units of Parag Parikh Flexi Cap on Tue 10 Mar and buy them back on Wed 11 Mar. Keeps ₹16,250 of tax at home." | "Meera has ₹1,25,000 of tax-free long-term gains this year and has used ₹0. Booking ₹1,25,000 now resets her buy price, so ₹16,250 less tax when she sells later." | "Her room for this year lapses on 31 Mar. The units stay; only the tax-free room is lost." |
| **Harvest loss** | "Arjun: sell and buy back 85 units of Fund X. Books a ₹40,000 loss on paper. You keep the fund." | "The loss cancels ₹40,000 of Arjun's short-term gains, which would cost ₹8,000 in tax." | Same pattern. *Note:* "You keep the fund" eases the pain of realising a loss (B8). |
| **Wait** (lot turning long-term) | "Don't sell Kabir's 120 units of Fund Y before 14 Dec. Waiting 26 days saves ₹4,500." | "They become long-term on 14 Dec: tax falls from 20% to 12.5%, and the first ₹1,25,000 is free." | No skip line; this is a "don't". |
| **Gift, then sell** | "Arjun gives 300 units to his mother Sunita. She sells them; tax is ₹0 instead of ₹9,800." Gift tag in `club` colour. | "Gifts to parents are tax-free and not clubbed. The units become Sunita's: her money, her income, passed by her will or nominee." | "This is a real gift. Do it only if the family agrees Sunita owns the money." Never framed as a loss. |
| **Raise ₹X cheapest** | "To raise ₹5,00,000: sell ₹3,20,000 from Ramesh's debt fund and ₹1,80,000 from Meera's index fund. Tax ₹2,100." | "Selling it all from Arjun would cost ₹47,470 in tax. This mix costs ₹45,370 less." | — |
| **New money** | "Put this ₹5,00,000 in Sunita's name, in a debt fund. Brings home about ₹10,900 more a year than in Arjun's name." | "Sunita's income is under ₹12 L, so the interest is tax-free in her hands; in Arjun's it would be taxed at 31.2%." | — |
| **Goal SIP** | "Kabir's college (2031): start ₹18,000 a month. In 8 of 10 market paths that reaches ₹42 L in today's money." | "Needs ₹42 L in 4 years 6 months; you have ₹14 L earmarked." | "Without it, the goal reaches ₹27 L in a typical path." |
| **SIP step-up** | "When Arjun's April raise lands, add ₹2,000 to the college SIP." Set once, applied later. | Save More Tomorrow: committing now to raise later (B2). | — |
| **Rebalance** | "Equity is 71%, plan says 60–70%. Move ₹1,40,000 back to 70% using Meera's free room. Tax ₹0." | "We only trade back to the edge of the band, and only inside each person's free room." | "Being 1 point over is fine. We'll check again in 3 months." |
| **Prepay loan** | "Prepay ₹2,00,000 of the home loan from Sunita's FD. Comes home ₹14,200 better over 5 years." | "The loan costs 8.5%. The FD earns 7% (tax-free for Sunita), so prepaying wins." | — |
| **Regular → direct** | "Ramesh's 3 regular-plan funds cost ₹11,400 a year in commission. Switching is a sale: tax ₹0 this year using his room." | Show the yearly rupee drag, then the one-time tax. | — |
| **Advance tax** | "Arjun: pay ₹38,000 advance tax by 15 Dec. Paying late adds ₹1,140 interest." | Computed from booked gains and AIS. | — |

Words never used: "guaranteed", "assured", "risk-free", "sure", "best", "beat the market", "don't miss out", "hurry", "you'll regret", "smart investors". Words preferred: "keeps ₹X at home", "comes home", "in N of 10 paths", "about".

### 3.3 Probability and ranges

**Rule P1: frequency, rounded, with "about".** "In about 8 of 10 market paths…" Round to whole tens of percent; never show decimals. Below 2 in 10 or above 9 in 10, say "rarely" / "almost always" plus the number. (R1, R5.)

**Rule P2: every probability travels with a bad case in rupees and a lever.** "In a bad case (1 in 10), you'd be about ₹4.2 L short in today's money. Closing that gap: ₹3,000 more a month, or 8 months later." (R3, GOAL §3.5 levers.)

**Rule P3: show a band, not a line.** Goal chart: a shaded band from the 10th to 90th percentile, median as a thin line, the target as a horizontal mark. No single "projected value" in large type. (R2, R4.)

**Rule P4: "needs a change", not "fails".** Status words: *on track*, *at risk*, *short*. A path that misses is "a year where we'd suggest topping up", not "failure". (R3.)

**Rule P5: today's rupees.** All goal figures inflation-adjusted, labelled "in today's money". Nominal figures only on tap.

**Rule P6: assumptions visible and dated.** "Assumes equity averages about 11% a year before inflation, with big falls as often as since 1999. Last updated Nov 2026." (G1's ban on projections in *ads* signals how sensitive SEBI is; DATA §3.)

**Rule P7: no probabilities on a single trade or on markets.** Probabilities appear only for goals and retirement, never for "this fund" or "the market next month".

### 3.4 Showing tax savings

**Rule S1: rupees, absolute, never a percentage of the portfolio.** (T1, DESIGN.md §1.2.)

**Rule S2: "comes home" is the unit.** Every comparison is what the family keeps after tax, summed across members. Per-member split one tap away.

**Rule S3: anchor on doing nothing, not on a hypothetical maximum.** Savings are always "versus not doing this" (or "versus selling it all from Arjun" for raise ₹X), never "versus the worst way". Inflated anchors make savings look larger than they are (G1 "misleading"; Opinion).

**Rule S4: the ₹12 L cliff in one sentence and one picture.** "Meera's income is ₹11.25 L. Booking ₹75,000 of gains keeps her at ₹12 L, and her tax stays ₹0. Booking ₹1 L takes her past ₹12 L and costs about ₹26,000." Picture: a meter to ₹12 L with a red wall. Figures come from the engine's marginal-relief calculation (TAX §4.2), never a rule of thumb. (T4.)

**Rule S5: gifts and clubbing as three facts and one tag.** Tag "Gift" (`club` colour). The sheet always says: "It becomes their money. It counts as their income. It passes by their will or nominee." Plus: "Gifts to a spouse or a child under 18 don't save tax: the income comes back to the giver." And the paperwork to keep. (PLACE, TAX.)

### 3.5 Consent and the family

**Rule F1: the person who owns the account acts, and the plan says so.** The CFO sees "Sunita needs to do this" with a "Send her the steps" share (WhatsApp text written by the app, sent by the CFO). The share text has no return claims, ends with the standard footnote, and does not mention the app in promotional terms. (B7, B13.)

**Rule F2: gifts, cross-member moves and anything over ₹5 L need an explicit "Sunita agreed" tick with date**, matching the beta consent record in PLANNER-NOTES. Recorded, not nagged.

**Rule F3: optional plan buddy.** The CFO can invite one family member to see the plan's progress (read-only). Opt-in only. (B7 social monitors +35%.)

### 3.6 Guardrails against harmful nudges

| # | Guardrail | Why |
|---|---|---|
| H1 | **Urgency only from real dates**: 31 Mar, advance-tax dates, a lot's long-term date, the T+1 buyback. No countdowns on anything else. | G5 false urgency; T3 |
| H2 | **Neutral dismiss**: "Not now" and "Not for us", with an optional reason. Never "No, I'll pay more tax". | G5 confirm shaming (IndiGo case) |
| H3 | **No streaks, badges, levels, leaderboards, confetti, or "you beat X% of families".** | G1 bans games/prizes for IAs; B9 overtrading |
| H4 | **No market-move notifications**, no "markets are down, act now". In a fall, the only message is calm and goal-based, and only in the digest. | B11–B13 |
| H5 | **Cooling-off for big or irreversible moves**: gifts, anything over ₹5 L, any move that sells more than 20% of a member's equity. "Add to plan" then "Review tomorrow" before the steps unlock. | B9; irreversibility of gifts (PLACE) |
| H6 | **Trade budget**: harvest moves are batched into one window (Feb–Mar, or before a known sale), and the plan screen shows "Trades this year: 6". The app never suggests the same lot twice in a year without a new reason. | B9 |
| H7 | **Never suggest F&O, direct stock picks, or timing.** | B10 |
| H8 | **Defaults only where the engine would defend them**, and always shown as editable ("₹18,000 a month — change"). Never pre-tick gifts or cross-member moves. | B1 (bad defaults stick); G5 basket sneaking |
| H9 | **Same rule for good and bad news**: a goal falling to "at risk" is shown as plainly as one improving. No hiding a worse probability. | G1 "by omission" |
| H10 | **Errors are announced.** If a later import shows a move was wrong (stale price, unseen lot), say so on the move with the corrected figure. | X2 trust repair |

---

## 4. Notification policy

**Principle:** the app speaks rarely, on real dates, about rupees above a floor. Notifications earn short-term opens (a 3.5-fold rise in the next hour in an alcohol-app trial) but did not change long-term disengagement ([Bell et al. 2023, JMIR](https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/)); a tailored-message trial found +3.9% engagement, strongest at weekend midday ([Bidargaddi et al. 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6293241/)). CCPA lists "nagging" as a dark pattern (G5). Paper/Regulator, Medium–High.

### 4.1 Channels

| Channel | Content | Frequency |
|---|---|---|
| **Monthly digest** (push + email, 1st Sunday, 11 am IST) | Family room left, moves pending with their dates, goals status changes, anything auto-marked done. One headline number. | Monthly; weekly from 1 Feb to 31 Mar |
| **Dated alert** (push) | Only the events in §4.2, and only if the rupee figure ≥ ₹2,000 (named constant) | As triggered, capped |
| **In-app only** | Everything else: small moves, rebalancing within band, assumption updates | — |

### 4.2 Alert calendar

| Event | When | Copy example |
|---|---|---|
| Move date the person chose (M2) | Morning of the date, 9:30 am | "Today: Meera sells 210 units of Fund X. Tomorrow she buys them back." |
| T+1 buyback | Next trading day, 9:30 am | "Meera: buy back 210 units of Fund X today." |
| Year-end harvest window | 1 Feb (digest), 1 Mar, 15 Mar, and the **last safe trading day** before 31 Mar (computed from the exchange holiday list and T+1 settlement) | "₹3,40,000 of family tax-free room lapses on 31 Mar. Last safe day to sell: Thu 26 Mar." |
| Advance tax | 7 days before 15 Jun, 15 Sep, 15 Dec, 15 Mar, only for members with tax due | "Arjun: ₹38,000 advance tax due 15 Dec." |
| Lot turning long-term | Only if a sale of that lot is planned or likely (raise ₹X, rebalance), 3 days before | "Wait until 14 Dec to sell Kabir's Fund Y: saves ₹4,500." |
| New statement needed | If the last import is over 45 days old and moves are pending | "Upload this month's statements to check what's done." |
| Goal status change | Digest only, never push | "Kabir's college moved from on track to at risk." |

### 4.3 Limits

- At most **2 pushes a week** outside 1 Feb–31 Mar, **4 a week** inside it; deadline alerts may exceed the cap only on the last safe day.
- Quiet hours 9 pm–9 am IST; no pushes on Sundays except the digest.
- Notifications go to the Family CFO only in the beta; per-member notifications at public launch.
- Each type can be switched off on its own; switching one off never triggers a "Are you sure? You'll miss savings" prompt (H2).
- If two alerts in a row are ignored, the next of that type drops to the digest (decay rule).

### 4.4 Measuring "acted on"

States per move: *suggested → added to plan (with date) → marked done by user → detected done on import → partly done → dismissed (reason)*. The next import auto-matches a sale/purchase to the move (same member, ISIN, units within ±5%, within 10 days of the date) and marks it *detected done*. Metrics come from detection, not self-report (X4).

---

## 5. Beta experiments and metrics

The family-and-friends beta is small (tens of families), so most tests are **within-family or alternating-period comparisons** plus short interviews, not powered A/B tests. Treat results as direction, not proof. Pre-register each in a one-line note before starting.

| # | Experiment | Arms | Primary metric | Secondary |
|---|---|---|---|---|
| E1 | **Probability wording** | "8 in 10 paths" vs "80% chance" vs band chart only; shown in a 3-question comprehension check after first goal view | % answering "how often would you fall short?" correctly | Self-rated confidence; who changed the SIP amount |
| E2 | **Date prompt** (M2) | "Add to plan" with date picker vs without, alternating by move | % of moves *detected done* within 14 days | Days from suggestion to done |
| E3 | **Goal-linked copy** (M3) | Saving shown as rupees alone vs rupees + goal equivalent | Detected done rate | Comprehension, any complaints of manipulation |
| E4 | **Why-this default** | Explain line visible in card vs behind a tap | Detected done rate; explain-sheet opens | Trust score at 4 weeks; does trust predict action? (X3, X4) |
| E5 | **Digest cadence** | Weekly vs monthly digest outside Feb–Mar, by family | Moves done per month; notifications switched off | App opens, uninstalls |
| E6 | **Harvest season sequence** | Alerts at 1 Mar + last safe day vs 1 Feb + 1 Mar + 15 Mar + last safe day | Rupees of room used by 31 Mar / room available | Pushes ignored; disabled |
| E7 | **Plan buddy** (F3) | Offered vs not offered | Uptake of buddy; SIP continuity at 6 months | Interview: did it cause friction? |
| E8 | **Step-up commitment** | "Add ₹2,000 at next raise" offered at goal setup vs not | % committing; % kept when the date arrives | — |

**Core metrics for the whole beta (dashboard):**

1. **Uptake rate**: moves detected done ÷ moves suggested above the floor, by move type.
2. **Rupees realised**: sum of "comes home" on detected-done moves ÷ sum offered. The north-star metric.
3. **Time to act**: median days from suggestion to detected done.
4. **Room used by 31 Mar**: per family, % of available ₹1.25 L exemptions and nil bands used.
5. **SIP continuity**: share of goal SIPs still running 6 months on, and through any month with a Nifty fall over 5%.
6. **Trades per family per year** (guardrail: should not rise beyond what the moves need).
7. **Notification health**: pushes per family per week, % switched off, % ignored.
8. **Error rate**: moves later found wrong (H10), and whether uptake recovers after.
9. **Comprehension**: the 3-question check (E1) at onboarding and at 3 months.
10. **Harm signals**: any regret interview ("we did this because the app pushed"), gifts reversed, complaints.

---

## 6. Features this enables

| Feature | Evidence (one line) |
|---|---|
| **Date-your-move** on "Add to plan" with reminder on the chosen day | Implementation intentions +4.2 points (B6) |
| **T+1 buyback reminder** as a linked second step | Present bias; two-step tasks get dropped (B6) |
| **Goal labels on every SIP and earmark** ("Kabir's college") | Earmarking raises saving in India (B3); goal-named reminders +16% (B5) |
| **One family headline goal**, others nested under it | Single goal saves more unless goals share one purpose (B4) |
| **Step-up at next raise** (set once, apply later) | Save More Tomorrow 3.5% → 13.6% (B2) |
| **Probability as "N in 10 paths" + bad-case rupees + lever** | Frequencies (R1); magnitude matters (R3) |
| **Goal fan chart** (10th–90th band) | BoE fan charts; Spiegelhalter (R2) |
| **Three-layer "why this"** (line, arithmetic, assumptions) | Explanations aid trust and repair (X1, X2) |
| **Rupee floor and "small moves" bundle** | Overtrading costs (B9) |
| **Harvest season mode** (1 Feb–31 Mar, last safe day computed) | Deadline beats disposition effect (T3) |
| **Calm-in-a-fall digest note** (no push) about keeping goal SIPs | Return gap largest in volatile funds; lapsers quit on losses (B11, B13) |
| **"Send her the steps"** share text for the member who must act | Family is the top information source; owner must act (B13, F1) |
| **Plan buddy** (read-only family viewer) | Social monitors +35% in Indian villages (B7) |
| **Cooling-off for gifts and big moves** | Irreversibility; overtrading (B9, PLACE) |
| **Auto-detected "done" and rupees-realised tracker** | Measure behaviour, not stated trust (X4) |
| **Correction notice on a wrong move** | Post-error explanation restores trust (X2) |

---

## 7. Regulatory cautions and open questions

**Cautions (apply now in the beta, even though guardrails are "off"):**

1. **Never imply assured, minimum or target returns** anywhere, including goal screens and share texts. A goal's "target" is a rupee amount the family needs, not a return; label it "goal amount", never "target return" (G1).
2. **No statements "based on assumptions or projections" in advertising.** Probabilities and projections belong inside personalised advice, with assumptions shown, never on a landing page, store listing, social post or referral message (G1). Store screenshots must use illustrative data with no projected returns.
3. **No past-performance claims about the app** ("families saved ₹X with us") unless PaRRVA-verified once registered (G1). Aggregate "rupees realised" stays internal.
4. **No superlatives, no "free" with conditions** (G1). If the beta is free, say so only if it truly carries no condition; note RISK's finding that free trials of advice are barred after registration.
5. **No games or prizes, no referral rewards** (G1); no association with finfluencers (G4).
6. **Dark patterns** (G5, G3): audit every screen against the 13 CCPA patterns before beta invites; especially false urgency (H1), confirm shaming (H2), nagging (§4.3), interface interference (equal-weight "Not now"), basket sneaking (H8).
7. **AI disclosure** (G2) once registered: say plainly that suggestions are computed by software and which parts, if any, use AI models.
8. **Standard warning** must be reproduced word for word wherever an advertisement appears, and translated exactly in other languages (G1).

**Open questions (need a lawyer or primary text):**

1. Does the SEBI ad code's ban on "assumptions or projections" reach in-app communications to clients (such as a push "In 8 of 10 paths…"), or only advertisements? (Ties to GOAL open question 2.)
2. The Common Advertisement Code circular text: which dark patterns it names, whether it covers push notifications and in-app messages, and its effective date (G3, read via secondary source only).
3. Do the CCPA dark-pattern guidelines apply to a free, invite-only app with no transaction? They apply to "platforms" offering goods or services; likely yes at public launch.
4. Is a "Send her the steps" WhatsApp text written by the app a "communication" under the IA rules that must carry the disclaimer?
5. No Indian investor-return-gap study found (Morningstar India or AMFI). The app's own beta data (SIP continuity through falls) could be the first.
6. Does the "plan buddy" view count as sharing a client's data with a third party under DPDP and IA confidentiality rules, even within a family? Needs explicit consent from the member whose data is shown.
7. Soman & Cheema effect sizes and the children's-photo result were read from the abstract and a secondary summary only.

---

## 8. Sources

| # | Source | Label | Confidence |
|---|---|---|---|
| 1 | Madrian & Shea 2001, "The power of suggestion: inertia in 401(k) participation", *QJE* 116(4) | Paper | High |
| 2 | Thaler & Benartzi 2004, "Save More Tomorrow", *JPE* 112(S1) | Paper | High |
| 3 | Soman & Cheema 2011, "Earmarking and partitioning", *JMR* 48. [SSRN 1732709](https://ssrn.com/abstract=1732709) | Paper | High (direction) |
| 4 | Soman & Zhao 2011, "The fewer the better: number of goals and savings behavior", *JMR* 48(6). [World Bank blog](https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings) | Paper | Medium |
| 5 | Karlan, McConnell, Mullainathan & Zinman 2016, "Getting to the top of mind", *Management Science* 62(12). [NBER summary](https://img.nber.org/conferences/2010/SI2010/SAV/Executive%20Summary%20--%20Getting%20to%20the%20Top%20of%20Mind%20-.pdf) | Paper | High |
| 6 | Milkman et al. 2011, implementation intentions and flu vaccination, *PNAS* 108(26). [PubMed](https://pubmed.ncbi.nlm.nih.gov/21670283/) | Paper | High |
| 7 | Breza & Chandrasekhar 2019, savings monitors, *Econometrica* 87(1). [NBER w21169](https://www.nber.org/papers/w21169) | Paper | High |
| 8 | Odean 1998, "Are investors reluctant to realize their losses?", *J. Finance* 53(5); Kaustia review ([Aalto](https://www.aalto.fi/sites/default/files/2018-12/disposition_effect.pdf)) | Paper | High |
| 9 | Barber & Odean 2000, "Trading is hazardous to your wealth", *J. Finance* 55(2) | Paper | High |
| 10 | SEBI, F&O study press release, 23 Sep 2024. [sebi.gov.in](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html) | Regulator | High |
| 11 | SEBI Investor Survey 2025 (Jan 2026). [PDF](https://www.sebi.gov.in/sebi_data/commondocs/jan-2026/Investor%20Survey%202025%20Main%20Report.pdf) | Regulator | High |
| 12 | Morningstar, Mind the Gap US 2026. [morningstar.com](https://www.morningstar.com/business/insights/research/mind-the-gap) | Institution | Medium |
| 13 | Fulkerson, Jordan, Riley & Yan 2026, "Bad timing does not cost investors 15%…", *FAJ* 82(3). [CFA Institute](https://rpc.cfainstitute.org/research/financial-analysts-journal/2026/bad-timing-does-not-cost-investors-funds-returns) | Paper | Medium (abstract only) |
| 14 | AMFI SIP stoppage data, Oct 2026, via [Mint](https://www.livemint.com/market/stock-market-news/sip-stoppage-ratio-october-2026-hits-18-month-high-amfi-data-11794386284354.html) and [Value Research](https://www.valueresearchonline.com/learn/mutual-funds/amfi-sip-inflows-data-explained-five-distinctions/) | Practitioner | Medium |
| 15 | Vanguard, Advisor's Alpha. [vanguard.ca PDF](https://www.vanguard.ca/content/dam/intl/americas/canada/en/documents/gas/quantifying-your-value-to-clients-advisor.pdf) | Institution | Medium |
| 16 | Gigerenzer & Hoffrage 1995, "How to improve Bayesian reasoning without instruction: frequency formats", *Psychological Review* 102(4) | Paper | High |
| 17 | Spiegelhalter, Pearson & Short 2011, "Visualizing uncertainty about the future", *Science* 333; Britton, Fisher & Whitley 1998, "The Inflation Report projections: understanding the fan chart", *BoE Quarterly Bulletin* | Paper / Institution | High |
| 18 | Tversky & Kahneman 1981, "The framing of decisions and the psychology of choice", *Science* 211 | Paper | High |
| 19 | Ben David, Resheff & Tron 2021, XAI and adoption of financial algorithmic advisors. [arXiv 2101.02555](https://arxiv.org/abs/2101.02555); Han & Ko 2025, *Behav. Sci.* 15(10):1370; Choi et al. 2026 [arXiv 2608.11371](https://arxiv.org/abs/2608.11371); Spillner et al. 2026 [arXiv 2603.05229](https://arxiv.org/abs/2603.05229) | Paper | Medium |
| 20 | SEBI, Advertisement code for IAs and RAs, circular 5 Apr 2023 ([sebi.gov.in](https://www.sebi.gov.in/legal/circulars/apr-2023/advertisement-code-for-investment-advisers-ia-and-research-analysts-ra-_69798.html)); IA Master Circular 27 Jun 2025 ([copy](https://avantiscdnprodstorage.blob.core.windows.net/legalupdatedocs/44017/SEBI-issued-Master-Circular-for-Investment-Advisers-JUN272025.pdf)) | Regulator | High |
| 21 | SEBI Common Advertisement Code, board approval 24 Sep 2026, via [Lexology / Lakshmikumaran & Sridharan](https://www.lexology.com/library/detail.aspx?g=4da300d3-97dc-45b6-a077-90a1ba5d1bda) | Practitioner | Medium |
| 22 | SEBI board memo on association with unregistered entities (finfluencers), Jul 2024. [PDF](https://www.sebi.gov.in/sebi_data/meetingfiles/jul-2024/1719916854117_1.pdf) | Regulator | High |
| 23 | CCPA, Guidelines for Prevention and Regulation of Dark Patterns, 2023; [Rajya Sabha answer 1798, 4 Aug 2026](https://sansad.in/getFile/annex/271/AU1798_Gxsxwg.pdf?source=pqars); [NLSIU annotated text](https://www.nls.ac.in/wp-content/uploads/2021/04/Dark-Patterns.pdf) | Regulator | High |
| 24 | Bell et al. 2023, notifications micro-randomised trial, *JMIR* ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/)); Bidargaddi et al. 2018, *JMIR mHealth* ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6293241/)) | Paper | Medium (health apps, not finance) |
| 25 | Kitces on Monte Carlo communication (three posts, see GOAL sources 16–17) | Opinion | High |

Papers 1, 2, 9, 16, 17, 18 are cited from well-known published versions without re-reading them this session; figures quoted are their widely reported headline results.
