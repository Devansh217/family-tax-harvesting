import type { FamilyView } from '../engine/family';
import { accountKey, newestEvidence } from '../engine/freshness';
import { normAccount, TRIMMING_HOLDINGS_SOURCES } from '../engine/openingLots';
import type { ISODate, Paise } from '../engine/types';
import type { AppState } from '../store';
import { unexplainedValue } from './plan';

export type GuideState = Pick<AppState, 'members' | 'txns' | 'positions' | 'imports' | 'brokerSummaries'>;
export type Broker = 'Zerodha' | 'Angel One' | 'Other' | 'Mutual funds';
export interface AccountRef { label: string; key: string; broker: Broker }

const BROKER_ORDER: Broker[] = ['Zerodha', 'Angel One', 'Other', 'Mutual funds'];
const isFundFormat = (f: string) => f.startsWith('Mutual fund CAS') || f.startsWith('Combined CAS');

/** Which broker section an account belongs to, from its label and the formats of the files imported into it. */
export function brokerOf(label: string, formats: string[]): Broker {
  const text = `${label} ${formats.join(' ')}`.toLowerCase();
  if (/zerodha|console|kite/.test(text)) return 'Zerodha';
  if (/angel/.test(text)) return 'Angel One';
  if (label.trim() === 'MF folios' || formats.some(isFundFormat)) return 'Mutual funds';
  return 'Other';
}

/** One entry per distinct account (whatever its spaces and case) a member has rows in, in section order. */
export function memberAccounts(state: GuideState, memberId: string): AccountRef[] {
  const formatOf = new Map(state.imports.map((i) => [i.id, i.format]));
  const found = new Map<string, { label: string; formats: Set<string> }>();
  const see = (account: string | undefined, importId: string | undefined) => {
    const key = normAccount(account);
    const e = found.get(key) ?? { label: (account ?? '').trim(), formats: new Set<string>() };
    const f = importId ? formatOf.get(importId) : undefined;
    if (f) e.formats.add(f);
    found.set(key, e);
  };
  for (const t of state.txns) if (t.memberId === memberId) see(t.account, t.importId);
  for (const p of state.positions) if (p.memberId === memberId) see(p.account, p.importId);
  for (const b of state.brokerSummaries) if (b.memberId === memberId) see(b.account, b.importId);
  return [...found].map(([key, e]) => ({ label: e.label, key, broker: brokerOf(e.label, [...e.formats]) }))
    .sort((x, y) => BROKER_ORDER.indexOf(x.broker) - BROKER_ORDER.indexOf(y.broker) || x.label.localeCompare(y.label));
}

/** The newest date any evidence reaches for one account (`newestEvidence`), or null when it has none. */
export function evidenceDate(state: GuideState, memberId: string, accountKeyOf: string): ISODate | null {
  return newestEvidence(state).get(accountKey(memberId, accountKeyOf)) ?? null;
}

/**
 * How much of a member's holdings the moves can use: `usable` is the value of lots whose date and cost are certain
 * (funds with an unknown tax type aside); `total` adds the lots that are guessed or unknown-type, and units a holdings
 * row shows that no lot explains. Lots with no price are in neither.
 */
export function usableShare(fam: Pick<FamilyView, 'members' | 'positions' | 'securities'>, memberId: string): { usable: Paise; total: Paise } {
  const view = fam.members.find((m) => m.member.id === memberId);
  let usable = 0;
  let total = 0;
  for (const h of view?.holdings ?? []) {
    for (const l of h.lots) {
      if (l.value == null) continue;
      total += l.value;
      if (l.certain && h.taxType !== 'check') usable += l.value;
    }
  }
  const missing = new Map<string, number>();
  for (const p of fam.positions) {
    if (p.memberId !== memberId || p.qty == null || TRIMMING_HOLDINGS_SOURCES.includes(p.source)) continue;
    missing.set(p.isin, Math.max(missing.get(p.isin) ?? 0, p.qty));
  }
  for (const [isin, qty] of missing) total += unexplainedValue(fam, memberId, isin, qty);
  return { usable, total };
}

/** Whole percent usable, or null when there is nothing to measure. */
export const pct = (s: { usable: Paise; total: Paise }): number | null => (s.total === 0 ? null : Math.round((s.usable * 100) / s.total));
