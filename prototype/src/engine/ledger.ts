import { isLongTerm } from './dates';
import { FY_2026_27, type TaxRules } from './rules';
import { QTY_SCALE, type IntradayTrade, type Ledger, type Lot, type Paise, type Qty, type Realised, type Security, type Txn } from './types';

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
 * Replays every transaction in date order and matches sells to buys first-in-first-out, per member, security and
 * account (demat or folio), as the depositories do.
 * Sells on a date are applied before buys on that date, so a same-day buyback is never consumed by its own sale.
 */
export function buildLedger(txns: Txn[], securities: Security[], rules: TaxRules = FY_2026_27): Ledger {
  const bySec = new Map(securities.map((s) => [s.isin, s]));
  const { delivery, intraday } = splitIntraday(txns);
  const ordered = [...delivery].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1),
  );
  const lots = new Map<string, Lot[]>();
  const realised: Realised[] = [];
  const warnings: Ledger['warnings'] = [];

  for (const t of ordered) {
    const account = t.account ?? '';
    const key = lotKey(t.memberId, t.isin, account);
    const queue = lots.get(key) ?? [];
    lots.set(key, queue);

    if (t.side === 'buy') {
      queue.push({ memberId: t.memberId, isin: t.isin, account, date: t.date, qty: t.qty, cost: t.amount, source: t.source, estimated: t.estimated });
      continue;
    }

    let remaining = t.qty;
    let proceedsLeft = t.amount;
    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0]!;
      const take = Math.min(lot.qty, remaining);
      const actualCost = take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
      const proceeds = take === remaining ? proceedsLeft : prorate(t.amount, take, t.qty);
      const cost = effectiveCost(lot, actualCost, take, proceeds, bySec.get(t.isin), rules);
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
        term: isLongTerm(lot.date, t.date, rules.longTermMonths) ? 'lt' : 'st',
        taxType: bySec.get(t.isin)?.taxType ?? 'equity',
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
 */
export function splitIntraday(txns: Txn[]): { delivery: Txn[]; intraday: IntradayTrade[] } {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const k = `${t.memberId}|${t.account ?? ''}|${t.isin}|${t.date}`;
    const g = groups.get(k) ?? [];
    g.push(t);
    groups.set(k, g);
  }
  const delivery: Txn[] = [];
  const intraday: IntradayTrade[] = [];
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
