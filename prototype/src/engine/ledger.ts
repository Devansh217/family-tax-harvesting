import { isElssFund } from './categories';
import { isLongTerm } from './dates';
import { FY_2026_27, type TaxRules } from './rules';
import { longTermMonthsFor, lotTaxType } from './tax';
import { QTY_SCALE, type IntradayTrade, type Ledger, type ISODate, type Lot, type Paise, type Qty, type Realised, type Security, type TermAnswer, type Txn } from './types';

export const lotKey = (memberId: string, isin: string, account = '') => `${memberId}|${isin}|${account}`;

/** Share of `total` for `part` of `whole`, rounded to the paisa. */
export const prorate = (total: Paise, part: Qty, whole: Qty): Paise => (whole === 0 ? 0 : Math.round((total * part) / whole));

/**
 * Cost to use for a lot portion. Grandfathering (old s.112A / s.55(2)(ac)): for listed equity bought on or before
 * 31 Jan 2018, cost is the higher of actual cost and the lower of (FMV on 31 Jan 2018, sale value).
 */
export function effectiveCost(
  lot: Pick<Lot, 'date'>,
  actualCost: Paise,
  qty: Qty,
  saleValue: Paise,
  security: Security | undefined,
  rules: TaxRules,
): Paise {
  if (!security?.fmv2018 || security.taxType !== 'equity' || lot.date > rules.grandfatherDate) return actualCost;
  const fmv = Math.round((security.fmv2018 * qty) / QTY_SCALE);
  return Math.max(actualCost, Math.min(fmv, saleValue));
}

/**
 * Tax type and term of a sold lot. The type is per lot (debt units bought before April 2023 are other long-term);
 * unknown securities are treated as listed shares, as before.
 */
export function lotTerms(sec: Security | undefined, buyDate: ISODate, sellDate: ISODate, rules: TaxRules): Pick<Realised, 'taxType' | 'term'> {
  const taxType = sec ? lotTaxType(sec, buyDate, rules) : 'equity';
  const months = longTermMonthsFor(taxType, sec?.listed ?? true, rules);
  return { taxType, term: months != null && isLongTerm(buyDate, sellDate, months) ? 'lt' : 'st' };
}

/**
 * Tax type and term of a sale from a guessed lot (`estimated`): the buy date is unknown, so the term is set the safe
 * way for room. ELSS is always long-term (its units sell only after the lock-in); non-equity keeps its own type and the
 * term from the guessed date; anything else counts a gain long-term (it uses room) and a loss short-term (it is set
 * off against short-term gains first). The family's answer for the sale, a term or a buy date, overrides the guess.
 */
function unknownTerms(
  sec: Security | undefined, lotDate: ISODate, sellDate: ISODate, gain: Paise, rules: TaxRules, answer: TermAnswer | undefined,
): Pick<Realised, 'taxType' | 'term' | 'termUnknown'> & Partial<Pick<Realised, 'buyDate'>> {
  if (answer?.buyDate) return { ...lotTerms(sec, answer.buyDate, sellDate, rules), buyDate: answer.buyDate };
  const own = lotTerms(sec, lotDate, sellDate, rules);
  if (answer?.term) return { taxType: own.taxType, term: answer.term };
  if (sec && isElssFund(sec)) return { taxType: own.taxType, term: 'lt', termUnknown: true };
  if (own.taxType !== 'equity') return { ...own, termUnknown: true };
  return { taxType: own.taxType, term: gain >= 0 ? 'lt' : 'st', termUnknown: true };
}

const sameAccount = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Replays every transaction in date order and matches sells to buys first-in-first-out, per member, security and
 * account (demat or folio), as the depositories do. Sales from guessed lots get their term from `unknownTerms`.
 * Sells on a date are applied before buys on that date, so a same-day buyback is never consumed by its own sale.
 */
export function buildLedger(txns: Txn[], securities: Security[], rules: TaxRules = FY_2026_27, answers: TermAnswer[] = []): Ledger {
  const bySec = new Map(securities.map((s) => [s.isin, s]));
  const answerFor = (t: Txn, account: string) =>
    answers.find((a) => a.memberId === t.memberId && a.isin === t.isin && a.sellDate === t.date && sameAccount(a.account, account) && (a.term || a.buyDate));
  const { delivery, intraday } = splitIntraday(txns);
  // Units that left the account go last on their date: the holdings file shows the end of that day.
  const rank = (t: Txn) => (t.left ? 2 : t.side === 'sell' ? 0 : 1);
  const ordered = [...delivery].sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b));
  const lots = new Map<string, Lot[]>();
  const realised: Realised[] = [];
  const warnings: Ledger['warnings'] = [];

  for (const t of ordered) {
    const account = t.account ?? '';
    const key = lotKey(t.memberId, t.isin, account);
    const queue = lots.get(key) ?? [];
    lots.set(key, queue);

    if (t.side === 'buy') {
      queue.push({ memberId: t.memberId, isin: t.isin, account, date: t.date, qty: t.qty, cost: t.amount, source: t.source, estimated: t.estimated, ...(t.approx ? { approx: true } : {}) });
      continue;
    }

    if (t.left) {
      // Not a sale: the oldest units stop being held, and nothing is booked.
      let remaining = t.qty;
      while (remaining > 0 && queue.length > 0) {
        const lot = queue[0]!;
        const take = Math.min(lot.qty, remaining);
        lot.cost -= take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
        lot.qty -= take;
        remaining -= take;
        if (lot.qty === 0) queue.shift();
      }
      continue;
    }

    let remaining = t.qty;
    let proceedsLeft = t.amount;
    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0]!;
      const take = Math.min(lot.qty, remaining);
      const actualCost = take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
      const proceeds = take === remaining ? proceedsLeft : prorate(t.amount, take, t.qty);
      const sec = bySec.get(t.isin);
      const cost = effectiveCost(lot, actualCost, take, proceeds, sec, rules);
      realised.push({
        memberId: t.memberId,
        isin: t.isin,
        account,
        buyDate: lot.date,
        sellDate: t.date,
        qty: take,
        proceeds,
        cost,
        gain: proceeds - cost,
        ...(lot.estimated ? unknownTerms(sec, lot.date, t.date, proceeds - cost, rules, answerFor(t, account)) : lotTerms(sec, lot.date, t.date, rules)),
      });
      lot.qty -= take;
      lot.cost -= actualCost;
      remaining -= take;
      proceedsLeft -= proceeds;
      if (lot.qty === 0) queue.shift();
    }
    if (remaining > 0) {
      warnings.push({
        memberId: t.memberId,
        isin: t.isin,
        date: t.date,
        message: `Sold ${(remaining / QTY_SCALE).toLocaleString('en-IN')} more units than the history shows were bought${account ? ` in ${account}` : ''}. Import older statements for exact gains.`,
      });
    }
  }
  return { lots, realised, intraday, warnings };
}

/**
 * Buys and sells of the same security on the same day in the same account square off: that matched quantity is
 * intraday (speculative business income at slab rates), not a capital gain. Only the unmatched rest goes to lots.
 * This also catches a same-day sell-and-buy-back, which is why harvest moves say to buy back the next trading day.
 * Units that left the account are not a sale and go straight to delivery.
 */
export function splitIntraday(txns: Txn[]): { delivery: Txn[]; intraday: IntradayTrade[] } {
  const groups = new Map<string, Txn[]>();
  const delivery: Txn[] = [];
  const intraday: IntradayTrade[] = [];
  for (const t of txns) {
    if (t.left) { delivery.push(t); continue; }
    const k = `${t.memberId}|${t.account ?? ''}|${t.isin}|${t.date}`;
    const g = groups.get(k) ?? [];
    g.push(t);
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const buys = g.filter((t) => t.side === 'buy'), sells = g.filter((t) => t.side === 'sell');
    const bq = buys.reduce((a, t) => a + t.qty, 0), sq = sells.reduce((a, t) => a + t.qty, 0);
    const matched = Math.min(bq, sq);
    if (matched === 0 || buys.some((t) => t.estimated)) { delivery.push(...g); continue; }
    const ba = buys.reduce((a, t) => a + t.amount, 0), sa = sells.reduce((a, t) => a + t.amount, 0);
    const first = g[0]!;
    intraday.push({
      memberId: first.memberId, isin: first.isin, account: first.account ?? '', date: first.date, qty: matched,
      pnl: prorate(sa, matched, sq) - prorate(ba, matched, bq),
    });
    const shrink = (side: Txn[], total: Qty) => {
      const keep = total - matched;
      if (keep === 0) return;
      for (const t of side) {
        const q = Math.round((t.qty * keep) / total);
        if (q > 0) delivery.push({ ...t, qty: q, amount: prorate(t.amount, q, t.qty) });
      }
    };
    shrink(buys, bq);
    shrink(sells, sq);
  }
  return { delivery, intraday };
}
