import { inRange } from './engine/dates';
import type { FamilyView } from './engine/family';
import type { Paise } from './engine/types';
import type { BrokerSummary } from './parsers';

export interface ReconLine {
  label: string;
  broker: Paise;
  ours: Paise;
  diff: Paise;
  ok: boolean;
}

/** Within ₹1, or 0.05% for large totals, counts as matching (rupee rounding in broker reports). */
const close = (a: Paise, b: Paise) => Math.abs(a - b) <= Math.max(100, Math.abs(b) * 0.0005);

/**
 * Compares the engine's realised gains for one account and period with the broker's own tax P&L totals.
 * Only lines the broker reports are compared.
 */
export function reconcile(fam: FamilyView, rec: { memberId: string; account: string; summary: BrokerSummary }): ReconLine[] {
  const { summary: s } = rec;
  const from = s.from ?? fam.rules.start, to = s.to ?? fam.rules.end;
  const mine = fam.ledger.realised.filter((r) => r.memberId === rec.memberId && (r.account ?? '') === rec.account && inRange(r.sellDate, from, to));
  // Brokers report shares (listed) and mutual funds separately.
  const isShare = (isin: string) => fam.securities.get(isin)?.listed ?? true;
  const total = (pred: (r: (typeof mine)[number]) => boolean) => mine.filter(pred).reduce((a, r) => a + r.gain, 0);
  const intraday = fam.ledger.intraday
    .filter((t) => t.memberId === rec.memberId && t.account === rec.account && inRange(t.date, from, to))
    .reduce((a, t) => a + t.pnl, 0);

  const lines: Array<[string, Paise | null, Paise]> = [
    ['Intraday', s.intraday, intraday],
    ['Shares, short-term', s.equityShortTerm, total((r) => r.term === 'st' && isShare(r.isin))],
    ['Shares, long-term', s.equityLongTerm, total((r) => r.term === 'lt' && isShare(r.isin))],
    ['Mutual funds, short-term', s.mfShortTerm, total((r) => r.term === 'st' && !isShare(r.isin))],
    ['Mutual funds, long-term', s.mfLongTerm, total((r) => r.term === 'lt' && !isShare(r.isin))],
  ];
  return lines
    .filter((l): l is [string, Paise, Paise] => l[1] != null)
    .map(([label, broker, ours]) => ({ label, broker, ours, diff: ours - broker, ok: close(ours, broker) }));
}
