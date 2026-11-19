import { emailKindFor, renderEmail, type EmailKind, type SeasonEmailInput } from './seasonEmail.ts';
import { familyAad, openJson, type Envelope, type KeyRing } from './envelope.ts';

type ISODate = string;
export type LogKind = EmailKind | 'season_check';

/** One row for the whole beta: totals and a sorted list of shares, no user id. `used_share_by_family` leaves out families whose usable room is 0. Column names are the table's. */
export interface SeasonStatsRow {
  week: ISODate;
  families: number;
  room_usable: number;
  room_used: number;
  used_share_by_family: number[];
  moves_shown: number;
  moves_dated: number;
  moves_done: number;
  moves_detected: number;
  families_with_detected: number;
}

/** How a season_log row ended: null while the run that wrote it is still working (or died mid-way; never retried). */
export type Outcome = 'sent' | 'nothing_to_send' | 'failed';

export interface AlertsDb {
  /**
   * Families with season help on in the clear column, joined to the confirmed sign-in email ('' when not confirmed).
   * With `adminsOnly`, only families whose user id is in `admins` (a rehearsal run).
   */
  optedIn(adminsOnly: boolean): Promise<{ userId: string; email: string; version: number; envelope: Envelope; updatedAt: string }[]>;
  /** The day's row for this family and kind: whether it exists, how it ended, and whether a retry is under way. */
  logged(userId: string, kind: LogKind, onDate: ISODate): Promise<{ exists: boolean; outcome: Outcome | null; retrying: boolean }>;
  /** false on a unique clash: another run already did it. */
  log(userId: string, kind: LogKind, onDate: ISODate): Promise<boolean>;
  /** Claims a failed row for a retry: `set retrying = true where outcome = 'failed' and not retrying`. false when another run got it. */
  claimRetry(userId: string, kind: LogKind, onDate: ISODate): Promise<boolean>;
  /** Records how the attempt ended (and keeps `sent` in step); clears `retrying`. */
  setOutcome(userId: string, kind: LogKind, onDate: ISODate, outcome: Outcome): Promise<void>;
  unlog(userId: string, kind: LogKind, onDate: ISODate): Promise<void>;
  /** Upsert on `week`. */
  saveStats(row: SeasonStatsRow): Promise<void>;
}

export interface PriceFile { date: ISODate; source: string; prices: Record<string, number> }
export interface FundsFile { date: ISODate; funds: Record<string, { n: string; c: string }> }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
/** The published closing prices, or null when the file is not what the nightly job writes. */
export const parsePrices = (j: unknown): PriceFile | null => (isObj(j) && typeof j.date === 'string' && isObj(j.prices) ? (j as unknown as PriceFile) : null);
/** The published fund list, or null when malformed. */
export const parseFunds = (j: unknown): FundsFile | null => (isObj(j) && typeof j.date === 'string' && isObj(j.funds) ? (j as unknown as FundsFile) : null);

/** A fixed sample for the founder's pre-season check of the email provider. It carries no family data. */
export function sampleEmail(appUrl: string): { subject: string; text: string } {
  return {
    subject: 'Harvesting test email',
    text: `This is a test of the Harvesting season emails. If you can read it, the email provider is set up.\n\nOpen Harvesting: ${appUrl}\n`,
  };
}

/** The slice of the engine bundle this module uses. Injected: Vitest passes the TypeScript source, the Deno entry the built bundle. */
export interface AlertsEngine {
  // deno-lint-ignore no-explicit-any
  withFunds(securities: any[], file: FundsFile | null, userOverrides: Record<string, any>): any[];
  withPrices(securities: any[], file: PriceFile | null): any[];
  computeFamily(state: any, asOf: ISODate, rules: any): any;
  // deno-lint-ignore no-explicit-any
  seasonSummary(view: any, state: any, asOf: ISODate): SeasonEmailInput & {
    usable: number; used: number; shown: number; dated: number; done: number; detected: number;
  };
  lastSafeDay(yearEnd: ISODate, h: { published: boolean; dates: ISODate[] }): ISODate | null;
  todayISO(now: Date): ISODate;
  rules: { end: ISODate };
  holidays: { published: boolean; dates: ISODate[] };
}

export interface AlertsDeps {
  db: AlertsDb; ring: KeyRing; prices: PriceFile; funds: FundsFile; appUrl: string; engine: AlertsEngine;
  send: (to: string, subject: string, text: string) => Promise<void>;
}

interface FamilyDoc {
  alerts?: { seasonHelp?: boolean };
  securities?: Array<{ isin: string; priceDate?: ISODate }>;
  taxTypeOverrides?: Record<string, string>;
  imports?: Array<{ at: string }>;
  recommendations?: unknown[];
  datedMoves?: unknown[];
  [k: string]: unknown;
}

const parts = (d: string) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7), d: +d.slice(8, 10) });
const isSunday = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay() === 0;

/** The days the server also computes season numbers: each email Sunday, and 31 March for the final totals. Never after 31 March. */
function isNumbersDay(d: ISODate, emailKind: EmailKind | null): boolean {
  const p = parts(d);
  if (p.m === 3 && p.d === 31) return true;
  return emailKind !== null && isSunday(d);
}

/**
 * The date for a rehearsal run (header `x-alerts-date`): an ISO date from 1 Feb to 31 Mar of the rules' end year, else null.
 * The caller accepts it only after the secret has matched.
 */
export function rehearsalDate(header: string | null | undefined, rulesEnd: ISODate): ISODate | null {
  if (!header || !/^\d{4}-\d{2}-\d{2}$/.test(header)) return null;
  const y = rulesEnd.slice(0, 4);
  if (header.slice(0, 4) !== y || header < `${y}-02-01` || header > `${y}-03-31`) return null;
  const t = new Date(Date.UTC(+header.slice(0, 4), +header.slice(5, 7) - 1, +header.slice(8, 10)));
  return t.toISOString().slice(0, 10) === header ? header : null;
}

/** Constant-time comparison for the shared secret. Missing or empty never matches. */
export function secretMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * The daily run. Send days (spec section 7) email; email Sundays and 31 March also total the season (section 8), and
 * there are no reads after 31 March. Each family's read is logged before anything is decrypted, and each row gets an
 * outcome once the attempt ends. A same-day re-run skips every row except one whose outcome is 'failed', which it first
 * claims with a conditional update so two runs never both retry it; a row with no outcome (a run still working, or one
 * that died after sending) is never retried, so nobody is emailed twice. A row is never taken back once the family has
 * been decrypted. A rehearsal run (`rehearsal: true`) reads only the admins' families and writes no season totals.
 * Counts only are returned; nothing personal is logged.
 */
export async function runAlerts(
  today: ISODate, deps: AlertsDeps, opts: { rehearsal?: boolean } = {},
): Promise<{ sent: number; checked: number; stats: boolean }> {
  const { db, ring, prices, funds, appUrl, engine } = deps;
  const none = { sent: 0, checked: 0, stats: false };
  // The rules are for one tax year; outside its season there is nothing to say.
  if (today.slice(0, 4) !== engine.rules.end.slice(0, 4)) return none;
  const lastSafe = engine.lastSafeDay(engine.rules.end, engine.holidays);
  const emailKind = emailKindFor(today, lastSafe);
  const numbers = isNumbersDay(today, emailKind);
  if (!emailKind && !numbers) return none;
  const kind: LogKind = emailKind ?? 'season_check';

  let sent = 0, checked = 0, skippedDone = 0;
  const shares: number[] = [];
  const totals = { room_usable: 0, room_used: 0, moves_shown: 0, moves_dated: 0, moves_done: 0, moves_detected: 0, families_with_detected: 0 };

  // An outcome that cannot be written is logged by code only; the row stays without an outcome and is never retried.
  const record = (userId: string, outcome: Outcome) => db.setOutcome(userId, kind, today, outcome).catch((e) => {
    const err = e as { code?: string; name?: string } | null;
    console.error('alerts: outcome not recorded', err?.code ?? err?.name);
  });

  for (const f of await db.optedIn(!!opts.rehearsal)) {
    if (!f.email) continue;
    let owned = false, opened = false, retryRow = false;
    try {
      const row = await db.logged(f.userId, kind, today);
      if (row.exists) {
        // Only a failed email row is retried, and only by the run that claims it.
        if (row.outcome !== 'failed' || emailKind === null || row.retrying || !(await db.claimRetry(f.userId, kind, today))) { skippedDone++; continue; }
        retryRow = true;
      } else if (!(await db.log(f.userId, kind, today))) { skippedDone++; continue; }
      owned = true;
      const doc = await openJson<FamilyDoc>(f.envelope, ring, familyAad(f.userId, f.version));
      opened = true;
      if (doc.alerts?.seasonHelp !== true) { await record(f.userId, 'nothing_to_send'); continue; } // the read happened, so its row stays
      // The same path as the app: AMFI categories and repo overrides, the family's own choices, then closing prices.
      const securities = engine.withPrices(engine.withFunds(doc.securities ?? [], funds, doc.taxTypeOverrides ?? {}), prices);
      const view = engine.computeFamily({ ...doc, securities, funds: funds.funds }, today, engine.rules);
      const s = engine.seasonSummary(view, {
        recommendations: doc.recommendations ?? [], datedMoves: doc.datedMoves ?? [],
        imports: (doc.imports ?? []).map((i) => ({ date: i.at.slice(0, 10) })),
      }, today);
      checked++;
      if (numbers) {
        totals.room_usable += s.usable; totals.room_used += s.used;
        totals.moves_shown += s.shown; totals.moves_dated += s.dated; totals.moves_done += s.done; totals.moves_detected += s.detected;
        if (s.detected > 0) totals.families_with_detected++;
        if (s.usable > 0) shares.push(Math.round((s.used / s.usable) * 10_000) / 10_000);
      }
      // The email's figure is the usable room still left: usable minus used.
      const mail = emailKind
        ? renderEmail(emailKind, { ...s, roomLeft: Math.max(0, s.usable - s.used) }, engine.todayISO(new Date(f.updatedAt)), today, appUrl, lastSafe)
        : null;
      if (!mail) { await record(f.userId, 'nothing_to_send'); continue; }
      await deps.send(f.email, mail.subject, mail.text); // a throw here marks the row failed, for a retry
      sent++;
      await record(f.userId, 'sent');
    } catch (e) {
      const err = e as { code?: string; name?: string } | null;
      console.error('alerts: a family failed', err?.code ?? err?.name);
      // Take a new row back only if nothing was read (decrypt failed), so a later run can do it. Never after a decrypt.
      if (owned && !opened && !retryRow) await db.unlog(f.userId, kind, today).catch(() => {});
      else if (owned) await record(f.userId, 'failed');
    }
  }

  // A re-run that skipped families would total only the rest and overwrite the first run's row.
  const writeStats = numbers && checked > 0 && skippedDone === 0 && !opts.rehearsal;
  if (writeStats) await db.saveStats({ week: today, families: checked, ...totals, used_share_by_family: shares.sort((a, b) => a - b) });
  return { sent, checked, stats: writeStats };
}
