import { addDays, daysBetween } from './dates';
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
  imports?: Array<{ memberId: string; statementFrom?: ISODate; statementTo?: ISODate; accounts?: string[] }>;
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
  for (const [k, d] of statementCover(state)) see(k, d);
  for (const b of countingSummaries(state.brokerSummaries ?? [])) see(accountKey(b.memberId, b.account), b.summary.to);
  return out;
}

/**
 * Per folio, the day fund statements are known to cover it without a gap. A statement lists every trade in its period
 * only, so a chain starts with one that begins on or before both the folio's first trade in any file and 1 April of
 * the tax year it reaches (a sale earlier that year may be in no file, and the first trade seen may not be the
 * first), and each next one must begin by the day after the cover so far ends: a month-only statement after a gap
 * says nothing about the redemptions in the gap. Statements are taken in order of
 * start, so the answer is the same whatever order the files came in. A folio with no trade in any file gets none.
 */
/** 1 April of the Indian tax year `d` falls in. */
const taxYearStart = (d: ISODate): ISODate => `${Number(d.slice(0, 4)) - (d.slice(5, 7) < '04' ? 1 : 0)}-04-01`;

function statementCover(state: EvidenceState): Map<string, ISODate> {
  const first = new Map<string, ISODate>();
  for (const t of state.txns) {
    const k = accountKey(t.memberId, t.account);
    if (isFundStatement(t) && t.date < (first.get(k) ?? '9999')) first.set(k, t.date);
  }
  const periods = new Map<string, Array<{ from: ISODate; to: ISODate }>>();
  for (const i of state.imports ?? []) {
    if (!i.statementFrom || !i.statementTo) continue;
    for (const a of i.accounts ?? []) {
      const k = accountKey(i.memberId, a);
      periods.set(k, [...(periods.get(k) ?? []), { from: i.statementFrom, to: i.statementTo }]);
    }
  }
  const out = new Map<string, ISODate>();
  for (const [k, ps] of periods) {
    const f = first.get(k);
    if (!f) continue;
    let cover: ISODate | null = null;
    for (const p of [...ps].sort((a, b) => a.from.localeCompare(b.from))) {
      const starts = p.from <= f && p.from <= taxYearStart(p.to);
      const joins = starts || (cover != null && p.from <= addDays(cover, 1));
      if (joins && (!cover || p.to > cover)) cover = p.to;
    }
    if (cover) out.set(k, cover);
  }
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
