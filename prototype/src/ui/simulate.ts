import type { HoldingLot } from '../engine/family';
import { QTY_SCALE, type ISODate, type Paise, type Qty } from '../engine/types';

export interface SharePick { label: string; qty: Qty; value: Paise }

/**
 * Quick picks for Simulate a sale: shares of the largest amount any one member can sell, since one member makes the
 * whole sale. Units are rounded down to the security's step; "All" is exactly what is held.
 */
export function sharePicks(maxQty: Qty, price: Paise, step: Qty): SharePick[] {
  if (maxQty <= 0) return [];
  return [25, 50, 75, 100].map((pct) => {
    const qty = pct === 100 ? maxQty : Math.floor((maxQty * pct) / 100 / step) * step;
    return { label: pct === 100 ? 'All' : `${pct}%`, qty, value: Math.round((price * qty) / QTY_SCALE) };
  });
}

/** The soonest date after `asOf` on which short-term units in gain turn long-term, and how many units turn then. */
export function nextLongTerm(lots: HoldingLot[], asOf: ISODate): { date: ISODate; qty: Qty } | null {
  const soon = lots.filter((l) => l.term === 'st' && (l.gain ?? 0) > 0 && l.longTermOn > asOf);
  if (!soon.length) return null;
  const date = soon.reduce((d, l) => (l.longTermOn < d ? l.longTermOn : d), soon[0]!.longTermOn);
  return { date, qty: soon.filter((l) => l.longTermOn === date).reduce((a, l) => a + l.qty, 0) };
}
