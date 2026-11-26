import { daysBetween } from './dates';
import { countingSummaries } from './family';
import { isTradebook, normAccount, type HeldPosition } from './openingLots';
import type { ISODate, Txn } from './types';

/** Data this many days old or more is "old". */
export const OLD_DATA_DAYS = 30;

/** The key of one member's account, whatever the spaces and case of its label. */
export const accountKey = (memberId: string, account?: string) => `${memberId}|${normAccount(account)}`;

/** A fund statement: its transactions carry a folio label as the account and no holdings rows. */
const isFundStatement = (t: Txn) => t.source.startsWith('Mutual fund CAS') || t.source.startsWith('Combined CAS');

/**
 * Per member and account, the newest date any evidence reaches: the latest of a holdings file's date, the last
 * tradebook or fund-statement trade (fund statements only when `fundStatements`, default true), and the end of a Tax P&L that counts. Undated files and P&Ls with no end add
 * nothing; an account with no dated evidence has no entry.
 */
export function newestEvidence(state: {
  txns: Txn[];
  positions?: HeldPosition[];
  brokerSummaries?: Array<{ memberId: string; account: string; summary: { from: ISODate | null; to: ISODate | null } }>;
}, opts: { fundStatements?: boolean } = {}): Map<string, ISODate> {
  const { fundStatements = true } = opts;
  const out = new Map<string, ISODate>();
  const see = (k: string, d: ISODate | null | undefined) => {
    if (d && d > (out.get(k) ?? '')) out.set(k, d);
  };
  for (const t of state.txns) if (isTradebook(t) || (fundStatements && isFundStatement(t))) see(accountKey(t.memberId, t.account), t.date);
  for (const p of state.positions ?? []) see(accountKey(p.memberId, p.account), p.asOf);
  for (const b of countingSummaries(state.brokerSummaries ?? [])) see(accountKey(b.memberId, b.account), b.summary.to);
  return out;
}

/** True when `date` is `OLD_DATA_DAYS` or more days before `today`. */
export const isOld = (date: ISODate, today: ISODate): boolean => daysBetween(date, today) >= OLD_DATA_DAYS;
