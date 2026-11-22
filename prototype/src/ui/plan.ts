import { taxFreeGainOf, type FamilyView, type Move } from '../engine/family';
import { doneThisSeason, type RecommendationRecord } from '../engine/records';
import { QTY_SCALE, type ISODate } from '../engine/types';

/** Days a move can be put on: from today to the last safe day, or to the end of the tax year when that is not known. */
export const datePickerBounds = (today: ISODate, yearEnd: ISODate, lastSafe: ISODate | null) => ({ min: today, max: lastSafe ?? yearEnd });

export const dateVerb = (kind: Move['kind']) => (kind === 'gift' ? 'Gift and sell on' : kind === 'switch_direct' ? 'Switch on' : 'Sell on');

/** Tax cut this year by a move (losses and waits); harvests, gifts and switches pay off later or in fees. */
const nowSavingOf = (m: Move) => (m.kind === 'harvest_loss' || m.kind === 'wait' ? m.saving : 0);

/**
 * The Plan screen's lists and headline. Done moves (marked, or seen in a statement) leave the open lists for "Done this
 * season", built from their records, so they stay counted after the next import sells the units and the move is gone.
 */
export function planView(fam: Pick<FamilyView, 'moves' | 'rules'>, records: RecommendationRecord[]) {
  const done = doneThisSeason(records, fam.rules).map((d) => ({
    ...d, label: d.detected ? 'Done, seen in your statement' : 'Marked done',
  }));
  const doneIds = new Set(done.map((d) => d.move.id));
  const open = fam.moves.filter((m) => !doneIds.has(m.id));
  const sum = (ms: Move[], f: (m: Move) => number) => ms.reduce((a, m) => a + f(m), 0);
  const doneMoves = done.map((d) => d.move).filter((m) => !m.noRoom);
  const gainDone = sum(doneMoves, taxFreeGainOf);
  const nowDone = sum(doneMoves, nowSavingOf);
  return {
    open, done, gainDone, gainTotal: gainDone + sum(open, taxFreeGainOf), nowDone, nowTotal: nowDone + sum(open, nowSavingOf),
    doneCount: doneMoves.length, liveCount: doneMoves.length + open.filter((m) => !m.noRoom).length,
  };
}

export interface PlanGap {
  memberId: string;
  key: 'no_holdings' | 'shares_no_dates' | 'funds_no_dates' | 'funds_to_check';
  text: string;
  /** Where to fix it. */
  href: string;
  action: string;
}

type HeldPositionLike = { memberId: string; isin?: string; qty?: number; source?: string; ltQty?: number; cost?: number };
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/**
 * What keeps the plan from being complete, per member, each with the file or step that fixes it. Holdings without
 * buy dates get no moves; funds with an unknown tax type get none either.
 */
export function planGaps(fam: Pick<FamilyView, 'members'> & Partial<Pick<FamilyView, 'securities'>>, positions: HeldPositionLike[]): PlanGap[] {
  const out: PlanGap[] = [];
  for (const v of fam.members) {
    const { id, name } = v.member;
    if (v.holdings.length === 0) {
      out.push({ memberId: id, key: 'no_holdings', text: `${name}: nothing imported yet. Their holdings file is enough for a first plan.`, href: '#import', action: 'Import' });
      continue;
    }
    // Lots with guessed dates, plus units a holdings file shows that the history does not explain at all (bought
    // before the tradebook, in a security that also traded since).
    const missing = new Map<string, number>();
    for (const p of positions) {
      if (p.memberId !== id || !p.isin || p.qty == null) continue;
      missing.set(p.isin, Math.max(missing.get(p.isin) ?? 0, p.qty));
    }
    const unexplained = (isin: string) => {
      const held = v.holdings.find((h) => h.isin === isin);
      const short = (missing.get(isin) ?? 0) - (held?.qty ?? 0);
      const price = fam.securities?.get(isin)?.price ?? held?.price ?? 0;
      return short > 0 ? Math.round((short * price) / QTY_SCALE) : 0;
    };
    const undated = (fund: boolean) => v.holdings
      .filter((h) => h.isin.startsWith('INF') === fund && h.uncertainLots > 0)
      .reduce((a, h) => a + h.lots.filter((l) => !l.certain).reduce((b, l) => b + (l.value ?? 0), 0), 0)
      + [...missing.keys()].filter((isin) => isin.startsWith('INF') === fund).reduce((a, isin) => a + unexplained(isin), 0);
    const shares = undated(false);
    if (shares > 0) {
      const mine = positions.filter((p) => p.memberId === id && p.ltQty != null);
      const stale = mine.some((p) => p.cost == null);
      const filled = mine.some((p) => p.cost != null);
      out.push({
        memberId: id, key: 'shares_no_dates', href: '#import', action: 'Import',
        text: stale
          ? `${name}: ${rupees(shares)} in shares has no buy dates. Import their holdings file again: it now fills in shares bought before the tradebook.`
          : filled
            ? `${name}: ${rupees(shares)} in shares was bought in the year before the tradebook starts, so the app can't tell when it turns long-term. Import last year's tradebook.`
            : `${name}: ${rupees(shares)} in shares has no buy dates, so it gets no moves. Import the broker's holdings file, or tradebooks going back to the first purchase.`,
      });
    }
    const funds = undated(true);
    if (funds > 0) {
      out.push({
        memberId: id, key: 'funds_no_dates', href: '#import', action: 'Import',
        text: `${name}: ${rupees(funds)} in mutual funds has no buy dates, so it gets no moves. Import their CAS (free from MF Central, CAMS or KFintech): it has every purchase.`,
      });
    }
    const check = v.holdings.filter((h) => h.taxType === 'check').length;
    if (check > 0) {
      out.push({
        memberId: id, key: 'funds_to_check', href: `#member-${id}`, action: 'Pick',
        text: `${name}: ${check} ${check === 1 ? 'fund needs' : 'funds need'} a tax type before they get moves.`,
      });
    }
  }
  return out;
}
