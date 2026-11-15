# Tax-aware placement across the family: who holds what, where new money goes

Research note, 15 Nov 2026. Research agenda topic 3 (`docs/PLANNER-NOTES.md`). Tax rules are FY 2026-27 under the Income-tax Act, 2025 as in `docs/research/2026-11-15-family-financial-planning.md` (the "tax note"); section numbers below are the new Act's, old numbers in brackets. All rupee figures include 4% cess and exclude surcharge unless stated.

Labels: **Paper** (peer-reviewed or working paper), **Institution** (asset manager, regulator, government), **Practitioner** (adviser or robo-adviser method, Indian finance writer), **Opinion** (forum or social post). Confidence: high / medium / low.

---

## 1. Product summary

1. **The idea is old; the Indian version is bigger.** "Asset location" research (US) asks which assets belong in taxable vs tax-deferred accounts. The answer used in practice is to put the most heavily taxed income in the most sheltered account. Studies put the gain at about 0.1–0.6% a year. In India the "accounts" are family members. A retired parent or student child on the new regime pays 0% on slab-taxed income up to the ₹12 L rebate line, while the earner pays 31.2%. So the gap is wider than in the US and the gain can be larger: about **0.9% a year** in the worked example (section 4).
2. **Rule of thumb, Indian version:** put **slab-taxed income** (debt funds, FDs, SCSS, IDCW, rent) with members who have **rebate headroom**. Put **equity gains** wherever there is an unused **basic exemption gap** or **₹1.25 L LTCG exemption**. Leave the rest of the equity with the earner, since 12.5% LTCG is the same rate for everyone above the exemptions. Tax-free wrappers (PPF, SSY, EPF) are capped per person, so fill every eligible member's cap where liquidity allows.
3. **Unlike US accounts, each member's tax rate changes with the amount placed.** Rates are low until the headroom runs out, then jump at the ₹12 L cliff. So the problem is not a plain linear programme. The objective splits cleanly **by member**, though, and each member's tax is one call to the foundation's tax function.
4. **Recommended engine: greedy placement with exact tax evaluation, regret ordering and a swap pass.** It places money in ₹10k–₹25k steps. At each step it places the asset class whose best holder saves the most over its second-best holder, then runs a pairwise swap pass to escape cliff traps. Every step is computed with the real per-member tax function (slabs, rebate, marginal relief, gap, exemptions, clubbing). It needs no solver library, runs in a few milliseconds for 5 members and 10 classes, and each step becomes a plain-English reason.
5. **Fallback: headroom buckets.** List each member's nil-tax room (rebate headroom for slab income, exemption gap and ₹1.25 L for gains, PPF/SSY caps). Fill the room with the income that would cost the giver the most tax. Simple, explainable, and close to optimal away from the cliff.
6. **Clubbing turns some members into the giver's own account.** A gift to a spouse, son's wife or minor child (and a member's gift to their HUF) leaves the income taxed as the giver's. The engine must evaluate tax for the **effective owner**, not the name on the folio. The exception is exempt income: PPF in a spouse's name is a real extra ₹1.5 L wrapper, because clubbed exempt income stays exempt.
7. **The legal risk is substance, not GAAR.** GAAR needs a ₹3 Cr tax benefit, far above family gifting. The real risks are: a "gift" the giver still controls (sham or benami), circular or cross gifts, and missing paperwork. The app must make every cross-member suggestion a real, irrevocable gift, with documents, and must flag estate effects (the parent's will decides where the money goes).

---

## 2. Findings with citations

### 2.1 Asset location literature (US)

| # | Finding | Source | Label, confidence |
|---|---|---|---|
| F1 | Lifetime model with taxable and tax-deferred accounts: a **strong preference for taxable bonds in the tax-deferred account and equity in the taxable account**, because bonds' return is taxed more heavily. Optimal policies are near "corners": investors should not hold a stock/bond mix in both accounts. The welfare cost of mislocation is high, especially for the young. | Dammon, Spatt & Zhang (2004), *Journal of Finance* 59(3) [S1] | Paper, high |
| F2 | The "bonds in the sheltered account" rule is **not universal**. With high-turnover (tax-inefficient) equity funds, equity can belong in the sheltered account. With tax-exempt bonds available, those bonds go in the taxable account. The answer depends on the after-tax return gap of each asset, not on its label. | Shoven & Sialm (2004), *Journal of Public Economics* 88 [S2] | Paper, medium (abstract and secondary summaries read, full text not read) |
| F3 | **Difference method.** Rank asset classes by (end wealth in the sheltered account − end wealth in the taxable account) per ₹1. Fill the sheltered account from the top of the list. This adds about **20 bps a year (10–30 bps)** over holding the same mix in every account, or +7.2% end wealth over 30 years. The ranking depends on return as well as tax efficiency. High-return, tax-inefficient assets go into the shelter first. Low-return bonds matter little. Cautions: rebalancing across accounts is harder, and relocating existing assets needs sales. | Daryanani & Cordaro (2005), *Journal of Financial Planning* [S3] | Paper (practitioner journal), high: PDF read |
| F4 | **After-tax asset allocation.** Count each account at its after-tax value, i.e. pre-tax value × (1 − future tax rate), before setting the allocation. Under that view the optimal location is stocks in taxable and bonds in sheltered accounts "to the extent possible while attaining the target asset allocation". | Reichenstein (2006) *FAJ* 62(4) [S4]; Reichenstein (2013) *J. Financial Planning* [S5] | Paper, high |
| F5 | Asset location is worth **0 to 60 bps a year**. It is largest when accounts are of similar size, the allocation is balanced and the tax bracket is high. It is zero when all money sits in one account type. | Vanguard, *Quantifying Advisor's Alpha* [S6] | Institution, high |
| F6 | 2026 update: **up to about 30 bps a year**. Two case studies give 6.1 and 13.3 bps. Asset allocation and rebalancing matter far more: "deviating from rebalancing targets is far more damaging … than imperfect asset location". | Vanguard, *When and how asset location matters* (Jacobs & Zorn, June 2026) [S7] | Institution, high |
| F7 | Tax-efficient location and withdrawal order are one of five "gamma" sources. Advisers' tax-management estimates range from 0 to 100 bps. | Blanchett & Kaplan (2013) *Journal of Retirement*; Morningstar *Gamma-Efficient Portfolio* [S8, S9] | Paper / Institution, medium |
| F8 | **Linear programming is the production method.** The objective is the sum of after-tax values of every asset in every account at the horizon. Constraints: asset totals equal the target allocation, account totals equal balances, and a penalty on allocation drift. Betterment does **not** offer location to low-bracket clients (it can reduce after-tax return), or across accounts with different horizons or emergency use. It also avoids selling appreciated assets to relocate. | Betterment, *Asset location methodology* [S10] | Practitioner, high |
| F9 | Tax-aware portfolio problems with realisation are non-convex. A good approach fixes the discrete choices (buy or sell per asset) and then solves a convex problem. This almost always reaches the global optimum, at a fraction of the cost of mixed-integer solving. | Moehle, Kochenderfer, Boyd & Ang (2021), arXiv 2008.04985 [S11] | Paper, high |
| F10 | Multi-account plans can be re-solved each year: a convex plan with a simplified tax model is re-run as facts change (model predictive control). | Johansson & Boyd (2025), arXiv 2507.10603 [S12] | Paper, medium (relevant to "re-plan yearly", not to placement itself) |

**What carries over to India.** (a) The right ranking measure is the **after-tax wealth difference per rupee** between holders (F3, F4), not a label. (b) Optimal solutions are **near-corner**: each member ends up holding few classes (F1). (c) The family-level allocation is a hard constraint and placement only works inside it (F4, F6, F8). (d) Value is zero when every holder is taxed alike and largest when sheltered capacity is roughly matched to the tax-inefficient sleeve (F5). (e) Don't sell appreciated assets just to relocate. Relocation is a tax-aware selling problem (topic 4) (F3, F8).

**What does not carry over.** (a) US accounts have fixed sizes and flat marginal rates. An Indian member's "account" is a **tax schedule with capacity**: 0% until the rebate headroom, nil band or exemption is used, then a jump at the ₹12 L cliff, then slab rates. (b) US location changes need a sale. In India, units can be **gifted in kind** to a non-clubbed relative with no tax on either side (s.92 exemption; the cost and holding period carry over, new-Act location unconfirmed per the tax note). So existing holdings can be relocated without realising gains, but only by an irrevocable gift. (c) There is no US equivalent of clubbing, the ₹12 L cliff or the basic exemption gap.

### 2.2 The Indian mapping

| US concept | Indian equivalent | Notes |
|---|---|---|
| Taxable account, high bracket | Earner at 30% (31.2%) | Default holder of all new money in most families |
| Tax-deferred / Roth account | (a) A **low-income member**: rebate headroom ≈ ₹12 L − total income for slab income; nil-band gap (₹4 L new regime) and ₹1.25 L LTCG exemption for equity gains. (b) **EEE wrappers**: PPF (₹1.5 L a year per individual, shared with own minor child's account), SSY (₹1.5 L a year per girl), EPF/VPF (salaried only, interest on employee contributions above ₹2.5 L a year taxable) | Capacity is **income**, not principal: ₹8 L of headroom at a 7% yield shelters about ₹1.14 Cr of principal (yearly-interest products), less for growth products sold in one lump |
| Contribution limit | Wrapper caps; willingness to gift; liquidity lock-ins (PPF 15 years) | |
| Same account under two names | **Clubbed pairs**: giver → spouse, son's wife, minor child, own HUF (s.99) | Evaluate the giver's tax. Exception: exempt income (PPF, SSY) stays exempt when clubbed, so a spouse's PPF is a real extra wrapper. Income on clubbed income (accretion) is not clubbed again (settled under old s.64; unconfirmed for the new Act) |
| Asset tax efficiency | Tax type from the foundation spec: `slab` and `interest` (least efficient for an earner), `other_lt` (12.5%, no exemption), `equity` (12.5% above ₹1.25 L), `exempt` | The gap between holders, not the rate, drives placement. Gap for slab income: up to 31.2 points. Gap for equity LTCG: 13 points, only on the first ₹1.25 L–₹5.25 L of gain per member per year |

Indian writing supports the direction, with legal cautions but no optimisation:

- Investing in a **parent's name** to use their lower slab is a standard suggestion. FDs are the typical example. The cautions: it must be a real gift, and the money becomes the parent's [S13 Freefincal; Practitioner, medium].
- After-tax comparisons of **senior FD vs debt funds** for FY 2026-27 rely on the same slab and 80TTB logic [S14 Value Research; Practitioner, medium].
- **Children:** income from money invested in a minor's name is clubbed. Keep gift declarations and report the income in the right parent's return [S15 Business Standard, 13 Nov 2026; Practitioner, medium].
- **Spouse:** a gift clubs the income back. Indian commentators say a loan escapes clubbing only if it is a real loan [S16 Business Today; S17 practitioner blogs; Practitioner/Opinion, low–medium]. Whether an **interest-free** loan escapes is disputed: some writers say a loan is not a "transfer" at all. Treat it as unsettled (section 6).
- The primary source on clubbing is the CBDT clubbing FAQ and s.99 [tax note; Institution, high].
- **Gifting mutual fund units** in non-demat form between people was enabled by SEBI/AMFI process changes. Industry posts say partial or full gifting is now possible [S18; Practitioner, low: the circular itself was not read].
- **GAAR** applies only above a **₹3 Cr tax benefit** in the year [S19 CBDT press release, 14 Jan 2013; Institution, high]. It codifies "substance over form" [S20 PwC; Practitioner, high]. The 2025 Act carries GAAR forward (clause 178 of the Bill, old s.95) [S21 TaxTMI; Practitioner, medium]. Family placement will almost never reach the threshold. The judge-made substance and sham doctrines (McDowell 1985, narrowed by Azadi Bachao 2003) apply at any size [Paper/case law from memory, medium].

I found no Indian academic or institutional work that frames cross-member placement as an optimisation. This is new ground, so the engine's assumptions must be stated and testable.

---

## 3. Recommended algorithm

### 3.1 Problem statement

**Decision:** `x[m][a]` = rupees of new money placed in asset class `a` in the name of holder `m`. Optionally also `y[g][m][s]` = units of an existing security `s` gifted in kind from `g` to `m` (relocation mode, phase 2).

**Objective:** maximise the family's after-tax wealth at the goal date(s):

```
maximise  Σ_o  AfterTax_o( bundle_o(x) , horizon )
```

where `o` ranges over **effective tax owners**: the holder, or the giver if the pair is clubbed. `bundle_o` is everything taxed in `o`'s hands: their own income sources plus every placed amount whose owner is `o`. `AfterTax_o` uses the foundation's single tax function (spec 6.3): for each year `t` of the horizon, tax with the bundle minus tax without it, using that year's interest, IDCW and planned sales. The result is the projected value net of that extra tax.

**Constraints:**

| # | Constraint | Form |
|---|---|---|
| C1 | Family allocation | `Σ_m x[m][a] = D_a` for every class, where `D_a` = the class's share of new money from the target split (new-money mode: `D_a = max(0, w_a·(W+N) − H_a)` rescaled to sum to `N`) |
| C2 | Money available | `Σ_a Σ_m x[m][a] = N`; each giver `g` gives at most `N_g` |
| C3 | Willingness to gift | `Σ_a x[m][a] ≤ G[g][m]` (the user's cap per recipient; 0 = never) for `m ≠ g` |
| C4 | Clubbing | owner(g, m) = g if m is g's spouse, son's wife, minor child, or an HUF g belongs to; minor child → the parent with higher income (s.99). Otherwise owner = m. Not a constraint; it changes whose tax is evaluated |
| C5 | Wrapper caps and eligibility | PPF: `x[m][PPF] + x[minor of m][PPF] ≤ ₹1.5 L − already deposited this FY`, individuals only, not HUF (opened from 2005, unconfirmed). SSY: girl under 10 at opening, ₹1.5 L. SCSS: age ≥ 60, ≤ ₹30 L total. VPF: salaried member only, with a flag when employee contributions pass ₹2.5 L |
| C6 | Liquidity per goal | Money for a goal dated before a product's lock-in ends cannot go into that product (PPF 15 y, SSY, SCSS 5 y, tax-saver FD 5 y) |
| C7 | Member's own needs | If a member draws living costs from their own assets (e.g. a retired parent), their holdings must cover `need_m` in suitable classes (the risk profile applies to their own money) |
| C8 | Simplicity | At most `k` (default 3) new holdings per member; no holding below a minimum ticket (default ₹25,000, or ₹500 for PPF/SSY) |
| C9 | Settled tax type only | Securities whose tax type is `check` are excluded (spec 4.2) |

**Non-linearity.** `AfterTax_o` is piecewise and **non-concave**:
- the ₹12 L rebate cliff, with marginal relief;
- the nil-band gap, used by slab income first, then by special-rate gains;
- the ₹1.25 L LTCG exemption;
- slab steps every ₹4 L;
- surcharge above ₹50 L.

An exact solver would need a mixed-integer model with binary variables at every kink (see 3.5). Greedy steps with the exact function, plus a swap pass, handle this well at this problem size.

### 3.2 Inputs

```ts
type PlacementInput = {
  members: Member[];            // spec 6.2: type, age, regime, residency, income sources, carried losses, links
  givers: { member: Id; amount: number }[];      // whose new money (default: manager)
  giftCap: Record<Id, Record<Id, number>>;       // C3, user-set; default: Infinity to parents and adult children, 0 to others
  classes: AssetClass[];        // id, taxType, listed, assumedReturn, incomeYield (yearly taxable part), lockInYears, wrapperRule?
  target: Record<ClassId, number>;               // family weights for new money (or gap amounts from the full planner)
  horizonYears: number;         // or per-goal buckets: run once per bucket, sharing members' headroom in time order
  saleRule: 'lump_at_end' | 'slice_yearly';      // spec 5.2 default lump_at_end; slice_yearly = harvest exemption each year
  stepSize: number;             // default max(₹10,000, N/400)
  rules: TaxRulesByYear;        // spec 6.4
};
```

### 3.3 Steps

1. **Owners.** For every (giver g, holder m) pair work out `owner(g, m)` from member links (C4). Drop holder options whose owner is the giver and whose tax type is not `exempt`: they behave exactly like the giver holding the money, so offering them adds paperwork for nothing. Keep them for PPF/SSY.
2. **Feasible options.** Option set `O = {(m, a)}` that passes C3, C5, C6, C9.
3. **Baseline.** Place everything with the giver(s), split by C1. Record `V0 = Σ_o AfterTax_o`. This is the "do nothing clever" comparison shown to the user.
4. **Greedy fill with regret (Vogel-style).** Start with `x = 0` and remaining demand `R_a = D_a`. While any `R_a > 0`:
   - For each class `a` with `R_a > 0` and each feasible `(m, a)` with spare capacity, compute the **marginal after-tax gain** of one step `δ = min(stepSize, R_a, capacity)`:
     `g(m,a) = AfterTax_owner(bundle + δ in a) − AfterTax_owner(bundle)` (exact function, all horizon years).
   - For each class: `best_a` = its highest `g`; `regret_a = best_a − secondBest_a` (if only one option, `regret_a = +∞`).
   - Pick the class with the highest regret (ties: higher `best_a`, then larger `R_a`, then a fixed order of class id and member id for determinism). Place `δ` with its best holder and update the bundle and `R_a`.
   
   Why regret rather than plain "best gain": a member's headroom is shared between classes. Plain greedy can give a parent's nil band to equity first and leave nowhere for debt. Regret places the class that loses most from going elsewhere. This is the standard improvement for transportation-type problems (Vogel's approximation method).
5. **Swap pass (local search).** Repeat until no improvement above ₹100, with step `s` starting at `stepSize` and halving down to ₹5,000:
   - For every pair of holders `m1 ≠ m2` and classes `a ≠ b` with `x[m1][a] ≥ s` and `x[m2][b] ≥ s`, try moving `s` of `a` from `m1` to `m2` and `s` of `b` from `m2` to `m1`. This keeps C1 and each member's total. Keep the move if the family total rises and C3–C8 still hold.
   - Also try **single moves** `x[m1][a] → x[m2][a]` within C3 (this changes how much each member receives).
   - **Cliff snap:** for every owner whose total income in any horizon year lies within ₹2 L above ₹12 L, try moving slab income or gains out until income is ≤ ₹12 L. Accept if better.
6. **Simplicity clean-up (C8).** Merge holdings below the ticket into the same member's largest holding or the next-best holder. If a member has more than `k` holdings, drop the smallest and re-run step 5 with those options removed.
7. **Rounding.** Round amounts to ₹1,000 (PPF to ₹500). Re-evaluate exactly and report.
8. **Outputs.**

```ts
type PlacementResult = {
  placements: { holder: Id; owner: Id; giver: Id; classId: ClassId; amount: number; isGift: boolean; clubbed: boolean }[];
  perMember: { id: Id; taxBaseline: number; taxPlan: number; afterTaxValue: number; headroomLeft: Headroom; flags: Flag[] }[];
  family: { afterTaxBaseline: number; afterTaxPlan: number; taxSaved: number; extraReturnPerYear: number };
  reasons: Reason[];            // one per placement, from the step that created it (3.4)
  moves: Move[];                // spec 6.2 Moves, kind 'place_new_money', with stable ids
};
```

`extraReturnPerYear = (afterTaxPlan / afterTaxBaseline)^(1/H) − 1`.

**Size and speed.** 5 members, 10 classes, 400 steps: about 400 × 50 = 20,000 tax evaluations in step 4, plus a few swap rounds of about 5·4·10·9 = 1,800 trials. Each evaluation is `H` calls of a closed-form slab function. That is well under 50 ms in a browser. No library is needed, and the engine stays pure TypeScript (spec 6.6).

**Tests to write.**
- (a) The golden case in section 4 reproduces its numbers.
- (b) On random small families (2–3 members, 2–3 classes, step ₹50k), compare with brute-force enumeration of every grid placement. The result must be within 0.5% of the optimum, and equal to it in ≥95% of cases.
- (c) Invariants: C1–C9 hold; the plan is never worse than the baseline; gifts to clubbed pairs never appear for non-exempt classes; output is deterministic.
- (d) Cliff: a member at ₹11.5 L of income never receives slab income that pushes them over ₹12 L unless the gain beats the cliff cost.
- (e) Clubbing: a minor's placements are evaluated in the higher-income parent's hands.

### 3.4 Explanation (plain English)

Each placement keeps the reason from the step that chose it: the best holder, the runner-up and the rupee gap between them. Templates:

- **Headroom:** "₹12 L of the debt fund goes to **Mum**. Its gain of about ₹4.8 L in 2031 stays under her ₹12 L tax-free limit, so she pays **₹0**. In your name it would cost **₹1.51 L**. This is a gift from you: it becomes her money."
- **Exemption gap:** "₹7.7 L of the equity fund goes to **Aarav**. He has no income, so about ₹5.25 L of gains can be taken tax-free in one year (₹4 L unused nil band + ₹1.25 L exemption). Saves **₹68,000** compared with you."
- **Kept with the giver:** "The remaining ₹12.7 L of equity stays with **you**. Equity gains above everyone's free limits are taxed at the same 12.5% whoever holds them, so moving more saves nothing."
- **Clubbing:** "Not suggested for **Priya**: money you give your wife is still taxed as your income (clubbing)."
- **Cliff:** "Not more with **Dad**: his income would cross ₹12 L in 2031, and the next ₹1 L of gains would cost about ₹62,000."
- **Summary line:** "This plan keeps the family's 60/30/10 split and brings home **₹2.74 L more** over 5 years, about **0.9% a year** extra, all from who holds what."
- Always shown with each gift: "becomes theirs · counts as their income · passes by their will or nominee · keep: bank transfer from your account to theirs, signed gift letter" (spec 5.1).

### 3.5 Alternatives compared

| Method | Fits the cliff and gap? | Optimality | Browser cost | Explainability | Verdict |
|---|---|---|---|---|---|
| Rule of thumb ("debt to parents, equity to you") | Ignores it | Poor near the cliff, and when one member has both headroom and gap | Trivial | High | Only as the copy text |
| **Headroom buckets (fallback, 3.6)** | Treats capacities as hard limits; avoids the cliff by margin | Good away from the cliff | Trivial | High | **Fallback** |
| Daryanani difference ranking [S3] with constant marginal rates | No: rates change as money is placed | Good when rates are flat | Trivial | High | Superseded by the greedy below |
| **Greedy with exact function + regret + swaps (3.3)** | Yes, exact at every step | Near-optimal; checked against brute force in tests | ~20k evaluations, <50 ms | High: each step is a reason | **Recommended** |
| LP [S10] | Needs a linearised tax; can't represent the cliff | Exact only for the linear model | Small LP; JS solvers exist (e.g. `javascript-lp-solver`, `glpk.js`; versions to pin, not checked) | Medium: needs reduced-cost explanations | Not needed: the problem is not linear |
| MILP with piecewise tax (binaries at slab kinks and the rebate test; SOS2 for marginal relief) | Yes | Globally optimal on the model | WASM solver (`highs-js` or `glpk.js`), heavier bundle, solve times can vary | Low | Use **offline** as the test oracle for bigger cases, not in the app |
| Convex relaxation + fix discrete choices [S11] | Partly | Very good in the US setting | Needs a convex solver | Low | Overkill for 5 × 10 |

### 3.6 Fallback: headroom buckets

For each candidate holder `m` (with `owner = m`, i.e. not clubbed) and each horizon year, compute:

1. `slabRoom_m = max(0, ₹12 L − projectedTotalIncome_m − margin)`. Use a margin of ₹50,000 against estimate error. On the old regime, or with income already above ₹12 L, use the room left to the member's next slab instead, priced at their marginal rate.
2. `gapRoom_m = max(0, nilBand − slabIncome_m)` (residents only); `ltcgRoom_m = ₹1.25 L` a year (or once in the sale year under `lump_at_end`).
3. `ppfRoom_m`, `ssyRoom_m`, `vpfRoom_m` from C5, if C6 allows.

Then:

1. Fill **exempt wrappers** within C6 and C3. Order: PPF of the giver, then of clubbed relatives (still exempt), then of non-clubbed relatives.
2. Fill **slabRoom** with the `slab`/`interest` classes, highest yield first. Convert income room to principal: `principal = room / annualTaxableYield` for yearly-taxed products, or `room / cumulativeGainFraction(H)` for lump-sale products. Members are ordered by largest room.
3. Fill **gapRoom + ltcgRoom** with `equity` gains first, then `other_lt` gains (same 12.5% rate, but no ₹1.25 L exemption, so use only the gap). The equity gap is applied only after the member's slab income.
4. Everything left goes to the giver.
5. Run the exact tax function once on the result and show it beside the baseline.

It is correct on the worked example below and fails only when a member is close to the cliff or the margin is set badly. Use it if the greedy slips, and as an independent cross-check in tests: the greedy must never be worse.

---

## 4. Worked example: a 5-member family

**Family** (all resident, new regime, FY 2026-27 rules held flat; a single sale at the end of year 5, as in spec 5.2):

| Member | Age | Income | Relation to giver | Clubbed? |
|---|---|---|---|---|
| Rahul (giver, manager) | 42 | Salary ₹25 L → taxable ₹24.25 L (30% marginal) | – | – |
| Priya | 40 | Salary ₹9 L → taxable ₹8.25 L | Wife | **Yes** |
| Dad | 68 | Pension ₹3 L → taxable ₹2.25 L | Father | No |
| Mum | 65 | None | Mother | No |
| Aarav | 20 | None (student) | Adult son | No |

**New money:** ₹40 L from Rahul, 5-year goal. **Target split:** 60% equity fund (₹24 L), 30% debt fund (₹12 L, `slab`), 10% gold ETF (₹4 L, `other_lt`). **Assumed returns:** equity 11%, debt 7%, gold 9% (placeholders pending topic 2). Growth factors over 5 years: 1.6851, 1.4026, 1.5386.

| Class | Principal | Value at year 5 | Gain |
|---|---|---|---|
| Equity | ₹24.00 L | ₹40.44 L | ₹16.44 L |
| Debt fund | ₹12.00 L | ₹16.83 L | ₹4.83 L |
| Gold ETF | ₹4.00 L | ₹6.15 L | ₹2.15 L |

**Baseline: all in Rahul's name.** Total income in year 5 = ₹24.25 + 16.44 + 4.83 + 2.15 = ₹47.7 L (under ₹50 L, so no surcharge).
- Debt: ₹4.83 L × 31.2% = **₹1,50,700**
- Equity: (₹16.44 L − ₹1.25 L) × 13% = **₹1,97,500**
- Gold: ₹2.15 L × 13% = **₹28,000**
- Total tax **₹3,76,200**; after tax ₹59.66 L.

**Plan (greedy with regret; the fallback gives the same answer):**
1. Debt has the highest regret: 31.2% with Rahul vs 0% with any of the three non-clubbed members. Its ₹12 L goes to **Mum**. Her year-5 income is ₹4.83 L, under ₹12 L, so the rebate applies. Tax **₹0**.
2. Equity has the next highest regret. **Aarav** has ₹4 L of unused nil band plus ₹1.25 L of exemption, so ₹5.25 L of gain is tax-free. Principal = 5.25 / 0.6851 = **₹7.66 L**. Tax **₹0**.
3. Gold to **Dad**. His nil-band gap is ₹4 L − ₹2.25 L = ₹1.75 L, which covers most of the ₹2.15 L gain. Tax = (2.15 − 1.75) × 13% ≈ **₹5,300**. This assumes the rebate does not cover gold's 12.5% LTCG; if it does, the tax is ₹0 (open question 2).
4. More equity to use the ₹1.25 L exemptions of Mum and Dad: principal 1.25 / 0.6851 = **₹1.82 L each**. Mum's income becomes ₹6.08 L and Dad's ₹4.4 L, both under ₹12 L. Tax ₹0 (Dad's gap is already used by the gold).
5. The remaining equity, ₹24 − 7.66 − 1.82 − 1.82 = **₹12.70 L**, stays with Rahul. Gain ₹8.70 L; tax (8.70 − 1.25) × 13% = **₹96,900**.
6. The swap pass finds nothing better. Swapping Mum's debt with Aarav's equity gives the same total, and the tie-break keeps the plan.
7. **Priya** is never chosen: money from Rahul in her name is clubbed back to him.

| Holder | Gift from Rahul | Holds | Tax at year 5 |
|---|---|---|---|
| Rahul | – | Equity ₹12.70 L | ₹96,900 |
| Mum | ₹13.82 L | Debt ₹12 L, equity ₹1.82 L | ₹0 |
| Aarav | ₹7.66 L | Equity ₹7.66 L | ₹0 |
| Dad | ₹5.82 L | Gold ₹4 L, equity ₹1.82 L | ₹5,300 |
| **Family** | | 60/30/10 kept | **₹1,02,200** |

**Result:** tax falls from ₹3.76 L to ₹1.02 L, **₹2.74 L saved** on ₹40 L over 5 years. After tax: ₹62.40 L vs ₹59.66 L, so **≈0.90% a year** of extra return. That is about 1.5–9× the US asset-location estimates (F3, F5, F6), because the rate gap is 31 points instead of about 15–20, and the "shelter" costs nothing to open.

**Two traps the engine must catch:**
- **Priya's own savings and the cliff.** If Priya put her **own** ₹12 L into the same debt fund, her year-5 income would be 8.25 + 4.83 = ₹13.08 L. That crosses ₹12 L and loses the rebate. Tax ≈ ₹79,200, or **16.4%** of the gain, while she pays ₹0 on her salary today. Placing ₹7.6 L or less keeps her under the line (gain ≈ ₹3.06 L → ₹11.31 L). Rough rules ("she's in the 10% slab") miss this; the exact function catches it.
- **Concentration with elders.** Mum would own ₹13.8 L outright. If she dies first, it passes by her will or nominee, not back to Rahul automatically. The plan shows an estate flag and lets the user cap gifts to any member (C3).

**What the example leaves out:** yearly harvesting of each member's ₹1.25 L (topic 4), which would cut Rahul's ₹96,900 further; PPF, excluded here because of the 5-year goal (C6); and costs (stamp duty 0.005% on purchase, exit loads), which are small at this horizon.

---

## 5. Features this enables

| Feature | One line | Evidence |
|---|---|---|
| Where to put new money (beta) | Ranked holder for each part of a new sum, keeping the family split | F3, F4, F8; §4 shows ₹2.74 L on ₹40 L |
| Gift-in-kind relocation (later) | Move existing units to a nil-tax member without selling; no tax on the gift (s.92) | §2.1 "does not carry over" (b); S18 (mechanics unconfirmed) |
| Headroom meter per member | Show each member's room left: ₹12 L rebate, nil band, ₹1.25 L, PPF | §3.6; tax note 4.1 |
| Cliff warning | Warn before any move that takes a member over ₹12 L | Tax note Example 3; §4 Priya trap |
| Family PPF/SSY filler | Use every member's ₹1.5 L wrapper where the goal is long enough, including a spouse's PPF (exempt even if clubbed) | C5; tax note 3.7 |
| "Tax alpha" figure | Rupees and % a year added by placement vs all with the giver | F5–F7 for framing; §4 |
| Clubbing explainer | Says why a spouse or minor is not suggested | s.99; S15–S17 |
| Gift paperwork pack | Bank transfer, gift letter and estate note with every cross-member move | §6; spec 5.1 |
| Re-plan yearly | Re-run placement each April or on income changes | F10 |

---

## 6. Legal cautions and open questions

**Cautions (show in the app; not advice):**
1. **Real gift only.** The money must leave the giver for good: transferred from the giver's bank account to the receiver's, invested in the receiver's own folio with their KYC, PAN and bank, and controlled by them. If the giver keeps control, or the income flows back, the transfer can be treated as a **sham**, with the income taxed to the giver. Property held in a parent's sole name and paid for by a child is not covered by the benami Act's family exceptions (spouse, child, joint holding with lineal relatives). Whether a genuine gift ever creates benami exposure is **low-confidence**; it needs a CA's view before launch.
2. **Documents.** A gift of money or units needs no registration, but keep: (a) the bank transfer, (b) a signed gift letter or deed (some states charge stamp duty on deeds), (c) the date, to fix cost and holding period. The receiver reports the income, and AIS will show it.
3. **Clubbing (s.99):** spouse, son's wife, minor child, transfers to anyone for the benefit of the spouse or son's wife, and a member's own property put into their HUF. **Cross or circular gifts** (A gives to B's wife and B gives to A's wife; or child → parent → child's spouse or HUF) are looked through by the courts (Keshavji Morarji, SC 1967; from memory, medium). The engine must reject routing through a third member to reach a clubbed person.
4. **GAAR:** applies only above ₹3 Cr of tax benefit [S19], so not a practical risk for family placement. Judge-made substance-over-form still applies (item 1).
5. **Estate and family risk.** Gifted money belongs to the receiver: it is reachable by their creditors, passes under their will, and is split under succession law if they have no will. An adult child can spend it. Offer per-member gift caps and a will/nominee checklist.
6. **Parents' compliance.** A parent receiving more income may need to file a return. Seniors with no business income pay no advance tax. Form 121 stops TDS when tax is nil (tax note 3.8).
7. **Adviser rules.** Suggesting holders and products is investment advice. At public launch it needs risk profiling per member (whose money it becomes) and the recommendation record (spec 6.2).

**Open questions:**
1. **Gains and the ₹12 L test.** Do special-rate gains count toward ₹12 L? The common reading says yes (tax note Q10). The engine follows it; a rule flag allows the other reading.
2. **Gold ETF / `other_lt` LTCG and the rebate:** is it excluded from the s.156 rebate like s.196/198? The example assumes yes (conservative). Confirm the new-Act section for old s.112 and how s.156(3) reads.
3. **Interest-free loan to a spouse:** does it escape clubbing? Commentators differ [S16, S17]. Default: the engine offers only market-rate loans (lender taxed on the interest), or none.
4. **Cost and holding period carry-over** on gifts under the new Act (tax note Q8): needed for gift-in-kind relocation.
5. **MF unit gifting process** (SEBI/AMFI), its fees, and whether every AMC and RTA supports it [S18 unverified].
6. **PPF for an HUF / NRI members:** exclude in code until confirmed.
7. **Horizon assumption:** with a single lump sale at the end, a member's whole gain lands in one year and can hit the cliff. With `slice_yearly` it does not. Which default should "where to put new money" use? The foundation spec chose lump-at-end for this round, which is conservative for placement.
8. **Return assumptions** come from topic 2. The ranking is sensitive to the debt-vs-equity return gap (F3). Show a sensitivity line ("if equity returns 9%, the plan is the same / changes to …").

---

## 7. Sources

| # | Source | Label | Confidence |
|---|---|---|---|
| S1 | Dammon, Spatt & Zhang, "Optimal Asset Location and Allocation with Taxable and Tax-Deferred Investing", *Journal of Finance* 59(3), 2004. https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.2004.00655.x ; PDF https://personal.utdallas.edu/~hxz054000/JOFI_2.pdf | Paper | High |
| S2 | Shoven & Sialm, "Asset Location in Tax-Deferred and Conventional Savings Accounts", *Journal of Public Economics* 88, 2004; NBER w7192. https://www.nber.org/papers/w7192 | Paper | Medium (abstract only) |
| S3 | Daryanani & Cordaro, "Asset Location: A Generic Framework for Maximizing After-Tax Wealth", *Journal of Financial Planning*, Jan 2005. https://www.financialplanningassociation.org/sites/default/files/2021-10/JAN05%20JFP%20Daryanani%20PDF.pdf | Paper | High |
| S4 | Reichenstein, "After-Tax Asset Allocation", *Financial Analysts Journal* 62(4), 2006. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=922293 | Paper | High |
| S5 | Reichenstein, "The Asset Location Decision Revisited", *Journal of Financial Planning*, Nov 2013. https://www.financialplanningassociation.org/article/journal/NOV13-asset-location-decision-revisited-0 | Paper | High |
| S6 | Vanguard, "Putting a value on your value: Quantifying Vanguard Advisor's Alpha". https://www.vanguardsouthamerica.com/content/dam/intl/americas/documents/latam/en/2022/08/mx-sa-2335954-putting-a-value-on-your-value-quantifying-vanguard-advisors-alpha.pdf | Institution | High |
| S7 | Vanguard (Jacobs & Zorn), "When and how asset location matters", June 2026. https://corporate.vanguard.com/content/dam/corp/research/pdf/when_and_how_asset_location_matters.pdf | Institution | High |
| S8 | Blanchett & Kaplan, "Alpha, Beta, and Now… Gamma", *Journal of Retirement*, 2013. https://www.morningstar.com/content/dam/marketing/shared/research/foundational/677796-AlphaBetaGamma.pdf | Paper | Medium |
| S9 | Morningstar, "The Value of a Gamma-Efficient Portfolio". https://www.morningstar.com/content/dam/marketing/shared/research/foundational/831611-GammaEfficientPortfolio.pdf | Institution | Medium |
| S10 | Betterment, "Asset location methodology". https://www.betterment.com/resources/asset-location-methodology | Practitioner | High |
| S11 | Moehle, Kochenderfer, Boyd & Ang, "Tax-Aware Portfolio Construction via Convex Optimization", arXiv 2008.04985, 2021 | Paper | High |
| S12 | Johansson & Boyd, "A Tax-Efficient Model Predictive Control Policy for Retirement Funding", arXiv 2507.10603, 2025 | Paper | Medium |
| S13 | Freefincal (M. Pattabiraman), "Eight unusual ways to save tax in India" (investing in a parent's name). https://freefincal.com/eight-unusual-ways-to-save-tax-in-india-with-examples/ | Practitioner | Medium (excerpt read) |
| S14 | Value Research, "Senior citizen FD vs debt funds: after-tax returns in 2026". https://www.valueresearchonline.com/learn/mutual-funds/senior-citizen-fd-vs-debt-funds-after-tax-returns/ | Practitioner | Medium (excerpt read) |
| S15 | Business Standard, "Investing in your child's name? Know the income tax clubbing rules", 13 Nov 2026. https://www.business-standard.com/finance/personal-finance/investing-in-your-child-s-name-know-the-income-tax-clubbing-rules-126111301599_1.html | Practitioner | Medium |
| S16 | Business Today, "Can lending money to your spouse, instead of gifting, help avoid clubbing?" (social post of article) https://www.facebook.com/BusinessToday/posts/1424110996429941/ | Practitioner | Low |
| S17 | CA Gaurav Garg, "When Love Meets Tax: Husband, Wife & Clubbing Provisions" (LinkedIn); TaxFetch, "Clubbing of income rules 2026" https://taxfetchindia.com/blog/taxation-time/clubbing-income-rules-2026-husband-wife-tax | Opinion / Practitioner | Low |
| S18 | Gifting of MF units: AMFI transmission guidelines (Circular 110/2023-24) https://www.amfiindia.com/Themes/Theme1/downloads/circulars/SEBI/CU149-AMFI%20BP%20cir%20110%20dt.%2031-Jan-24.pdf ; industry note https://www.manchesterfinserv.com/blog/Nomination,-Transmission-and-Gifting-in-Mutual-Funds | Institution / Practitioner | Low (gifting circular itself not read) |
| S19 | CBDT press release, 14 Jan 2013: GAAR ₹3 Cr tax-benefit threshold. https://www.incometaxindia.gov.in/w/press-release-dated-14-1-2013-press-release-dated-14-1-2013 | Institution | High |
| S20 | PwC India, "GAAR Decoded" (2017). https://www.pwc.in/assets/pdfs/publications/2017/gaar-decoded.pdf | Practitioner | High |
| S21 | TaxTMI, "Clause 178 of the Income Tax Bill, 2025 vs section 95". https://www.taxtmi.com/tmi_notes?id=1644 | Practitioner | Medium |
| — | Tax rules, clubbing and gift sections: see the tax note `docs/research/2026-11-15-family-financial-planning.md`, section 7 (primary sources) | Institution | High |
| — | Vogel's approximation method (regret heuristic for transportation problems): standard operations-research textbook method (e.g. Taha, *Operations Research: An Introduction*) | Paper/textbook | High (method), cited from memory |
