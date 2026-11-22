# Lot dating, transfers and corporate actions for the holdings-first engine

Research note, 22 Nov 2026. Question: are the dating and cost calls in `docs/superpowers/specs/2026-11-22-holdings-first-engine-design.md` safe under Indian tax law and broker practice? In particular, (a) trimmed units dated at the file date, (b) a sale from a guessed-date lot counted as long-term, and (c) filled-in lots dated a year and a day before the first sale they feed.

Scope: listed shares, ETFs and mutual fund units held by resident individuals, FY 2026-27 under the Income-tax Act 2025 (in force 1 Apr 2026, as amended by the Finance Act 2026), with old-Act (1961) references for history. Brokers: Zerodha and Angel One. Planning estimates, not filing. No personal data was opened or used. Nothing in `data/private/` was read.

Confidence labels (same as the other notes): **High** = read in the source or settled law; **Medium** = read in a secondary source, or a primary page paraphrased by a tool; **Low** = my inference, a user forum, or unconfirmed.

Access note: incometaxindia.gov.in refused most direct fetches (HTTP 403) in this session. One old-Act page (s.2(42A)) was read through a scraper. New-Act section text comes from the reproductions on eztax.in and taxclue.in. Those numbers should be checked against the official text before they go into user-facing copy.

---

## 1. Summary

1. **The law backs the core of the design.** FIFO runs per demat account (Circular 768; new Act s.67(7)(c)). A gift is not a transfer for the giver, and the receiver keeps the giver's cost and holding period (s.70(1)(b), s.73(1) Table Sl. 1, s.2(101)(c)). An own-account move is not a sale. So "a trimmed unit stops being held, with no gain" is right for gifts and own-account moves.
2. **Two broker behaviours break the "broker totals win" and "trust the long-term count" assumptions.**
   - Zerodha books a Console gift as an *exit at the transfer-day closing price* for the giver, and as an *entry at that price* for the receiver. The giver's Tax P&L can therefore show a gain on a gift that the law doesn't tax. The receiver's cost and date are wrong for tax purposes.
   - Angel One users report that the purchase date of transferred-in shares can't be edited. Their long-term units then show as short-term.
3. **Corporate actions are the biggest new risk.** Bonus shares, splits, demergers and IPO allotments don't appear in the normal tradebook. Without them, the reconcile step would fill in "missing" units at the file's average cost. That can overstate cost by far more than the 10% cushion, so room would be overstated. Buybacks are capital-gains sales again from 1 Apr 2026. A buyback tender that the trim step treats as "left the account" would drop a real, taxable gain.
4. **Call (b) is safe for gains but not for losses.** Counting a guessed-date *gain* as long-term uses room, so moves stay safe. Counting a guessed-date *loss* as long-term lets it cut long-term gains and so *frees* room, which can be more room than the truth.
5. **Call (c) is a planning assumption, not something the law or the file proves.** The holdings file's long-term count is measured at the file date, not at the earlier sale date. Units older than the history are only known to predate its first trade. If the tradebook covers one year, some of them could be under 12 months old at the sale. It is safe for gains for the same reason as (b), but it should carry the same "Needs checking" label.

---

## 2. Findings with citations

### 2.1 Broker "long-term quantity" in holdings exports (Q1)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| B1 | Zerodha splits holdings into long-term and short-term by each purchase's age (more than 365 days is long-term). Sales are matched FIFO: the earliest purchased units are treated as sold first. You can view the two groups separately but cannot sell them separately. | Zerodha Support, "View LTCG and STCG holdings" | Broker, High |
| B2 | Shares that arrive from another broker, an ESOP or an off-market transfer have no buy average ("N/A", the "discrepancy" flag). The user enters each lot's purchase date, price and quantity on Console. The date must be **on or before the demat credit date**, and the buy average is then worked out FIFO. An entry is locked once processed. | Zerodha Support, "How to update buy average"; "Multiple trades (discrepant)"; "Why is the buy average N/A" | Broker, High |
| B3 | Zerodha doesn't say how an un-updated discrepant lot is counted in the long-term column. | Same pages (silent) | **Unresolved** |
| B4 | **Gifts made through Console:** Zerodha uses the transfer-day closing price as the giver's *exit price* and the receiver's *entry price*, and "reflects" this in the Tax P&L. The same article says that for tax the cost is the previous owner's price and the holding period runs from the previous owner's purchase. It suggests editing the Tax P&L when filing. | Zerodha Support, "Tax implication on gifting of stocks"; "Things to consider when filing taxes using Zerodha's reports" | Broker, High (what Zerodha does); the exact Tax P&L line it creates was not seen, Medium |
| B5 | **Transfers out by other routes** (CDSL Easiest, a delivery instruction slip): Zerodha posts no exit entry. P&L and Tax P&L stay unchanged unless the user sends reversal details. | Zerodha Support, "Things to consider when filing taxes" | Broker, High |
| B6 | **Between a holder's own Zerodha primary and secondary demat:** Console carries buy averages over automatically (within about 48 working hours) and "applies FIFO" on the transfer. These moves are not in the Tax P&L. Zerodha markets the secondary account for "better FIFO management". The page doesn't say whether the original purchase date carries over. | Zerodha Support, "Secondary demat FAQs" | Broker, High (cost carries); Medium (date) |
| B7 | Angel One works out average price FIFO. Depositories move only the quantity in an off-market transfer, so the holding first shows "NA" or a default buy price. Angel's knowledge-centre guide says to use "Update Buy Price" with the original date and price. | Angel One Support, "Holdings / portfolio"; Angel One Knowledge Center, "How to transfer shares from one demat account to another" | Broker, High (FIFO); Medium (generic guide) |
| B8 | Angel One users report that only the price can be edited, once, and that the **purchase date can't be edited**. Long-term gains then show as short-term. | Angel One community threads 6217 and 6918 (pages refused to load; read via search snippets); Moneylife reader Q&A | Forum, **Low** |
| B9 | No Angel One page found explains how "LTCG Quantity / STCG Quantity" in "Your Holding Details" is computed. | Searched angelone.in support and knowledge center | **Unresolved** |

**Can the long-term count overstate?** Not under the broker's own rule. It can when the input is wrong: a user enters an older purchase date for a transferred-in lot than the true one (Zerodha accepts any date up to the credit date), or the broker hasn't yet applied a bonus or demerger. In the common gift and transfer cases the error goes the *other* way. Zerodha dates a Console gift at the transfer day (B4), and Angel may not let the date be fixed (B8), so long-term units are **understated**. My inference, Medium.

### 2.2 Gifts and own-account transfers (Q2)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| G1 | **Old Act:** s.2(42A) Explanation 1(i)(b) adds the previous owner's holding period for assets acquired by a s.49(1) mode (gift, will, inheritance). Clause (g) adds the demerged-company period for shares received in a demerger. Listed securities are short-term if held 12 months or less. | incometaxindia.gov.in, s.2(42A) of the 1961 Act (read via scraper) | Statute, High |
| G2 | **New Act, giver:** s.70(1), clause (b) (the second clause), says a transfer of a capital asset by an individual or HUF under a gift, will or irrevocable trust is not a transfer. This is the old s.47(iii). | eztax.in reproduction of s.70; aaptaxlaw and aubsp commentaries | Statute via reproduction, Medium–High |
| G3 | **New Act, receiver's cost:** s.73(1) Table Sl. 1 deems the cost to be the previous owner's cost plus improvements, for gifts, wills and inheritance (old s.49(1)). Under s.73(2)(a), "previous owner" is the last owner who acquired the asset other than by those modes. If the previous owner's cost can't be found, s.90 uses the fair market value on the day the asset became the previous owner's (old s.55(3)). | eztax.in reproductions of s.73 and s.90 | Statute via reproduction, Medium–High |
| G4 | **New Act, receiver's holding period:** s.2(101)(c) includes the holding period of the previous owner under s.73(1) Table Sl. 1 (old s.2(42A) Expl. 1(i)(b)). Listed shares and equity funds are short-term at 12 months or less (s.2(101)(b)). | taxclue.in summary of s.2(101); search reproductions | Statute via secondary summary, Medium |
| G5 | **Own-account moves:** moving shares between your own demat accounts is not a transfer (no change of owner, no consideration). Zerodha leaves them out of the Tax P&L, and practitioners cite the s.2(47) "transfer" definition. | Zerodha Secondary demat FAQs (B6); TradingQnA answer | Broker High; law Medium (no CBDT text found) |
| G6 | A gift from a "relative" is not income for the receiver. A gift of shares from a non-relative worth over ₹50,000 is taxed as other income for the receiver. | Angel One Knowledge Center (transfer article); Zerodha gift tax article | Broker, Medium–High |
| G7 | **How to record the right cost and date:** at Zerodha, add discrepant trades (B2) for transfers in, or edit the Tax P&L when filing. For Console gifts, Zerodha sets the price itself (B4), so the receiver must correct it at filing. At Angel, use Update Buy Price (B7), possibly without a date (B8). | B2, B4, B7, B8 | High / Low as marked |

### 2.3 Sales with unknown purchase date or cost (Q3)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| U1 | **No legal default exists** for a sale whose lot date is unknown. The taxpayer must show the actual date and cost. Circular 768 says to match the sale FIFO, then take date and cost from that purchase's contract note. The only statutory fallback for cost is for gifted or inherited assets: the fair market value on the day the previous owner acquired it (G3). | Circular 768 (taxguru reproduction); s.90 (eztax) | Circular/Statute, Medium–High |
| U2 | Brokers and filing tools don't invent a date. Zerodha requires a manual entry or a Tax P&L edit, and warns that a later sale's P&L is otherwise wrong. Quicko's template needs a buy date and buy price for each row. | Zerodha "Things to consider"; Quicko Help, "Add capital gains using Excel template" | Broker/Tool, High |
| U3 | For a pre-1 Feb 2018 lot, cost is the higher of actual cost and the lower of the 31 Jan 2018 FMV and the sale value (new Act s.90(7); old s.55(2)(ac)). Getting the date wrong can lose this. Zerodha's FMV is not adjusted for later corporate actions. | eztax.in s.90; Zerodha "Things to consider"; TaxGuru article | Statute via reproduction, Medium–High; Practitioner, Medium |
| U4 | Practitioners say not to use an approximate date. They rebuild it from the old broker's contract notes, the depository CAS or transaction statement, or the giver's records, and check against the AIS. The AIS can show a gift's credit date as the purchase date. | TaxGuru; Upstox community; Alice Blue guide (search snippets) | Practitioner/Forum, Low–Medium |
| U5 | **Which direction is conservative for a planner?** For a **gain**, counting it as long-term uses up to ₹1.25 L of room, and a move is sized only into room left over. If the lot is really short-term, the true room is larger, so moves stay safe. The tax shown may read low: 12.5% instead of 20%, and the exemption applied. For a **loss**, a long-term loss is set only against long-term gains, which *raises* the room left. If the loss is really short-term, s.108-style set-off puts it against short-term gains first, so the true long-term gain, and the room used, may be higher. Counting a guessed-date loss as long-term can therefore **overstate room**. | My reasoning from the set-off order in the 2026-11-15 notes (tax-aware note §3.0) | Inference, Medium |

### 2.4 IPO allotments and corporate actions (Q4)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| C1 | **Date of purchase for exchange trades** is the broker's contract-note date, provided delivery follows (Circular 704 of 1995). For an **IPO**, an ITAT ruling (reported) takes the allotment date, not the demat credit date. A Zerodha forum answer uses the credit date (about allotment + 1 day). | Circular 704 (search reproductions); ITAT summary via search; TradingQnA "What's the buy date for an IPO" | Circular High; ruling Medium; forum Low |
| C2 | Zerodha IPO, OFS and corporate-action trades appear only in the **external tradebook**, not the regular one. Its buy average fills in automatically. | Zerodha Support, "Where can I see all trades for a period"; TradingQnA | Broker, Medium–High |
| C3 | **Bonus:** cost is nil (new s.90(6)(d), "allotted ... without any payment"; old s.55(2)(aa)(iiia)). The holding period starts at **allotment** (s.2(101)(c), free allotment; old Expl. 1(i)(hb)/(f)). Zerodha credits bonus shares at zero cost, and they don't appear as trades. A bonus lot is a *new short-term lot* for 12 months. | eztax.in s.90; taxclue s.2(101)(c); Zerodha Support, "What is a bonus issue" | Statute via reproduction, Medium–High; Broker, High |
| C4 | **Split / consolidation:** cost is worked out from the original shares (s.90(9)(d)). Zerodha adjusts the buy average automatically within days of the record date. A split doesn't appear as a trade, but the unit count changes. Whether the holding period carries over was not confirmed in the new-Act text; practice treats it as carrying over. | eztax.in s.90; Zerodha "Why is the buy average N/A" | Medium; period **unresolved** |
| C5 | **Demerger:** not a transfer for the shareholder (s.70(1), demerger clause; old s.47(vid)). The resulting-company shares take a share of the original cost by net book value (s.73(1) Table Sl. 14), and the parent's cost falls by the same amount (Sl. 15). The holding period runs from the original purchase (s.2(101)(c); old Expl. 1(i)(g)). Zerodha applies the company's cost ratio by hand, about 2 weeks after the event, and dates the new shares from the original purchase. | eztax.in s.70, s.73; G1; Zerodha Support, Tata Motors and Vedanta demerger pages | Statute Medium–High; Broker High |
| C6 | **Buyback:** before 1 Oct 2024 the company paid the tax. From 1 Oct 2024 to 31 Mar 2026 the whole payout was a deemed dividend and the shares' cost a capital loss (Finance (No. 2) Act 2024; old s.46A proviso, s.2(22)(f)). **From 1 Apr 2026 (Finance Act 2026) it is a capital gain again**: payout minus cost, at 12.5% or 20% for non-promoters, with an extra tax on promoters. Zerodha shows buybacks separately in the Trade-wise Exit sheet. | incometaxindia s.46A page (search snippet); Business Today 1 Feb and 3 Sep 2026; Zerodha "Things to consider" | Statute snippet High (2024 rule); News Medium (2026 rule); Broker High |

### 2.5 FIFO scope (Q5)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| F1 | **New Act s.67(7)(c):** for securities in a depository, cost and holding period are worked out by first-in-first-out (old s.45(2A) proviso). | eztax.in reproduction of s.67 | Statute via reproduction, Medium–High |
| F2 | **Circular 768 (24 Jun 1998):** FIFO applies only to the demat holding and **account by account** when an investor has several accounts. Order in the queue is by **date of entry into the account**. Once a sale is matched to a lot, holding period and cost come from that lot's **original** acquisition (contract note). The circular's example: shares bought physically in 1985 and dematerialised in 1997 keep the 1985 date and cost. | Circular 768, reproduced on taxguru.in (official page refused) | Circular, High (content); Medium (copy) |
| F3 | **Units moved between a holder's own accounts:** by F2's logic they join the receiving account's queue at the **credit date** but keep their **original** acquisition date and cost. No circular covers own-account demat-to-demat moves directly. Zerodha carries the cost over (B6). | F2 by analogy; B6 | Inference, Medium |
| F4 | BCAJ commentary notes s.67(7)(c) may recast holding-period rules, possibly allowing FIFO or LIFO for unlisted demat shares. Not relevant to listed holdings, but a sign the new text differs from the old in detail. | BCAJ summary (paywalled article) | Practitioner, Low |
| F5 | Mutual fund units outside demat: FIFO per folio by registrar practice (as in the 2026-11-15 note I1). No new source found. | — | Medium (unchanged) |

### 2.6 ELSS (Q6)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| E1 | ELSS 2005 (Notification 226/2005, 3 Nov 2005): investment must be held at least **three years from the date of allotment**. Units can't be transferred, assigned or pledged before then. Repurchase starts after three years. On the investor's death, the nominee or heir can redeem after **one year** from allotment. | Notification 226/2005 (copies on incometaxindia, legitquest, taxguru via search) | Notification, High |
| E2 | Each SIP instalment is a separate allotment with its own three-year lock-in. | Taxmann "ELSS and Section 123"; Angel One news; Aditya Birla Capital | Practitioner/AMC, Medium–High |
| E3 | So any ELSS unit an owner redeems has been held more than 12 months: long-term. The one edge is redemption by a nominee after the death exception. It is also long-term in practice, since the heir adds the deceased's holding period (G4) and redemption comes after at least a year. | E1 + G4 | Inference, Medium–High |
| E4 | The ELSS deduction (old s.80C) is s.123 of the 2025 Act, ₹1.5 L cap, **old regime only**. The lock-in applies whatever the regime. | Taxmann "ELSS and Section 123" | Practitioner, Medium |

---

## 3. Impact on the holdings-first design

| Design section / call | Finding | Verdict | What to do |
|---|---|---|---|
| **§1 Which holdings file decides** | B1, B6, F2: FIFO and the broker's split are per demat account | **Confirm** | Per (member, account) is the right unit. Keep demat CAS out of trimming. |
| §1, stale-file rule | C2, C3, C4: bonus, split, demerger and IPO credits are not "trades" in the regular tradebook | **Risk** | "Trim only when `asOf` ≥ last trade" doesn't see these events. A file can be newer than the last *trade* but older than a split or bonus. Treat a quantity jump with no trade as a corporate action, not as missing units (below). |
| **§2 Trim (units that left)** | G2, G5: gifts and own-account moves are not transfers for tax, so no gain | **Confirm** | Right for gifts and own-account moves. |
| §2, oldest first | F1, F2: FIFO governs which units leave the account | **Confirm** | Trimming the oldest units matches the law. For a gift, those are also the units (with dates) the receiver inherits. |
| §2 / call **(a)** dated at file date | F2: the date only places the event; trimmed units book nothing | **Confirm, low risk** | The real date affects only *which* units were sold by any later sale before the file date. The "trim only if newer than the last trade" rule already protects this. |
| §2, anti-goal "no gain for units that left" | **C6: a buyback tender from 1 Apr 2026 is a taxable sale.** It may sit only in the Tax P&L or the external tradebook. | **Risk (blocking for tax safety)** | Without the Tax P&L, trimming would drop a real gain and **overstate room**. Before trimming in FY 2026-27, check whether units of that ISIN left around a known buyback. At least show "If these left in a buyback, the gain counts: import the tax P&L." Keep the Tax P&L winning. |
| §2 / §7, "broker totals win" | **B4: a Zerodha Console gift appears as an exit at closing price** in the giver's Tax P&L | **Risk** | `brokerAdjustments` could book a gain on a gift that the law doesn't tax. That shows *less* room than the truth, which is safe for moves, but the tax figure is wrong. Flag Tax P&L exits with no matching tradebook sale as "possibly a gift: check". Confirm with a real (synthetic) file how they appear. |
| **§3 Fill-in** | C3, C4, C5, C2: bonus, split, demerger and IPO units are missing from the history but in the file | **Change** | Today these would become `approx` or `estimated` lots at the file's average cost, while the history lots keep their pre-event cost. Example: 10 bought at ₹1,000, then a 1:1 bonus. The file shows 20 at ₹500. The history keeps 10 at ₹1,000, and fill-in adds 10 at ₹500. Total cost becomes ₹15,000 against a true ₹10,000, so gain is understated by ₹5,000, far beyond the 10% cushion. **Fill-in must not stack on top of history lots whose cost the broker has already restated.** Options: (i) when the file's quantity exceeds the history with no trade, rebase the whole account position on the file's average cost and long-term count (no stacking); (ii) read the external tradebook and corporate-action feed. Add a rupee test for bonus and split. |
| §3, IPO | C1, C2 | **Change (small)** | Import Zerodha's external tradebook, or treat a file-only lot with zero history as an IPO or other credit dated from the file's split. |
| **§4 / call (c)** filled-in lots dated a year and a day before the first sale | B1, F2, U1 | **Risk (wording); safe for gains** | Nothing proves those units were over 12 months old at the sale. The file's long-term count is measured at `asOf`, and history-predating units are only known to be older than its first trade. Keep the date as an assumption, but mark the resulting row `estimated` and list it under "Needs checking", like §5. Goal 3 ("right for every sale") overclaims. Bonus lots (C3) must never get this date: a bonus sold within 12 months of allotment is short-term at nil cost. |
| §4, broker long-term count | B1–B4, B8: the count is FIFO by broker-known dates; it understates for gifts and Angel transfers | **Confirm, with caveat** | Trusting the count is safe for room (fewer long-term units means fewer moves). It overstates only on a user's wrong manual date (B2) or a pending corporate action (C5, about 2 weeks). Consider a check: long-term units > file units minus units bought in the last 12 months in the history → warn. |
| **§5 / call (b)** guessed-date sale counted as long-term | U5 | **Confirm for gains; change for losses** | A guessed-date **loss** must not free room. Count it as short-term for set-off, or don't count it at all until the Tax P&L arrives. Add a rupee test: a member with booked STCG and a guessed-date loss. |
| §5, ELSS always long-term | E1–E3 | **Confirm** | Safe. The death-exception edge is also long-term. |
| §8 nudge (cushion) | — | **Confirm** | Add a second nudge for corporate actions: "<share> had a bonus/split: import the tax P&L or external tradebook." |
| §9 "more data never spoils" | C2 | **Risk** | Importing the external tradebook *after* a fill-in must replace the guessed lot (id-based), not add to it. Same rule as the fund-order fix in §3. |

---

## 4. What the 2026-11-15 notes add

**Answered or strengthened by this note**
- Tax-aware note, open question 2, and CA sheet A Q19: FIFO for demat is **s.67(7)(c)** of the 2025 Act (F1), account by account (F2). The bonus and dividend stripping section is still unconfirmed.
- CA sheet A Q7 (gifted cost and holding period): **s.73(1) Table Sl. 1, s.2(101)(c), s.70(1)(b)** (G2–G4). Downgrade it to "confirm" rather than "find".
- Tax-aware note I9 (bonus stripping) now matters more. Bonus lots are nil-cost short-term lots (C3), and the engine must know them to apply the stripping block.
- Tax-aware note Algorithm C rebuy: an MF rebuy joins the end of the FIFO queue. Same for a demat rebuy (F2). Consistent.

**Practitioner tricks that would make the engine stand out**
1. **Lot choice through a second demat.** India allows no specific lot choice, but FIFO runs per account (F2), and Zerodha sells its secondary demat for "better FIFO management" (B6). A family can keep high-gain old lots in one account and fresh lots in another. Harvesting then sells exactly the lots wanted. The engine already keys queues by account, so it can show "if these 40 units sat in your second account, this harvest would use ₹X less room". This would be a calculation, not advice to open an account; check the wording against GUARDRAILS §6. Needs a CA check (Open question 4).
2. **Correct the broker on gifts.** The broker's records give a gift receiver the wrong cost and date (B4, B8). The app can rebuild them from the giver's lots (G3, G4), which the giver's own import already holds. That is the deferred "recognise gifts within the family" item. This research says it is worth more than it looks: it turns short-term units into long-term ones, often old and cheap, with real room value. Show the corrected figure with "Your broker shows ₹Y; for tax the giver's cost applies."
3. **A corporate-action-aware reconcile** (§3 row above). Most DIY tools get bonus and demerger costs wrong. Getting them right is accuracy users will see.
4. **The "Tax P&L exit with no sale" detector** (B4, B5, C6). It sorts each exit into a gift, a transfer or a buyback, and says which one counts for tax.

---

## 5. Open questions (unresolved, ask a CA)

Phrased to add to `2026-11-15-questions-for-ca-and-lawyer.md`, Sheet A.

1. **Gift shown as a sale in the broker report.** Zerodha shows a Console gift as an exit at the transfer-day closing price in the giver's Tax P&L. When filing, should the giver simply delete that line? Is there any risk if the AIS shows the transfer? *App plan:* flag it and leave it out of booked gains once the user confirms it was a gift.
2. **Guessed-date losses.** For a sale whose purchase date can't be found, is there any accepted way to classify it for filing? For planning, the app counts a guessed-date gain as long-term and a guessed-date loss as short-term (or not at all). Is that the safe reading?
3. **Own-account demat moves.** When shares move between a person's own demat accounts, does the receiving account's FIFO queue place them at the credit date while they keep the original purchase date and cost (Circular 768 by analogy)? Which section of the 2025 Act or which circular says so?
4. **Lot choice through a second demat.** Is keeping lots in two demat accounts on purpose, to choose which lots a sale uses, acceptable planning, or a sham risk?
5. **Split and consolidation holding period** under the 2025 Act: does it run from the original shares' purchase date? s.90(9)(d) covers cost; we found no text on period.
6. **Buyback from 1 Apr 2026:** confirm the Finance Act 2026 section, that a non-promoter's gain is payout minus cost at 12.5% or 20%, and the holding period used. Also: how is a buyback accepted in March 2026 and paid in April 2026 treated?
7. **IPO acquisition date:** allotment date or demat credit date, for the 12-month test?
8. **Section text check:** confirm against the official 2025 Act the clause letters this note took from reproductions: s.70(1)(b) gift, the demerger clause of s.70(1), s.2(101)(c) previous owner and free allotment, s.90(6)(d) bonus nil cost, s.90(7) grandfathering, s.73(1) Table Sl. 1, 14, 15.
9. **Bonus and dividend stripping:** the new-Act section for old s.94(7), (8) (still open from the 15 Nov sheet), now needed for bonus lots.

For the brokers (support tickets, not a CA):
10. Zerodha: how does an un-updated discrepant lot ("N/A" buy average) count in "Quantity Long Term"?
11. Angel One: how are "LTCG Quantity / STCG Quantity" worked out? Are transferred-in shares dated at the credit date? Can the purchase date be updated?

---

## 6. Sources

**Statute and CBDT** (official site mostly refused fetches; reproductions marked)
- Income-tax Act 1961, s.2(42A), incometaxindia.gov.in. https://incometaxindia.gov.in/w/section-2-66 (Statute, High; read via scraper)
- Income-tax Act 2025, s.67 (capital gains; (7)(c) FIFO), reproduction. https://eztax.in/income-tax-act-2025/section-67 (Statute via reproduction, Medium–High)
- Income-tax Act 2025, s.70 (not regarded as transfer), reproduction. https://eztax.in/income-tax-act-2025/section-70 ; commentary https://www.aaptaxlaw.com/income-tax-act-2025/section-70-income-tax-act-2025-transactions-not-regarded-as-transfer.html (Medium–High / Medium)
- Income-tax Act 2025, s.73 (cost with reference to modes of acquisition), reproduction. https://eztax.in/income-tax-act-2025/section-73 (Medium–High)
- Income-tax Act 2025, s.90 (cost of acquisition: bonus nil, 2018 grandfathering, split, previous owner), reproduction. https://eztax.in/income-tax-act-2025/section-90 (Medium–High)
- Income-tax Act 2025, s.2(101), summary. https://www.taxclue.in/blog/section-2-income-tax-act-2025-definitions-short-term-capital-asset-slump-sale-transfer-and-virtual-digital-asset/ (Medium)
- CBDT Circular 768, 24 Jun 1998 (FIFO in demat), reproduction. https://taxguru.in/income-tax/circular-768income-tax-dated-2461998.html ; official https://www.incometaxindia.gov.in/w/768-circular-no.-768-dated-24-6-1998-1 (Circular, High content / Medium copy)
- CBDT Circular 704, 28 Apr 1995 (date of contract note). https://www.incometaxindia.gov.in/w/704-circular-no.-704-dated-28-4-1995 (Circular, High; read via search snippets)
- Old s.46A (buyback, 2024 proviso). https://incometaxindia.gov.in/w/section-46a-25 (Statute, High; snippet)
- ELSS 2005, Notification 226/2005. https://incometaxindia.gov.in/Communications/Notification/920110000000001519.htm ; https://www.legitquest.com/act/equity-linked-savings-scheme-2005/FFA6 (Notification, High)

**Brokers**
- Zerodha, View LTCG and STCG holdings. https://support.zerodha.com/category/console/reports/taxation/articles/view-ltcg-and-stcg-holdings (High)
- Zerodha, How to update buy average. https://support.zerodha.com/category/console/portfolio/console-holdings/articles/how-to-update-buy-average (High)
- Zerodha, Multiple trades (discrepant). https://support.zerodha.com/category/console/portfolio/console-holdings/articles/multiple-trades-discrepant (High)
- Zerodha, Why is the buy average N/A. https://support.zerodha.com/category/console/portfolio/console-holdings/articles/why-is-the-buy-average-for-some-shares-shown-as-n-a (High)
- Zerodha, Secondary demat FAQs. https://support.zerodha.com/category/your-zerodha-account/your-profile/general-profile-questions/articles/secondary-demat-faqs (High)
- Zerodha, Tax implication on gifting of stocks. https://support.zerodha.com/category/your-zerodha-account/transfer-of-shares-and-conversion-of-shares/gifting-securities/articles/tax-implication-on-gifting-of-stocks (High)
- Zerodha, Buy average not updated for gifts. https://support.zerodha.com/category/your-zerodha-account/transfer-of-shares-and-conversion-of-shares/gifting-securities/articles/buy-average-price-not-updated-for-stocks-received-as-gifts (High)
- Zerodha, Things to consider when filing taxes using Zerodha's reports. https://support.zerodha.com/category/console/reports/taxation/articles/things-to-consider-when-filing-taxes-using-zerodha-s-reports (High)
- Zerodha, What is a bonus issue. https://support.zerodha.com/category/console/corporate-actions/bonus/articles/bonus-issue (High)
- Zerodha, Tata Motors demerger; Vedanta demergers. https://support.zerodha.com/category/console/corporate-actions/ca-others/articles/tata-motors-demerger ; https://support.zerodha.com/category/console/corporate-actions/ca-others/articles/vedanta-demergers (High)
- Zerodha, Where can I see all trades for a period (external tradebook). https://support.zerodha.com/category/console/reports/other-queries/articles/where-can-i-see-all-the-trades-i-ve-taken-for-a-particular-period (Medium–High; search snippet)
- TradingQnA, What's the buy date for an IPO. https://tradingqna.com/t/whats-the-buy-date-for-an-ipo/179346 (Forum, Low)
- Angel One Support, Holdings / portfolio (FIFO average). https://www.angelone.in/support/portfolio-and-corporate-actions/holdings-portfolio (High)
- Angel One Knowledge Center, How to transfer shares between demat accounts. https://www.angelone.in/knowledge-center/demat-account/how-to-transfer-shares-from-one-demat-account-to-another (Medium)
- Angel One community, threads 6217 and 6918 (off-market price and date). https://community.angelone.in/t/stock-transfer-discrepancy-purchase-price-not-reflecting-in-angel-one-after-off-market-transfer/6217 ; https://community.angelone.in/t/price-adjust-off-market-share-transfer/6918 (Forum, Low; pages failed to load, read via search snippets)

**Practitioners and news**
- Quicko Help, Add capital gains using Excel template. https://help.quicko.com/portal/en/kb/articles/add-capital-gains-using-excel-template (Tool, Medium)
- Taxmann, ELSS and Section 123. https://www.taxmann.com/post/blog/elss-and-section-80c (Practitioner, Medium)
- Business Today, buyback tax rules changed three times (3 Sep 2026); I-T Dept explains buyback change (1 Feb 2026). https://www.businesstoday.in/markets/story/buyback-tax-how-india-changed-the-rules-three-times-in-18-months-and-what-investors-need-to-know-553004-2026-09-03 ; https://www.businesstoday.in/union-budget/story/budget-2026-i-t-dept-explains-why-share-buybacks-will-now-be-taxed-as-capital-gains-514091-2026-02-01 (News, Medium)
- BCAJ, Income-tax Act 2025 capital gains commentary (s.67(7)(c)). https://bcajonline.org/?p=61510 (Practitioner, Low; paywalled)

**Internal**
- `docs/superpowers/specs/2026-11-22-holdings-first-engine-design.md` (sections 1–9, calls a–c).
- `docs/research/2026-11-15-tax-aware-selling-rebalancing.md` (I1, I9, set-off order §3.0) and `docs/research/2026-11-15-questions-for-ca-and-lawyer.md` (Sheet A Q7, Q19).
