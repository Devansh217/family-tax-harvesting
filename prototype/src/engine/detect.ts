import { addDays } from './dates';
import type { DatedMove, Move } from './family';
import { statusRecord, type RecommendationRecord } from './records';
import type { TaxRules } from './rules';
import type { ISODate, Txn } from './types';

const WINDOW_DAYS = 10;
/** A family often trades a day or two before the day they picked. */
const EARLY_DAYS = 3;
const TOLERANCE = 0.05;

/** 1 Feb of the calendar year in which the tax year ends: when harvest season starts. */
export const seasonStartOf = (r: Pick<TaxRules, 'end'>): ISODate => `${r.end.slice(0, 4)}-02-01`;

const near = (units: number, size: number) => size > 0 && Math.abs(units - size) <= size * TOLERANCE;

/** Who must sell, and (for a switch with a known direct plan) what must be bought. */
function expected(m: Move): { seller: string; buy?: { memberId: string; isin: string } } | null {
  switch (m.kind) {
    case 'wait': return null;
    case 'gift': return { seller: m.toId };
    case 'switch_direct': return { seller: m.memberId, buy: m.toIsin ? { memberId: m.memberId, isin: m.toIsin } : undefined };
    default: return { seller: m.memberId };
  }
}

/**
 * Moves the family was shown (sized as they last saw them) that the new statement's transactions confirm. A sale of
 * the same security by the right person, units within 5% of the latest sizing or of the day-picked snapshot, within 10
 * days after (or 3 before) the picked day; with no picked day, any time in the season (1 Feb to the end of the tax
 * year). Both edges count. Each transaction confirms at most one move.
 */
export function detectDone(input: {
  moves: Move[]; records: RecommendationRecord[]; datedMoves: DatedMove[]; newTxns: Txn[]; seasonStart: ISODate;
  /** The last day of the tax year: the last day a sale can confirm a move with no picked day. */
  seasonEnd: ISODate;
  /** When the records are written (the engine keeps no clock); defaults to the latest new transaction's day. */
  at?: string;
}): RecommendationRecord[] {
  const at = input.at ?? input.newTxns.reduce((d, t) => (t.date > d ? t.date : d), input.seasonStart);
  const already = new Set(input.records.filter((r) => r.event === 'detected_done').map((r) => r.moveId));
  const used = new Set<string>();
  const out: RecommendationRecord[] = [];
  for (const m of input.moves) {
    if (already.has(m.id) || m.noRoom || m.qty <= 0) continue;
    const want = expected(m);
    if (!want) continue;
    const picked = input.datedMoves.find((d) => d.moveId === m.id)?.date;
    const anchor = picked ? addDays(picked, -EARLY_DAYS) : input.seasonStart;
    const end = picked ? addDays(picked, WINDOW_DAYS) : input.seasonEnd;
    const snapshot = [...input.records].reverse().find((r) => r.moveId === m.id && r.event === 'in_plan')?.move.qty;
    const inWindow = (t: Txn) => !used.has(t.id) && t.date >= anchor && t.date <= end;
    const sale = input.newTxns.find((t) => inWindow(t) && t.side === 'sell' && t.memberId === want.seller && t.isin === m.isin
      && (near(t.qty, m.qty) || (snapshot !== undefined && near(t.qty, snapshot))));
    if (!sale) continue;
    let buy: Txn | undefined;
    if (want.buy) {
      const b = want.buy;
      buy = input.newTxns.find((t) => t !== sale && inWindow(t) && t.side === 'buy' && t.memberId === b.memberId && t.isin === b.isin);
      if (!buy) continue;
    }
    used.add(sale.id);
    if (buy) used.add(buy.id);
    out.push(statusRecord(m, 'detected_done', at));
  }
  return out;
}
