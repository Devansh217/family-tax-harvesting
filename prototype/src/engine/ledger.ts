import { isLongTerm } from './dates';
import { FY_2026_27, type TaxRules } from './rules';
import { QTY_SCALE, type Ledger, type Lot, type Paise, type Qty, type Realised, type Security, type Txn } from './types';

export const lotKey = (memberId: string, isin: string) => `${memberId}|${isin}`;

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
  if (!security?.fmv2018 || security.kind === 'other' || lot.date > rules.grandfatherDate) return actualCost;
  const fmv = Math.round((security.fmv2018 * qty) / QTY_SCALE);
  return Math.max(actualCost, Math.min(fmv, saleValue));
}

/**
 * Replays every transaction in date order and matches sells to buys first-in-first-out, per member and security.
 * Sells on a date are applied before buys on that date, so a same-day buyback is never consumed by its own sale.
 */
export function buildLedger(txns: Txn[], securities: Security[], rules: TaxRules = FY_2026_27): Ledger {
  const bySec = new Map(securities.map((s) => [s.isin, s]));
  const ordered = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1),
  );
  const lots = new Map<string, Lot[]>();
  const realised: Realised[] = [];
  const warnings: Ledger['warnings'] = [];

  for (const t of ordered) {
    const key = lotKey(t.memberId, t.isin);
    const queue = lots.get(key) ?? [];
    lots.set(key, queue);

    if (t.side === 'buy') {
      queue.push({ memberId: t.memberId, isin: t.isin, date: t.date, qty: t.qty, cost: t.amount, source: t.source });
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
        buyDate: lot.date,
        sellDate: t.date,
        qty: take,
        proceeds,
        cost,
        gain: proceeds - cost,
        term: isLongTerm(lot.date, t.date, rules.longTermMonths) ? 'lt' : 'st',
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
        message: `Sold ${(remaining / QTY_SCALE).toLocaleString('en-IN')} more units than the history shows were bought. Import older statements for exact gains.`,
      });
    }
  }
  return { lots, realised, warnings };
}
