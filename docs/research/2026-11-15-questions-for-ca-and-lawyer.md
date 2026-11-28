# Questions for a CA and a lawyer

Drafted 15 Nov 2026 from the open questions in the research notes (`docs/research/`). Two sheets, ready to send: one for a chartered accountant (tax), one for a lawyer (SEBI, IRDAI, data protection, consumer law). Within each sheet, questions are ranked by what they block first. Each says what the app does today, so a "yes, that's right" is a useful answer.

All tax questions are for **FY 2026-27 under the Income-tax Act 2025, as amended by the Finance Act 2026**.

---

## Sheet A: for a chartered accountant

### Blocks the beta (the engine's tax maths depends on it)

1. **₹12 L rebate test and special-rate gains.** Do short-term equity gains (s.196, 20%) and long-term equity gains (s.198, 12.5%) count as "income" for the ₹12 L limit in s.156? *App today:* yes, they count (the common reading), so ₹1 L more gain on ₹11 L of interest can cost about ₹61,750; it shows "check with a CA" when a member is within ₹2 L of the line. *Why it matters:* it decides how much each member can harvest or hold.
2. **Rebate and other long-term gains.** Does the s.156 rebate cover the 12.5% tax on long-term gains from gold ETFs, international funds and in-between hybrid funds (old s.112, no ₹1.25 L exemption)? *App today:* no, it does not. *Affects:* which member should hold gold.
3. **Order of setting off a short-term loss.** May the taxpayer apply a short-term capital loss to slab-taxed or 20% gains first, rather than to long-term equity gains that the ₹1.25 L exemption would have covered anyway? Same question for a house property loss against special-rate gains vs slab income (s.109). *App today:* picks the order that gives the lowest tax and shows it.
4. **Debt-fund units bought before 1 April 2023.** Confirm from the text of s.76 (old s.50AA) that these lots are outside the "specified mutual fund" rule and get long-term treatment after 24 months. *App today:* decides tax type per lot on that basis.
5. **Holding periods.** Gold and silver ETFs and international fund-of-funds in FY 2026-27: 12 months (listed) or 24 months?
6. **Sovereign Gold Bonds.** After Budget 2026, is the redemption exemption only for original subscribers who hold to maturity?

### Blocks gift suggestions (beta: "where to put new money" across members)

7. **Cost and holding period of a gifted asset.** Which section of the new Act keeps the giver's cost and purchase date for the receiver (old s.49(1) and s.2(42A))? Gift-in-kind suggestions depend on it.
8. **Gifting mutual fund units.** Can units held in an account statement (not demat) be gifted between family members today, and which registrars allow it? Demat units can be moved off-market.
9. **Income on clubbed income.** Under the new Act, is income earned on income that was already clubbed (e.g. interest on interest from money gifted to a spouse) taxed in the spouse's own hands? Long-run plans for a homemaker spouse rely on it.
10. **Grandparent paying a grandchild's school fees directly.** Confirm this is not a gift to a minor, not clubbed, and creates no deemed income.
11. **Real gift vs sham.** For a genuine bank-to-bank gift to a parent or adult child, invested in their own folio under their own KYC, is there any benami or "colourable device" risk the app should warn about beyond keeping the gift letter and transfer record?
12. **Loans to a spouse.** Does an interest-free loan, or a loan at a market rate, avoid clubbing under s.99? *App today:* suggests no spouse loans until this is answered.

### Needed for the full planner

13. **NPS at retirement.** Which section exempts the 60% lump sum under the new Act, and how are systematic withdrawals of any taxable part taxed?
14. **EPF interest after retirement** (or after leaving a job): taxable or not, and from when?
15. **Annuity income:** taxed as salary/pension (with the ₹75,000 standard deduction) or as other income?
16. **TCS on education remittances abroad** (2% above ₹10 L, nil if loan-funded): the new-Act section and current rates.
17. **Presumptive income (old s.44AD) under the new Act:** turnover limits, 6% / 8% rates and the digital-receipt condition.
18. **Joint home loan split** between co-owners: any new-Act guidance.
19. **Section numbers to confirm:** TDS thresholds on interest (₹50,000 / ₹1 L seniors) in s.393; 80D, 80DD, 80DDB, 80U, 80G equivalents; bonus and dividend stripping (old s.94(7), (8)); FIFO for demat (old s.45(2A)); the cash-payment bar for health premiums.
20. **Same-scheme rebuy.** Does selling a mutual fund and buying the same scheme the next day (to reset cost) draw different scrutiny from doing it with shares?

### Fund tax types (D1 #40; detail in `2026-11-28-fund-tax-types.md` §7.2)

Question 5 above is partly answered there from the Act's text: unlisted non-equity units need 24 months (s.2(101)); listed units look like 12. Question 21 asks a CA to confirm the listed half.

21. **Listed ETFs.** Is a listed gold, silver or overseas ETF unit a "security listed in a recognised stock exchange" under s.2(101)(b)(i), so long-term after 12 months?
22. **FoF of several ETFs.** Does a fund of funds that splits 90% or more across two or more Indian equity ETFs meet s.198(8)(i), given the words "another fund"?
23. **Arbitrage positions.** For the 65% test in s.198(8), do shares held against short futures count in full?
24. **SID says equity, average says not.** If a balanced advantage or multi asset fund's SID says "equity oriented" but its annual average falls under 65%, which treatment applies to the investor, and who bears the error?
25. **Gold FoF bought in 2024.** A gold FoF unit bought in June 2024 and sold in December 2026: deemed short-term under s.76, or long-term after 24 months under s.2(101)? In other words, is specified-fund status tested at transfer under the 2025 wording?
26. **Conservative hybrid with gold.** A conservative hybrid holding 70% debt, 10% gold and 20% equity: specified mutual fund or not?
27. **STT on an equity FoF.** Is STT charged when an equity FoF unit is redeemed, as s.198 needs for the 12.5% rate?

---

## Sheet B: for a lawyer (SEBI, IRDAI, DPDP, consumer law)

Context to give them: a free, invite-only app for family and friends this year, recommending which family member should hold which investment, by after-tax result. The founder will register as a SEBI investment adviser before a public launch.

### Blocks the beta

1. **Unregistered advice in a free private beta.** Is a free, invite-only beta that recommends specific moves (with a "not a registered adviser" disclaimer) acceptable before RIA registration, or should the beta's suggestions be framed only as calculations until then?
2. **CCPA dark-pattern guidelines (2023).** Do they apply to a free, invite-only app with no transaction?
3. **DPDP Act and a manager entering family members' data.** One manager signs in and records that each adult agreed. Is that enough consent for adults? What is needed for children's data (parental consent)?

### Needed for the public launch

4. **SEBI's ban on "assumptions or projections."** Does it cover only advertisements, or also in-app messages to clients, such as "in about 8 of 10 market paths you reach this goal" or a push notification? This decides how goal chances and after-tax projections may be shown.
5. **Common Advertisement Code:** the circular's text and start date, and whether it covers push notifications and in-app messages.
6. **Risk-profile consent.** SEBI's Master Circular asks for consent by registered email or a physical document. Is tapping "I agree" in the app enough, or must the app email the profile and record a reply?
7. **Messages the app writes for users to send** (e.g. "send her the steps" on WhatsApp): are these communications that must carry the adviser disclaimer?
8. **Who is a separate client.** Is an earning spouse, an earning adult child or a parent with their own pension part of the client's "family" for fees and risk profiling, or a separate client?
9. **Insurance.** Were IRDAI's 2017 Web Aggregator Regulations replaced in 2024? May a non-intermediary app show a user's own policies and a rupee gap in cover (no products, no ranking, no links)?
10. **Loans.** Do RBI's digital lending rules affect an app that only compares prepaying a loan with investing, and never routes users to a lender?
11. **AI disclosure (IA Reg 18(9)):** what must be disclosed when suggestions are computed by software and some explanations use an AI model?
12. **Plan buddy (later):** is showing one member's plan to another family member a third-party data share under DPDP and IA confidentiality, even with that member's consent?

---

## Already settled without a professional

These were open in the notes but are now decided or answered: SEBI fee cap (₹1.51 L per family a year or 2.5% of assets advised); free-trial bar (IA Regulations and Master Circular of 27 Jun 2025); GAAR threshold ₹3 Cr (not a practical risk for family placement).
