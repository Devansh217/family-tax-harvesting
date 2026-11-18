import { emailKindFor, renderEmail, type EmailKind, type SeasonEmailInput } from './seasonEmail.ts';
import { familyAad, openJson, type Envelope, type KeyRing } from './envelope.ts';

type ISODate = string;
export type LogKind = EmailKind | 'season_check';

/** One row for the whole beta: totals and a sorted list of shares, no user id. Column names are the table's. */
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

export interface AlertsDb {
  /** Families with season help on in the clear column, joined to the confirmed sign-in email ('' when not confirmed). */
  optedIn(): Promise<{ userId: string; email: string; version: number; envelope: Envelope; updatedAt: string }[]>;
  logged(userId: string, kind: LogKind, onDate: ISODate): Promise<boolean>;
  /** false on a unique clash: another run already did it. */
  log(userId: string, kind: LogKind, onDate: ISODate): Promise<boolean>;
  unlog(userId: string, kind: LogKind, onDate: ISODate): Promise<void>;
  /** Upsert on `week`. */
  saveStats(row: SeasonStatsRow): Promise<void>;
}

export interface PriceFile { date: ISODate; source: string; prices: Record<string, number> }

/** The slice of the engine bundle this module uses. Injected: Vitest passes the TypeScript source, the Deno entry the built bundle. */
export interface AlertsEngine {
  // deno-lint-ignore no-explicit-any
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
  db: AlertsDb; ring: KeyRing; prices: PriceFile; appUrl: string; engine: AlertsEngine;
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

/** Sundays from 1 Feb to the first Sunday of April: the days the server also computes season numbers. */
function isNumbersSunday(d: ISODate): boolean {
  if (!isSunday(d)) return false;
  const p = parts(d);
  return p.m === 2 || p.m === 3 || (p.m === 4 && p.d <= 7);
}

/** Constant-time comparison for the shared secret. Missing or empty never matches. */
export function secretMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Closing prices from the public file, plus the family's own tax-type choices (the server has no funds file). */
function priced(doc: FamilyDoc, prices: PriceFile): unknown[] {
  return (doc.securities ?? []).map((s) => {
    const o = doc.taxTypeOverrides?.[s.isin];
    const withType = o ? { ...s, taxType: o } : s;
    const p = prices.prices[s.isin];
    if (p == null || (s.priceDate && s.priceDate > prices.date)) return withType;
    return { ...withType, price: p, priceDate: prices.date };
  });
}

/**
 * The daily run. Send days (spec section 7) email; Sundays from 1 Feb to the first Sunday of April also total the
 * season (section 8). Each family's read is logged before anything is decrypted, and a family already logged for the
 * day is skipped without decrypting, so a re-run does nothing. Counts only are returned; nothing personal is logged.
 */
export async function runAlerts(today: ISODate, deps: AlertsDeps): Promise<{ sent: number; checked: number; stats: boolean }> {
  const { db, ring, prices, appUrl, engine } = deps;
  const none = { sent: 0, checked: 0, stats: false };
  // The rules are for one tax year; outside its season there is nothing to say.
  if (today.slice(0, 4) !== engine.rules.end.slice(0, 4)) return none;
  const lastSafe = engine.lastSafeDay(engine.rules.end, engine.holidays);
  const emailKind = emailKindFor(today, lastSafe);
  const numbers = isNumbersSunday(today);
  if (!emailKind && !numbers) return none;
  const kind: LogKind = emailKind ?? 'season_check';

  let sent = 0, checked = 0, skippedDone = 0;
  const shares: number[] = [];
  const totals = { room_usable: 0, room_used: 0, moves_shown: 0, moves_dated: 0, moves_done: 0, moves_detected: 0, families_with_detected: 0 };

  for (const f of await db.optedIn()) {
    if (!f.email) continue;
    if (await db.logged(f.userId, kind, today)) { skippedDone++; continue; }
    if (!(await db.log(f.userId, kind, today))) { skippedDone++; continue; }
    try {
      const doc = await openJson<FamilyDoc>(f.envelope, ring, familyAad(f.userId, f.version));
      if (doc.alerts?.seasonHelp !== true) continue; // the read happened, so its row stays
      const state = { ...doc, securities: priced(doc, prices), funds: undefined };
      const view = engine.computeFamily(state, today, engine.rules);
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
      if (emailKind) {
        const mail = renderEmail(emailKind, s, engine.todayISO(new Date(f.updatedAt)), today, appUrl, lastSafe);
        if (mail) {
          await deps.send(f.email, mail.subject, mail.text);
          sent++;
        }
      }
    } catch {
      // This family's read or send failed: take its row back so a retry can do it, and carry on with the others.
      await db.unlog(f.userId, kind, today).catch(() => {});
    }
  }

  // A re-run that skipped families would total only the rest and overwrite the first run's row.
  const writeStats = numbers && checked > 0 && skippedDone === 0;
  if (writeStats) await db.saveStats({ week: today, families: checked, ...totals, used_share_by_family: shares.sort((a, b) => a - b) });
  return { sent, checked, stats: writeStats };
}
