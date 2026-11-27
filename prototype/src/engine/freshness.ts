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

type EvidenceState = {
  txns: Txn[];
  positions?: HeldPosition[];
  brokerSummaries?: Array<{ memberId: string; account: string; summary: { from: ISODate | null; to: ISODate | null } }>;
  /** Imported files; a fund statement's period end dates each folio it lists. */
  imports?: Array<{ memberId: string; statementTo?: ISODate; accounts?: string[] }>;
};

/**
 * Per account, the newest of: the last tradebook or fund-statement trade, a fund statement's period end, the end of a
 * counting Tax P&L, and (when `holdings`) a holdings file's date.
 */
function newest(state: EvidenceState, holdings: boolean): Map<string, ISODate> {
  const out = new Map<string, ISODate>();
  const see = (k: string, d: ISODate | null | undefined) => {
    if (d && d > (out.get(k) ?? '')) out.set(k, d);
  };
  for (const t of state.txns) if (isTradebook(t) || isFundStatement(t)) see(accountKey(t.memberId, t.account), t.date);
  if (holdings) for (const p of state.positions ?? []) see(accountKey(p.memberId, p.account), p.asOf);
  // A fund statement lists every trade in its folios up to its period end, so a quiet folio is known to that day.
  for (const i of state.imports ?? []) for (const a of i.statementTo ? i.accounts ?? [] : []) see(accountKey(i.memberId, a), i.statementTo);
  for (const b of countingSummaries(state.brokerSummaries ?? [])) see(accountKey(b.memberId, b.account), b.summary.to);
  return out;
}

/**
 * Per member and account, the newest date any evidence reaches: the latest of a holdings file's date, the last
 * tradebook or fund-statement trade, a fund statement's period end, and the end of a Tax P&L that counts. Undated files and P&Ls with no end add
 * nothing; an account with no dated evidence has no entry. Dates the units held (a move's `oldData`).
 */
export const newestEvidence = (state: EvidenceState): Map<string, ISODate> => newest(state, true);

/**
 * Per member and account, the newest date the gains booked are known to: as `newestEvidence` but without holdings
 * files, which date the units and not the gains booked since. Dates the tax-free room (a move's `roomMayBeSmaller`).
 */
export const newestRoomEvidence = (state: EvidenceState): Map<string, ISODate> => newest(state, false);

/** True when `date` is `OLD_DATA_DAYS` or more days before `today`. */
export const isOld = (date: ISODate, today: ISODate): boolean => daysBetween(date, today) >= OLD_DATA_DAYS;
