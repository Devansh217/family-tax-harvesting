import { countingSummaries, taxFreeGainOf, type FamilyView, type Move } from '../engine/family';
import { doneThisSeason, type RecommendationRecord } from '../engine/records';
import { APPROX_MARGIN, normAccount, TRIMMING_HOLDINGS_SOURCES } from '../engine/openingLots';
import { QTY_SCALE, type ISODate, type Paise } from '../engine/types';
import { possessive } from './format';
import { currentPnls, hasYearPnl, preBuybackPnls, type ImportLike } from './warnings';

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

/** Import with one member already picked: `#import-<memberId>`. */
export const importHref = (memberId: string) => `#import-${memberId}`;
export const importMemberOf = (route: string) => (route.startsWith('import-') ? route.slice(7) || undefined : undefined);

export interface PlanGap {
  memberId: string;
  key: 'no_holdings' | 'shares_no_dates' | 'funds_no_dates' | 'funds_to_check' | 'holdings_no_date' | 'buyback_pnl' | 'pnl_again';
  text: string;
  /** Where to fix it. */
  href: string;
  action: string;
}

type HeldPositionLike = { memberId: string; isin?: string; qty?: number; source?: string; ltQty?: number; cost?: number; account?: string; asOf?: ISODate };
type SummaryLike = { importId?: string; memberId: string; account: string; summary: { from: ISODate | null; to: ISODate | null } };
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/**
 * What keeps the plan from being complete, per member, each with the file or step that fixes it. Holdings without
 * buy dates get no moves; funds with an unknown tax type get none either.
 */
export function planGaps(
  fam: Pick<FamilyView, 'members'> & Partial<Pick<FamilyView, 'securities' | 'holdingsNotes' | 'rules'>>, positions: HeldPositionLike[], brokerSummaries: SummaryLike[] = [],
  imports: ImportLike[] = [],
): PlanGap[] {
  const out: PlanGap[] = [];
  // A Tax P&L read before buybacks counted can't close the buyback caveat; it asks to be imported again instead.
  const yearPnl = fam.rules ? hasYearPnl(currentPnls(brokerSummaries, imports), fam.rules) : () => true;
  const oldIds = preBuybackPnls(imports);
  // Only the totals that count: a P&L imported again replaces the old one, which then asks nothing.
  const counting = countingSummaries(brokerSummaries);
  const isOld = (b: SummaryLike) => !!b.importId && oldIds.has(b.importId);
  const inYear = (b: SummaryLike) => !!fam.rules && (b.summary.from ?? fam.rules.start) <= fam.rules.end && (b.summary.to ?? fam.rules.end) >= fam.rules.start;
  for (const v of fam.members) {
    const { id, name } = v.member;
    if (v.holdings.length === 0) {
      out.push({ memberId: id, key: 'no_holdings', text: `${name}: nothing imported yet. Their holdings file is enough for a first plan.`, href: importHref(id), action: 'Import' });
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
    // Set when a gap already asks for the holdings file again, so the undated-file gap below doesn't repeat it.
    let askedAgain = false;
    if (shares > 0) {
      const mine = positions.filter((p) => p.memberId === id && p.ltQty != null);
      const stale = mine.some((p) => p.cost == null);
      const filled = mine.some((p) => p.cost != null);
      askedAgain = stale;
      out.push({
        memberId: id, key: 'shares_no_dates', href: importHref(id), action: 'Import',
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
        memberId: id, key: 'funds_no_dates', href: importHref(id), action: 'Import',
        text: `${name}: ${rupees(funds)} in mutual funds has no buy dates, so it gets no moves. Import their CAS (free from MF Central, CAMS or KFintech): it has every purchase.`,
      });
    }
    // A holdings file saved before files were dated never trims: importing it again lets sold or moved shares drop out.
    // Not when a dated file for that account decides instead, or another gap already asks for the file again.
    const holdingsFile = positions.filter((p) => p.memberId === id && p.source != null && TRIMMING_HOLDINGS_SOURCES.includes(p.source));
    const datedAccounts = new Set(holdingsFile.filter((p) => p.asOf).map((p) => normAccount(p.account)));
    if (!askedAgain && holdingsFile.some((p) => !p.asOf && !datedAccounts.has(normAccount(p.account)))) {
      const whose = possessive(name);
      out.push({
        memberId: id, key: 'holdings_no_date', href: importHref(id), action: 'Import',
        text: `Import ${whose === 'Your' ? 'your' : whose} holdings file again so sold or moved shares drop out.`,
      });
    }
    // A Tax P&L for this year read before buybacks from 1 Apr 2026 counted as capital gains may lack them.
    const again = new Set<string>();
    for (const b of counting) {
      if (b.memberId !== id || again.has(b.account) || !isOld(b) || !inYear(b)) continue;
      again.add(b.account);
      const broker = b.account.trim() || 'your broker';
      out.push({
        memberId: id, key: 'pnl_again', href: importHref(id), action: 'Import',
        text: `${name}: import ${broker}'s tax P&L for ${fam.rules!.label} again. It was read before buybacks from 1 Apr 2026 counted as capital gains.`,
      });
    }
    // Trimmed units may include a buyback, a capital gain from 1 Apr 2026 that only the Tax P&L shows.
    for (const t of fam.holdingsNotes?.trimmed ?? []) {
      if (t.memberId !== id || yearPnl(id, t.account) || again.has(t.account)) continue;
      out.push({
        memberId: id, key: 'buyback_pnl', href: importHref(id), action: 'Import',
        text: `${name}: if any shares left ${t.account} in a buyback this year, that gain counts. Import ${t.account}'s tax P&L.`,
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

/** Shown only when the room left spare is at least this much. */
const NUDGE_MIN: Paise = 1_000_00;

/** The tax year before the one `date` falls in, e.g. "FY 2023-24" for 2 May 2024. */
function yearBefore(date: ISODate): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const start = (m >= 4 ? y : y - 1) - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/**
 * For a move sized from units bought before the trade history (`approx`): the room it left spare, and the tax year
 * whose tradebook would let it be used. `fy` is the year before the account's oldest tradebook, or null when there is
 * none. Null for an exact move or when the room is under ₹1,000 (rounded to ₹100).
 */
export function cushionNudge(move: Move, fam: Pick<FamilyView, 'tradebookFrom'>): { fy: string | null; rupees: Paise } | null {
  if (!move.approx || move.noRoom) return null;
  const gain = move.kind === 'harvest_loss' ? move.loss : move.gain;
  const rupees = Math.round((Math.abs(gain) * APPROX_MARGIN) / 10_000) * 10_000;
  if (rupees < NUDGE_MIN) return null;
  const memberId = move.kind === 'gift' ? move.fromId : move.memberId;
  const oldest = fam.tradebookFrom[`${memberId}|${normAccount(move.account)}`];
  return { fy: oldest ? yearBefore(oldest) : null, rupees };
}
