# Fresh-run notes (22 Nov 2026), anonymised

The founder re-imported a real family from scratch on the live site; these are the findings. **Names, share names, unit counts and rupee figures are replaced.** Members are A (self, Zerodha shares and Coin funds), B (a parent, Zerodha shares) and C (a spouse, Angel One). Shares are S1, S2 and so on; funds are F1, F2 and so on. Figures are illustrative but keep the real order of magnitude. Where each point is handled: `docs/NEXT-WORK.md` §4.

## Points

1. **No clear success feedback after an import.** After adding a file, the user can't easily tell it worked. Today there's only a brief "Added to <name>" toast, and the button changes to "Added to <name>". Wanted: a clear confirmation or animation.

2. **The Plan suggested moves on shares sold months earlier, with no warning that the data was old.** A's Plan offered "gift S1 to B" and "sell S2 at a loss"; A had sold both in July.
   - Cause: the files stopped at 31 March. The holdings file was eight months old, and two of the three "tradebook years" were the same year downloaded twice.
   - Wanted:
     - a warning when the newest trade history or holdings date is well before today;
     - the holdings file's date shown on its card;
     - no moves (or clearly marked ones) where the only evidence is months old;
     - a duplicate year saying "nothing new" on its card.

3. **Shares that left an account stayed "held".**
   - What happened: with three tradebook years and a current holdings file, the replay still held six shares the file doesn't list (between 1 and 400 units each). A had gifted them off-market to B, and they appear in B's holdings.
   - Why it happens: an off-market transfer is not a trade, so it never appears in a tradebook. `ui/units.ts` only checks positions the statement lists, and `effectiveTxns` only adds units, never removes them.
   - Where it showed: A's Holdings table and totals (one share with no price), a long-term loss that could be offered as a loss to book, and Simulate's list ("held by 2", with A's ghost units added to B's).
   - Founder: the latest holdings file is the truth for what's held. Units it doesn't list leave the table, totals and moves, with at most one quiet line and no gain or loss booked.

4. **About 45 (A) and 60 (C) "Sold N more units than the history shows" lines, one per lot.** One share alone had 11 lines on the same day, and "Turning long-term soon" repeated one share six times for the same day.
   - Founder: pages like this are intimidating.
   - Better: show only this year's sales that no Tax P&L covers, grouped by share. For C that's about 60 lines down to one. Older years go behind a collapsed link, in a calm style.

5. **The holdings card said "11 transactions".** They were guessed lots for 11 funds (Zerodha's fund sheet has no long-term column). Say "11 fund lots with guessed dates".

6. **Wording:** "1 lot have an estimated date" should be "has". The intraday line says "from tradebooks" in one place and "from your broker's report" in another.

7. **Gifts within the family aren't recognised.** When units leave one member and the same ISIN appears in another member's holdings, ask "Did A gift these to B?" On yes, B's lots take A's cost and dates. Today B's lots use the broker's average price, which for transferred shares isn't the original cost. Ask, never assume: it could be a sale and a purchase.

8. **Simulate wording:** "−₹12,000 gain (−₹12,000 long, ₹0 short)" should read "₹12,000 loss (all long-term)".

9. **Direction: holdings first, tradebooks optional** (founder).
   - **Holdings file:** what's held now (units, long-term units, average cost).
   - **Tax P&L:** what's booked this year, which decides room. Evidence: A's broker P&L showed equity long-term about ₹23k, short-term about ₹38k and fund long-term about ₹17k. The app showed long-term about ₹14k from three tradebook years, because sales of units bought before the history had no cost.
   - **Tradebooks:** optional, for exact cost and dates.
   - The P&L has no open lots, so it can't replace the holdings file. Zerodha's fund sheet has no long-term count, so funds still need MF tradebooks or a CAS.

10. **Bug: long-term units sold from the holdings-file lot were booked as short-term.** B sold 8 units of S3 in April; the broker says 7 were long-term and 1 short-term. The app booked all 8 as short-term at average cost, because the filled-in lot is dated the day before the oldest trade, which was under a year before the sale. The "Check against Zerodha" table then blamed "older purchases missing". Totals were right only because the broker's figures override.

11. **The broker correction showed as "Losses set off ₹3,000"** in B's Booked this year, plus a "Broker figure: −₹3,000" row. B had no such loss; it's the gap between the app's figure and the broker's.

12. **IPO shares blamed on missing history.** "Sold 15 more units… Import older statements" appeared for shares allotted in an IPO three days before the sale; no older statement has them. A and B had the same for another IPO a year earlier. Where the Tax P&L covers the sale, drop the line. Otherwise say "possibly an IPO allotment or transfer in".

13. **Check: a long-term holding wasn't suggested for B** (13 units, about ₹8k gain), though B's room seemed to fit it even with the 10% cushion. Is it a minimum size, or the cushion counted differently?

14. **The Angel One holdings file is read as fund-only, and its shares are dropped silently.**
    - The unlocked copy (saved from Numbers) has these sheets: Export Summary, Summary, Equity (18 shares), SGB (2), Mutual Funds (7) and Bonds (3).
    - `readSpreadsheet` sees the fund header first, so the card says "Angel One fund holdings, 7 funds". About ₹22 L of shares and ₹2.4 L of SGBs are skipped with no warning.
    - The Equity sheet has ISIN, quantity, average price, LTP and **LTCG / STCG quantity and value**, which is richer than Zerodha's file.
    - Find sheets by header, not position.

15. **Bug: funds counted twice when the holdings file went in before the MF tradebooks.**
    - Why: the holdings import saved a guessed lot for each fund's full quantity, because no fund history existed yet (`store.ts`). The tradebooks then added their buys on top.
    - Size: one fund went from about 12,000 units to about 18,600; others by similar ratios.
    - The warning said "Older purchases may be missing", which is the opposite of the cause.
    - Fix: size the guessed lot on every compute.

16. **Bug: an ELSS redemption was booked as short-term** (about ₹10k gain). ELSS has a 3-year lock-in, so any redeemed unit is long-term. Together with point 9, A's long-term figure was understated and the room overstated.

17. **C (Angel One), first full import.** The trade files read correctly (about 150 and 320 trades). Units matched Angel's Equity sheet for 17 of 18 shares, and the Plan gave a harvest, a loss to book and three waits. Points:
    - **One share:** the history shows 102 units, while Angel's holdings show 170 (150 long-term). There's no warning, because the Equity sheet isn't read.
    - **Set-off:** the short-term section read "Total ₹20k · After set-off ₹42k". The losses were moved to offset a gain whose tax type was unknown. That's legal but unexplained.
    - **Sold fund:** a sold ETF "needs checking" but there's no "Pick" for it.

## Decisions made with the founder during the run

- **More data never spoils.** The newest holdings file wins by its date, not by upload time. Duplicates add nothing. A conflicting file is flagged, not applied. A new file may still change moves when it reveals a real fact.
- **Fewer files over exactness.** Average-cost units keep the 10% cushion. The app nudges for a tradebook where it would recover that room, instead of demanding files up front.
- **Unknown buy dates.** A gain counts as long-term (safe for room) and a loss as short-term. The user can answer Long-term / Short-term (short-term asks for confirmation) or add a buy date. A broker Tax P&L wins over both.
- **Guided import.**
  - Order: holdings → this year's Tax P&L → tradebooks newest first, only while gaps remain.
  - Each ask says what it would unlock.
  - "Stop here, show my plan" is always available.
  - The results never depend on upload order.
- **Fund tax types** shouldn't be asked of users. Derive them from AMC documents and research, and only ask the user to confirm a suggestion.

## Known before this run

- The Import guide and the Plan send Zerodha Coin users to the fund CAS; Coin funds need MF tradebooks for every year.
- The CAS password hint says "usually your PAN"; MF Central and CAMS use a chosen password.
- The CAMS / KFintech fund CAS reader has never seen a real statement.
