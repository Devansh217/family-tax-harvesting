# Risk profiling for a family planner: SEBI rules, research, and a 2-minute method

Research note, 15 Nov 2026. Topic 5 of the research agenda in `docs/PLANNER-NOTES.md`. It covers what SEBI requires of a registered investment adviser (RIA) when profiling risk, what the research says about measuring it, how Indian firms do it today, and a questionnaire with scoring that the engine can implement and test.

Confidence labels: **High** = read in the primary text; **Medium** = read in a secondary source or a summary of the primary; **Low** = from memory or unverified, listed in section 6.

---

## 1. Summary for the product

1. **SEBI requires a risk profile before any advice, and the client must consent to it** by registered email or a physical document (Master Circular for IAs, 27 Jun 2025, para 2.2; FAQ Q36). Without it the app may calculate, but may not recommend. (High)
2. **Reg 16 sets the content, not the method.** Collect age, objectives and horizon, income, existing assets, risk appetite and liabilities; assess what the client is both *willing* and *able* to take, including capacity for loss; identify anyone unwilling or unable to risk capital; keep questions fair, clear, not leading; tell the client the result; update it periodically. (High)
3. **Reg 17 makes the profile a hard limit on advice:** every recommendation must be "appropriate to the risk profile", backed by a documented selection process, and the RIA must believe the client can bear the risk and understands it. (High)
4. **Records: keep for 5 years** the risk profile and assessment, the suitability assessment, each piece of advice, and its signed and dated rationale; digitally signed if electronic (Reg 19). (High)
5. **No special robo-adviser regime in India.** A tool used for profiling must be "fit for purpose" with limitations identified and mitigated (Reg 16(c)); the RIA must disclose how far it uses AI (Reg 18(9)) and stays solely responsible for AI-based advice (Master Circular para 1(xii)). (High)
6. **Research: typical questionnaires are weak.** They explain under 15% of the differences in how much risk investors actually hold (Klement, CFA Institute, 2015). Good practice: measure willingness with several validated, behaviour-based items; measure capacity from facts; never average the two into one score (CFA Institute guide, 2020). (High)
7. **Use the lower of willingness and capacity**, and never let the return a goal "needs" push above either (CFA Institute 2020; CIRO; ESMA). For a shared goal, use the most cautious decision-maker, not an average (ESMA guidelines paras 69–70). (High)
8. **Risk tolerance is fairly stable; risk perception moves with markets.** FinaMetrica scores fell only 55→51 through the 2008–09 crash, about 0.4 standard deviations (Guillemette & Finke 2014). So do not re-profile willingness during a crash; check composure instead. (Medium)
9. **One answer is noisy.** 41% of US households gave a different answer to the same risk question two years later; a clarifying question when an answer looks inconsistent removed most of the resulting swing in advice (Bakshi et al., 2026 preprint). Use several items, check consistency, and ask to confirm. (Medium)
10. **Recommendation (section 4):** 5 willingness questions (about 75 seconds), 3 capacity questions (about 30 seconds; the rest comes from data the app already has), and the goal horizon. Equity ceiling per goal = the lowest of the willingness, capacity and horizon caps. A profile is stored per adult member, and a shared goal uses the most cautious owner.

---

## 2. SEBI requirements

Sources: IA Regulations 2013 as last amended 16 Dec 2024 ("Regs"); Master Circular for IAs, SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/94, 27 Jun 2025 ("MC"), which folds in the 23 Sep 2020 Guidelines (SEBI/HO/IMD/DF1/CIR/P/2020/182) and the later conduct circulars; SEBI IA FAQs, Aug 2025 ("FAQ").

| # | Requirement | What it means for the app | Source | Conf. |
|---|---|---|---|---|
| 1 | Collect age; objectives incl. horizon and purpose; income; existing investments and assets; risk appetite or tolerance; liabilities and borrowing | Each is a required field of the profile record. Horizon and purpose belong to each goal. | Reg 16(a)(i)–(vi) | High |
| 2 | A process to assess the risk a client is **willing and able** to take, including **capacity for loss** | Willingness and capacity are scored separately (section 4). | Reg 16(b)(i) | High |
| 3 | Identify clients **unwilling or unable to accept loss of capital** | A "no loss" outcome: equity 0%, deposits and debt only. | Reg 16(b)(ii) | High |
| 4 | Interpret answers properly; give **no inappropriate weight** to some answers | Fixed, published weights; consistency checks; no single item decides the profile. | Reg 16(b)(iii) | High |
| 5 | Tools must be **fit for purpose**, with limitations identified and mitigated | Document the questionnaire's validation and known limits; version it. | Reg 16(c) | High |
| 6 | Questions fair, clear, not misleading; not vague; **no double negatives, jargon or leading questions** | Plain English and Hindi copy; neutral answer order; a reviewed copy deck. | Reg 16(d) | High |
| 7 | **Tell the client** the risk profile after the assessment | Show the result screen and send it by email. | Reg 16(e) | High |
| 8 | **Update** client information and the risk assessment **periodically** | Annual review plus life-event triggers (4.7). SEBI sets no frequency. | Reg 16(f); MC 1(xv) ("on an ongoing basis") | High |
| 9 | Advice only **after** completing the risk profile, and after the client **consents** to the completed profile by **registered email or physical document** | Advice screens stay locked until consent is recorded. In-app acceptance alone may not be enough: confirm by the member's registered email (open question 1). | MC para 2.2; FAQ Q36, Q48 | High |
| 10 | All advice **appropriate to the risk profile**; a **documented process** for selecting investments; understand the products' risks | The equity ceiling is a hard constraint in the engine. The selection method is written down (this note plus the product-universe note). | Reg 17(a)–(c) | High |
| 11 | Reasonable belief the advice meets objectives, the client can **bear the risk**, and has the **experience and knowledge** to understand it; complex products need an explicit check | Record experience separately (question E1). Block complex products (derivatives, leveraged, credit-risk debt) for members without experience. | Reg 17(d)–(e) | High |
| 12 | Profiling and suitability are mandatory for **all clients**; non-individuals are profiled from their board-approved investment policy | An HUF is a client: profile it through the karta, plus an HUF capacity check. | MC 1(xv); FAQ Q36 | High (HUF approach is our reading) |
| 13 | **No free trials** and no part payments | A free tier may calculate, but may not give personalised advice before onboarding (profile, agreement, fee). | MC para 2.1 | High (MC); the notes' "Oct 2024" origin is unconfirmed |
| 14 | Agreement must describe the **risk assessment procedure, including risk capacity and risk aversion** | The client agreement links to the method in section 4. | MC Annexure A, terms (c) | High |
| 15 | **Records**: KYC; risk profiling and assessment; suitability assessment; signed agreement; advice (written or oral); **rationale, signed and dated**; client register with PAN, date, nature of advice, products, fee; communications incl. emails and call recordings | See 4.8 for the stored record. | Reg 19(1)(a)–(h) | High |
| 16 | Keep records **at least 5 years**, physical or electronic; **digitally signed** where signature is required | Rationale and consent records are signed server-side and immutable. | Reg 19(2) | High |
| 17 | Disclose the **extent of AI use** in advice at the agreement and when it changes; the RIA is **solely responsible** for AI-based advice and client data | Disclose that profiling and allocation are rule-based (not AI), and say where an LLM is used to explain. | Reg 18(9); MC 1(xii) | High |
| 18 | No assured, minimum or target returns, and no claims of risk-free returns | Show goal probabilities as estimates, never as promises. | FAQ Q48 | High |
| 19 | "Family" of an individual client (for fees and the distribution bar) = **dependent** spouse, children and parents | An earning spouse or adult child is a separate client, with their own profile and consent. | FAQ Q31 | High |
| 20 | Fee caps: ₹1,51,000 a year per family (fixed fee), or 2.5% of assets under advice, for individual and HUF clients who are not accredited investors | Pricing, not profiling. Settles the notes' open fee question. | MC (ref. circular 2025/48, 2 Apr 2025) | High |
| 21 | Robo-advice: no separate SEBI regime in force | Reg 16(c), 18(9) and MC 1(xii) govern. SEBI's Oct 2016 consultation paper floated rules for online advice; they were not adopted as such. | ARIA archive of SEBI papers | Medium |

**Comparable regimes** (they show the direction, and Reg 16's wording follows the UK text closely):

- **UK FSA/FCA FG11/05 (2011):** Reg 16(b)–(d) reproduces its bullets almost word for word: capacity for loss, cash for those unwilling or unable to lose, no inappropriate weight, fair and clear questions. In the regulator's file review, 199 of 366 failed cases failed because the investment did not match the client's attitude to risk. (Regulator, High)
- **ESMA MiFID II suitability guidelines (ESMA35-43-3172, 2022):**
  - Ask what loss over a given period the client would accept, rather than "are you comfortable with risk" (para 46).
  - Use concrete figures or graphs for portfolio falls (para 48).
  - Build in coherence checks and resolve contradictions with the client (paras 49, 51).
  - Robo-advisers must explain human involvement, sources of information and how updates happen (para 17), and flag inconsistent answers (para 32).
  - Guard against clients changing their profile just to make a product fit (para 58).
  - Groups of clients: set a policy up front. Use the most prudent profile (least experience, weakest finances, most conservative objective). Averaging is "unlikely to be compliant" (paras 60–70).

  (Regulator, High)
- **FINRA Rule 2111:** the investment profile includes age, other investments, financial situation and needs, tax status, objectives, experience, horizon, liquidity needs and risk tolerance. Suitability is reasonable-basis, customer-specific and quantitative (no excessive trading). (Regulator, High)

---

## 3. Research findings

### 3.1 Four concepts, kept apart

| Concept | Definition (CFA Institute 2020 guide) | How to measure | Changes with |
|---|---|---|---|
| **Risk tolerance (willingness)** | The most uncertainty the investor is willing to accept | Psychometric items, past behaviour | Slowly; fairly stable from about age 25 |
| **Risk capacity (ability)** | Ability to bear a loss without hurting the desired standard of living | Facts: income stability, emergency fund, dependants, debts, horizon | Life events; falls as a goal nears |
| **Risk need (required return)** | The risk the investor *must* take to reach a goal | Goal engine: required return vs assumed returns | Savings rate, goal size, date |
| **Risk perception / composure** | The current feeling about how risky markets are; how likely the investor is to panic | Not profiled; watched around market events | Markets, news, recent returns |

**How to combine them (CFA Institute 2020, the four rules):**

1. Need never overrides ability: ability is the upper bound.
2. A low need may be set aside when ability and tolerance are both high.
3. High ability may be set aside when need and tolerance are low.
4. Low tolerance is **never** ignored. It may only be raised by education when need and ability are high.

CIRO (Canada) states the simpler form: the profile is "the lower of the two". (Institution, Regulator; High)

### 3.2 Questionnaires: what works

- **Typical questionnaires are poor.** They explain under 15% of the variation in risky-asset holdings. 35% of those reviewed never ask about horizon, and 11% ask the investor to pick their own profile (Klement 2015, CFA Institute Research Foundation). (Institution, High)
- **Quality bar** (CFA Institute 2020):
  - At least 7 items with documented reliability (Cronbach's α ≥ 0.70 or test-retest data).
  - Do not average tolerance items with objective items (age, horizon, capacity).
  - Avoid non-investment risk domains, predictions of future behaviour, 50/50 gambles, jargon and double-barrelled questions.

  (Institution, High)
- **Grable & Lytton (1999), 13-item scale:** the most-cited validated public instrument. It covers guaranteed-vs-risky choices, best/worst return ranges, reactions to losses, and self-descriptions; scored 13–47. Its "best and worst case" range item (Q8) is the model for our W2. It is US-normed, has a 1990s style, and takes about 4 minutes, so it is too long to use whole. (Paper, High)
- **A single general risk question carries real signal.** The 0–10 "willingness to take risks" question (German SOEP) predicts actual risk-taking (Dohmen et al. 2011). Used here as one item among five, not alone. (Paper, Medium: from memory, not re-read)
- **Self-reports are noisy.**
  - 41% of US households gave a different answer to the same stated-risk question two years apart.
  - In a lab retest, a third moved 2+ points on a 0–10 scale after six months.
  - LLM advisers moved stock allocations by 24–35 points when only that answer changed.
  - One clarifying question cut the swing from 33.5 to 1.9 points.

  (Bakshi et al., arXiv 2610.23060, Oct 2026; Paper, preprint, Medium)
- **Risk preference behaves like a trait with moderate stability.** Stated (questionnaire) measures are more reliable over time than lottery-style behavioural tasks (Frey et al. 2017, *Science Advances*; Schildberg-Hörisch 2018, *JEP*). This supports self-report items, but several of them. (Paper, High on the abstracts)

### 3.3 Stability, crashes and biases

- **Through the 2008–09 crash, measured tolerance barely moved.** The FinaMetrica average went from 55 to 51, about 0.4 SD, which equals a shift in the comfortable equity range from 45–65% to 40–60%. FinaMetrica attributes even this to perception, not tolerance (Guillemette & Finke 2014, *J. Financial Planning* 27(6); FinaMetrica commentary). (Paper + Practitioner, Medium)
- **Changes in risk-taking during 2008–09 came mostly from changing risk *perception*,** not risk attitude (Weber, Weber & Nosić 2013, *Review of Finance* 17:847–883; repeated surveys of UK brokerage clients). (Paper, Medium: read the title and abstract only)
- **Implications:**
  - **Recency:** answers given after a rally or a crash are biased, so a profile change soon after a big market move gets a cooling-off and a confirmation step.
  - **Loss aversion:** ask about losses in rupees on the member's own money (ESMA para 48), not in percentages alone.
  - **Overconfidence:** ask about actual past behaviour in a fall (revealed preference), not self-ratings (ESMA para 46).
- **Robo-advisers should not follow clients' crash-time de-risking.** A model in which the client's risk profile moves with markets finds that countering the urge to cut equity in downturns improves the Sharpe ratio (Capponi, Olafsson & Zariphopoulou 2019/2022). (Paper, Medium)

### 3.4 Indian practice

- **HSBC MF "Know your risk profile" (Practitioner, High).**
  - 5 questions, each scored 5–25 points: past investment experience, share of income investable, age band, reaction to a 25% fall in a share, and a self-described approach.
  - 5 bands (≤35, 36–55, 56–75, 76–100, 101–125) mapped to equity 5 / 20 / 35 / 60 / 80%.
  - Weaknesses by the CFA and ESMA tests: it mixes age and income (capacity) into one sum with attitude, uses a self-assessment item, and has no horizon or goal.
- **Nippon India MF "Risk Analyzer"** gives three profiles: a conservative profile is about 15% growth assets, then moderate, then aggressive (Practitioner, Medium). **SBI MF** lists age, dependants, commitments and horizon as inputs (Practitioner, Medium). One RIA's form asks whether other family members should be "treated the same as me", which is the family question most forms skip (Practitioner, Low).
- **Common pattern** in AMC, platform and RIA forms: 5–10 multiple-choice questions, points summed into 3–5 named bands (conservative to aggressive), each with a fixed equity/debt split. The profile is **per investor, not per goal**. Capacity and willingness are mixed. No consistency checks.
- **NISM X-A/X-B** (the RIA certification) teaches the tolerance/capacity distinction, life-cycle allocation and questionnaire scoring. The current workbook was not read for this note. (Institution, Low)

---

## 4. Recommended questionnaire and scoring

Design rules, from sections 2–3:

- Willingness (W) and capacity (K) are scored separately and never added together.
- The horizon cap (H) is set per goal.
- The equity ceiling = min(W cap, K cap, H cap).
- Need (N) is shown against the ceiling but never raises it.
- Time for the user: about 2 minutes, because K mostly comes from data the app already holds.

### 4.1 Willingness questions (asked of each adult member; about 75 s)

Each answer scores 1–5. `V` = the member's investable portfolio in ₹, rounded to a ₹1 L step, minimum ₹1 L. If unknown, use ₹10 L. Show amounts in rupees.

**W1. A fall in your own money.** "Your investments of ₹V fall to ₹0.75V over 3 months. Markets are down for everyone. What do you most likely do?"

| Answer | Score |
|---|---|
| Sell everything and keep it safe | 1 |
| Sell some to stop further loss | 2 |
| Do nothing and wait | 3 |
| Do nothing and keep my monthly SIPs going | 4 |
| Invest extra money while prices are low | 5 |

**W2. Pick a range** (Grable & Lytton Q8 style). "Which mix would you choose for money you won't touch for 10 years? Each shows what ₹1,00,000 could become in one good year and one bad year." Show as a bar chart, in random order top-to-bottom or fixed ascending (decide in usability testing).

| Mix | Bad year | Good year | Score |
|---|---|---|---|
| A | ₹1,03,000 | ₹1,07,000 | 1 |
| B | ₹96,000 | ₹1,14,000 | 2 |
| C | ₹88,000 | ₹1,22,000 | 3 |
| D | ₹78,000 | ₹1,32,000 | 4 |
| E | ₹65,000 | ₹1,45,000 | 5 |

The ranges are illustrative, roughly 0 / 20 / 40 / 60 / 90% equity on Indian data. Replace them with 5th/95th-percentile one-year outcomes from topic 2 data before launch.

**W3. What you actually did** (revealed preference). "Think of the last time your investments fell sharply (for example March 2020 or mid-2022). What did you do?"

| Answer | Score |
|---|---|
| I sold most of it | 1 |
| I sold some or stopped my SIPs | 2 |
| I didn't change anything | 4 |
| I invested more | 5 |
| I didn't have market investments then | not scored |

There is deliberately no 3: holding through a real fall is strong evidence of tolerance.

**W4. General.** "In money matters, how willing are you to take risks?" Slider 0 ("not at all") to 10 ("very willing"). Score = 1 + round(slider × 4 / 10), giving 1–5.

**W5. Acceptable loss** (ESMA para 46). "For your long-term money, what is the biggest fall in one year you could live with without changing your plan?"

| Answer | Score |
|---|---|
| None: I can't accept any fall | 1 |
| Up to 5% (₹0.05V) | 2 |
| Up to 15% (₹0.15V) | 3 |
| Up to 25% (₹0.25V) | 4 |
| 35% or more (₹0.35V) | 5 |

**Willingness score.** Let S = the scored items (4 or 5 of them) and n = their count.

```
T = round( (sum(S) - n) / (4n) * 100 )      // 0..100
```

| T | Willingness band | W cap (max equity) |
|---|---|---|
| 0–19 | Very cautious | 10% |
| 20–39 | Cautious | 30% |
| 40–59 | Balanced | 50% |
| 60–79 | Growth | 75% |
| 80–100 | High growth | 90% |

**No-loss rule** (Reg 16(b)(ii)). If W5 = 1 **and** (W1 ≤ 2 or W3 ≤ 2), the member is "unwilling to accept loss of capital". The W cap becomes 0%, and only deposits, government-backed savings and low-risk debt are offered. Ask once to confirm (4.4).

### 4.2 Capacity (per member; about 30 s for the questions, the rest derived)

Each factor scores 1–5. K = rounded average mapped to 0–100 with the same formula as T. Derived items come from statements, AIS and the family profile. Ask only when the data is missing.

| # | Factor | Source | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|---|
| K1 | Income stability | Asked: "Your main income is…" | Govt/PSU salary or pension | Private salary, 2+ years in the job | Salary < 2 years, or a stable business | Variable: commission, freelance, early business | No own income / living off investments |
| K2 | Emergency fund, months of family expenses (liquid + deposits ≤ 1 yr, excluding goal money) | Derived | ≥ 9 | 6–9 | 3–6 | 1–3 | < 1 |
| K3 | People who depend on this member's income | Derived from the family profile (asked if missing) | 0 | 1 | 2 | 3–4 | 5+ |
| K4 | EMIs as % of take-home | Derived, or asked "Total monthly EMIs" | 0% | < 20% | 20–35% | 35–50% | > 50% |
| K5 | Term and health cover in place (when there are dependants) | Asked: "Do you have term life cover and health cover for the family?" | Both, or no dependants | Both, but below the rule of thumb | One of the two | Only employer cover | Neither |

For a retired member, K1 uses the share of expenses covered by pension, annuity and SCSS interest: ≥ 100% → 5, 75–100% → 4, 50–75% → 3, 25–50% → 2, < 25% → 1.

| K | Capacity band | K cap |
|---|---|---|
| 0–19 | Very low | 20% |
| 20–39 | Low | 40% |
| 40–59 | Medium | 60% |
| 60–79 | High | 80% |
| 80–100 | Very high | 100% |

**Override:** K2 < 3 months → K cap ≤ 40% for **new** money until the emergency fund reaches 3 months. Existing equity is not sold to fund it unless the user chooses to.

### 4.3 Per-goal horizon cap and the ceiling

Horizon `h` = years from today to the goal date. For a goal paid out over several years (education, retirement income), use each withdrawal's own date. Topic 1 (glide paths) refines this.

| h | H cap |
|---|---|
| < 1 yr | 0% |
| 1–3 | 15% (equity savings / arbitrage-type only) |
| 3–5 | 35% |
| 5–7 | 55% |
| 7–10 | 75% |
| > 10 | 100% |

```
ceiling(goal) = min( Wcap(owners), Kcap(funders), Hcap(h) )
range(goal)   = [ max(0, ceiling - 20), ceiling ]      // shown to user
suggested     = ceiling, unless the user picks "only what the goal needs":
                  then max( range.low, need_equity(goal) )
need_equity   = lowest equity % whose median projection reaches the goal (topic 1/2 engine)
if need_equity > ceiling:  shortfall → show save more / move date / shrink goal; never raise ceiling
```

The emergency fund and any money due within 12 months are goals with h < 1, so their equity is 0%. The rebalance band is ±5 percentage points around the chosen target (convention).

### 4.4 Consistency checks (ESMA paras 32, 49, 51)

The app asks one clarifying question when any check fires. It uses the answer the user confirms and logs both answers.

| Check | Fires when | Clarifying prompt |
|---|---|---|
| C1 | \|W1 − W5\| ≥ 3 | "You said you'd [W1 answer] after a 25% fall, but could live with a [W5] fall. Which is closer?" Re-ask W5. |
| C2 | W4 ≥ 8 (score 5) and W3 = 1 | "Last time you sold most of it. Would you do the same today?" Re-ask W1. |
| C3 | T ≥ 60 and E1 = "none" | Not blocked. Show an explainer of what a 30% fall looks like in ₹, then confirm. |
| C4 | T ≥ 60 and K < 40 | No question. Explain that capacity sets the limit, so the user sees why the ceiling is lower than their answers suggest. |

**E1. Experience** (Reg 17(d)(iii); not scored into T). "Which have you held for over a year? (tick any)": FDs/PPF · debt or hybrid funds · equity funds · direct shares · F&O / leveraged products. Complex products (derivatives, leverage, credit-risk funds, unlisted) are recommended only when "direct shares" or "F&O" is ticked **and** T ≥ 60.

### 4.5 Members and the family

- **Each adult member gets a profile** (W and K). A dependent spouse, parent or minor child uses the **profile of the member who decides for them**: the guardian for a minor. K is computed from the household, since their money is the family's safety net.
- **An earning spouse or adult child is a separate SEBI client** (FAQ Q31): own profile, own consent.
- **HUF:** willingness = the karta's answers; capacity = the HUF's own liquidity and income, scored with the same table.
- **A shared goal** (for example a child's education funded by both parents): Wcap = **the minimum** over the goal's decision-makers, and Kcap = the household capacity. Never average (ESMA paras 69–70).
- **When a goal is funded by a member whose own Kcap is lower** (for example a retired parent holding the debt leg for tax reasons), the ceiling for *that member's holdings* is their own min(Wcap, Kcap). The family allocation is then assembled across members by the placement engine (topic 3).

### 4.6 Worked test cases (expected outputs)

| Case | Answers | T | K inputs → K | Goal h | Ceiling | Range |
|---|---|---|---|---|---|---|
| A. Salaried 34, 2 dependants | W1=4, W2=4, W3=4, W4 slider 7→4, W5=4 | (20−5)/20 = 75 → Growth, 75% | K1=4, K2=4, K3=3, K4=4, K5=4 → avg 3.8 → (3.8−1)/4 = 70 → 80% | Retirement 26 yr → 100% | **75%** | 55–75% |
| A, child's college | same | 75% | 80% | 8 yr → 75% | **75%** | 55–75% |
| A, car | same | 75% | 80% | 2 yr → 15% | **15%** | 0–15% |
| B. Retired parent 68 | W1=2, W2=2, W3=2, W4 slider 3→2, W5=2 | 25 → Cautious, 30% | K1 pension 60% → 3, K2=5, K3=5, K4=5, K5=3 → avg 4.2 → 80 → 100% | Income in 4 yr → 35% | **30%** | 10–30% |
| C. No-loss | W1=1, W5=1, others any | (any) | (any) | (any) | **0%** | 0% |
| D. Unscored W3 | W1=3, W2=3, W3 n/a, W4 slider 5→3, W5=3 | (12−4)/16 = 50 → 50% | — | — | min(50, …) | — |
| E. Thin emergency fund | as A but K2 = 1 month | 75% | K cap 80%, then override → 40% for new money | 26 yr | **40%** (new money) | 20–40% |

W4 mapping check: a slider at 7 gives 1 + round(2.8) = 4, at 3 gives 1 + round(1.2) = 2, and at 5 gives 1 + round(2.0) = 3. Rounding is half away from zero. Test boundary values T = 19/20, 39/40, 59/60 and 79/80, and K likewise.

### 4.7 When to re-profile

| Trigger | What is redone |
|---|---|
| 12 months since the last consent | Full (W, K, E1), with answers pre-filled; the user confirms or changes them |
| Life event: marriage, birth, death or illness in the family, job loss or change, income change > 25%, new or closed loan, retirement, a dependant added | K (and E1); W optional |
| Goal crosses into a new horizon band | H cap only; automatic; notify |
| Emergency fund falls below 3 months | K2; automatic |
| User asks to change their profile | Full W. If the Nifty 50 moved > 15% in the last 3 months, or the last change was < 90 days ago: show a recency warning and require a 7-day wait before the new profile applies (ESMA para 58) |
| Market fall > 20% from peak | **Do not** re-profile W (3.3). Send a composure check-in that shows the plan, not a questionnaire. |

### 4.8 Records to keep (5 years, signed; Reg 19)

Store one immutable `RiskProfileRecord` per member per assessment:

- **Identity:** member id, PAN last 4 (per the security notes), the client relationship (self, dependant, HUF).
- **Inputs:** questionnaire version id; each question's id, text shown (with the ₹V substituted), the answer and its score; skipped and unscored items; consistency checks fired, with both answers.
- **Derived inputs:** K1–K5 values, the data source of each (statement, AIS, asked) and as-of dates.
- **Outputs:** T, K, bands, caps, the no-loss flag, the experience flags, and the scoring algorithm version.
- **Communication and consent:** when the result was shown to the client (Reg 16(e)); consent timestamp; the registered email id it was sent to and the reply or acknowledgement id (MC 2.2); the disclosure text version including AI use (Reg 18(9)).
- **Per recommendation** (a separate `AdviceRecord`): goal, ceiling and its binding constraint (W, K or H), need, the chosen allocation, products, a plain-English rationale, the date, and a digital signature (Reg 19(1)(c), (e), (f)).

---

## 5. Features this enables

- **Advice lock.** Recommendations stay hidden until the profile and consent exist. Evidence: MC 2.2; FAQ Q36.
- **"Why this limit" chip on every goal,** naming which of willingness, capacity or horizon sets it. Evidence: Reg 17(d); CFA 2020 combination rules.
- **Shortfall instead of risk-up.** When a goal needs more equity than its ceiling, offer more saving, a later date or a smaller goal. Evidence: CFA 2020 ("need cannot exceed ability"); FCA FG11/05 §1.14.
- **Emergency fund first.** A thin buffer lowers the equity ceiling on new money. Evidence: Reg 16(b)(i) capacity for loss; ESMA para 24.
- **Composure check-in after crashes** instead of a new questionnaire. Evidence: Guillemette & Finke 2014; Weber et al. 2013.
- **Profile-change cooling-off with a recency warning.** Evidence: ESMA para 58; recency bias.
- **Clarifying-question flow for inconsistent answers.** Evidence: ESMA paras 32, 49, 51; Bakshi et al. 2026.
- **Per-member profiles; a shared goal uses the most cautious owner.** Evidence: ESMA paras 69–70; FAQ Q31.
- **Complex-product gate by experience.** Evidence: Reg 17(d)(iii), 17(e).
- **Exportable profile and advice log for the yearly compliance audit.** Evidence: Reg 19(1)–(3).
- **Profile in the beta, switched off.** The beta stores profiles to test reliability (retest after 3 months) before launch. Evidence: Reg 16(c) "fit for purpose"; CFA 2020 reliability bar.

---

## 6. Open questions

1. **Does in-app consent count as "registered email"?** MC 2.2 says registered email or a physical document. Plan: send the profile from the app to the member's registered email and record an acknowledgement. Confirm with a compliance professional or IAASB guidance.
2. **Origin of the free-trial bar.** The notes say an Oct 2024 circular; the MC (para 2.1) carries it, but the source circular was not traced. It does not change the rule.
3. **Validation.** Five willingness items are below the CFA guide's suggested 7+. The plan: measure Cronbach's α and 3-month test-retest on beta users, and add W6–W7 (for example a Grable-Lytton guaranteed-vs-risky item) if α < 0.70.
4. **W2 ranges** are placeholders. Replace them with 5th/95th-percentile one-year outcomes for the 0/20/40/60/90% equity mixes from topic 2 Indian data.
5. **Cap tables** (W, K and H caps) are judgement calibrated to common practice (HSBC bands 5–80%; FinaMetrica 45–65% for a mid score), not to research. Revisit with the family archetypes (topic 6).
6. **NISM X-A/X-B workbook** content on risk profiling was not read. Check whether the exam material expects a particular method.
7. **Hindi and regional-language versions** must stay "clear and not misleading" (Reg 16(d)). Translation review is needed.
8. **SEBI and robo-advice.** Check for any 2026 consultation on AI or automated advice after the Dec 2024 amendments; none was found in this pass.
9. **Dependent adults** (for example a parent with their own pension): are they the client's "family" or a separate client? This affects whose profile governs. FAQ Q31 hinges on "dependent".

---

## 7. Sources

| # | Source | Type | Conf. |
|---|---|---|---|
| 1 | SEBI (Investment Advisers) Regulations 2013, last amended 16 Dec 2024, Regs 16, 17, 18(9), 19. https://www.sebi.gov.in/sebi_data/attachdocs/dec-2024/1735037757673.pdf | Regulator | High |
| 2 | SEBI Master Circular for Investment Advisers, SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/94, 27 Jun 2025, paras 1(xii), 1(xiii), 1(xv), 2.1, 2.2, Annexure A. Copy read: https://avantiscdnprodstorage.blob.core.windows.net/legalupdatedocs/44017/SEBI-issued-Master-Circular-for-Investment-Advisers-JUN272025.pdf | Regulator (via a mirror) | High |
| 3 | SEBI FAQs on Registered Investment Advisers, Aug 2025, Q31, Q33, Q35, Q36, Q45, Q48. https://www.sebi.gov.in/sebi_data/faqfiles/aug-2025/1755174193178.pdf | Regulator | High |
| 4 | SEBI circular "Guidelines for Investment Advisers", SEBI/HO/IMD/DF1/CIR/P/2020/182, 23 Sep 2020. https://www.sebi.gov.in/legal/circulars/sep-2020/guidelines-for-investment-advisers_47640.html | Regulator | High (consolidated in #2) |
| 5 | ARIA, archive of SEBI IA consultation papers (incl. Oct 2016). https://aria.org.in/communication-from-sebi/ | Practitioner body | Medium |
| 6 | ESMA, Guidelines on certain aspects of the MiFID II suitability requirements, ESMA35-43-3172 (2022, applying from Oct 2023). https://www.esma.europa.eu/sites/default/files/2023-04/ESMA35-43-3172_Guidelines_on_certain_aspects_of_the_MiFID_II_suitability_requirements.pdf | Regulator | High |
| 7 | FSA/FCA FG11/05, "Assessing suitability: establishing the risk a customer is willing and able to take…", Mar 2011. http://www.fca.org.uk/publication/finalised-guidance/fsa-fg11-05.pdf | Regulator | High |
| 8 | FINRA Rule 2111 (Suitability). https://www.finra.org/rules-guidance/rulebooks/finra-rules/2111 | Regulator | High |
| 9 | CIRO, "Understanding Risk" (tolerance vs capacity, the lower of the two). https://www.ciro.ca/office-investor/understanding-risk | Regulator | High |
| 10 | CFA Institute, *Investment Risk Profiling: A Guide for Financial Advisors*, 2020. https://rpc.cfainstitute.org/sites/default/files/-/media/documents/survey/investment-risk-profiling.pdf | Institution | High |
| 11 | Klement, J., *Investor Risk Profiling: An Overview*, CFA Institute Research Foundation Brief, 2015. https://rpc.cfainstitute.org/research/foundation/2015/investor-risk-profiling-an-overview | Institution | High |
| 12 | Grable, J. & Lytton, R. (1999), "Financial risk tolerance revisited: the development of a risk assessment instrument", *Financial Services Review* 8:163–181. https://openjournals.libs.uga.edu/fsr/article/view/3890 | Paper | High |
| 13 | Guillemette, M. & Finke, M. (2014), "Do large swings in equity values change risk tolerance?", *J. Financial Planning* 27(6):44–50. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2444503 ; FinaMetrica commentary: https://obj.portfolioconstructionforum.edu.au/articles_perspectives/PortfolioConstruction-Forum_Evidence-for-stability-of-risk-tolerance.pdf | Paper + Practitioner | Medium |
| 14 | Weber, M., Weber, E.U. & Nosić, A. (2013), "Who takes risks when and why", *Review of Finance* 17:847–883. https://ideas.repec.org/a/oup/revfin/v17y2013i3p847-883.html | Paper | Medium |
| 15 | Bakshi, S. et al. (2026), "Same Person, Different Advice: Auditing LLM Financial Advice with Repeated Risk-Tolerance Responses", arXiv 2610.23060 | Paper (preprint) | Medium |
| 16 | Frey, R. et al. (2017), "Risk preference shares the psychometric structure of major psychological traits", *Science Advances*, doi 10.1126/sciadv.1701381 | Paper | High (abstract) |
| 17 | Schildberg-Hörisch, H. (2018), "Are risk preferences stable?", *J. Economic Perspectives*, PMID 30203933 | Paper | High (abstract) |
| 18 | Dohmen, T. et al. (2011), "Individual risk attitudes: measurement, determinants and behavioral consequences", *JEEA* 9(3) | Paper | Medium (not re-read) |
| 19 | Capponi, A., Olafsson, S. & Zariphopoulou, T., "Personalized Robo-Advising", arXiv 1911.01391 | Paper | Medium |
| 20 | HSBC Mutual Fund (India), "Know your risk profile" questionnaire. https://www.assetmanagement.hsbc.co.in/-/media/Files/attachments/india/common/siphaifaydewaliaadat-risk-profile.pdf | Practitioner | High |
| 21 | Nippon India MF Risk Analyzer, https://mf.nipponindiaim.com/knowledge-center/tools/risk-analyzer ; SBI MF on risk profiling, https://www.sbimf.com/learn-about-mutual-funds/mutual-funds-risk-profiling | Practitioner | Medium (search excerpts only) |
