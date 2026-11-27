import type { ISODate, Paise, Security, Txn } from './types';

/** A monthly fund purchase that looks like a SIP, found from the buys in the last 4 calendar months. */
export interface SipGuess { memberId: string; isin: string; name: string; account: string; monthly: Paise; day: number; months: number }

/** A SIP amount the family confirmed (or changed) for a member and fund. `monthly: 0` means stopped. */
export interface ConfirmedSip { memberId: string; isin: string; monthly: Paise; confirmedAt: ISODate }

const WINDOW_MONTHS = 4;
const MIN_MONTHS = 3;
const DAY_TOLERANCE = 3;
const AMOUNT_TOLERANCE = 0.1;

/** Median of a non-empty list; an even count gives the rounded mean of the middle two. */
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/** The month keys (`YYYY-MM`) of the 4 calendar months ending with the month of `asOf`, oldest first. */
function windowMonths(asOf: ISODate): string[] {
  let y = Number(asOf.slice(0, 4));
  let m = Number(asOf.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < WINDOW_MONTHS; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}

/**
 * Fund buys that repeat like a SIP. A fund is an unlisted security whose ISIN starts `INF`. Per member, fund and
 * account, a SIP needs at least 3 of the last 4 calendar months (ending with `asOf`'s month) with a buy within ±3 days
 * of the median day of the month and within ±10% of the median amount. A month with several such buys counts the one
 * closest to the median day; the rest are top-ups. Estimated or approximate buys (no real date) are not used.
 */
export function guessSips(txns: Txn[], securities: Security[], asOf: ISODate): SipGuess[] {
  const funds = new Map(securities.filter((s) => s.isin.startsWith('INF') && !s.listed).map((s) => [s.isin, s]));
  const months = windowMonths(asOf);
  const groups = new Map<string, { memberId: string; isin: string; account: string; buys: Txn[] }>();
  for (const t of txns) {
    if (t.side !== 'buy' || t.estimated || t.approx || t.amount <= 0 || !funds.has(t.isin)) continue;
    if (!months.includes(t.date.slice(0, 7)) || t.date > asOf) continue;
    const account = t.account ?? '';
    const key = `${t.memberId}|${t.isin}|${account}`;
    const g = groups.get(key) ?? { memberId: t.memberId, isin: t.isin, account, buys: [] };
    g.buys.push(t);
    groups.set(key, g);
  }
  const out: SipGuess[] = [];
  for (const g of groups.values()) {
    const day = median(g.buys.map((t) => Number(t.date.slice(8, 10))));
    const amount = median(g.buys.map((t) => t.amount));
    const picks: Array<{ month: string; day: number; amount: Paise }> = [];
    for (const month of months) {
      const fits = g.buys
        .filter((t) => t.date.startsWith(month))
        .map((t) => ({ month, day: Number(t.date.slice(8, 10)), amount: t.amount }))
        .filter((b) => Math.abs(b.day - day) <= DAY_TOLERANCE && Math.abs(b.amount - amount) <= amount * AMOUNT_TOLERANCE)
        .sort((a, b) => Math.abs(a.day - day) - Math.abs(b.day - day));
      if (fits[0]) picks.push(fits[0]);
    }
    if (picks.length < MIN_MONTHS) continue;
    out.push({
      memberId: g.memberId, isin: g.isin, name: funds.get(g.isin)!.name, account: g.account,
      monthly: median(picks.slice(-3).map((p) => p.amount)), day: median(picks.map((p) => p.day)), months: picks.length,
    });
  }
  return out;
}

/** The confirmed SIPs still running: the latest confirmation per member and fund, kept only when `monthly > 0`. */
export function activeSips(_guesses: SipGuess[], confirmed: ConfirmedSip[]): ConfirmedSip[] {
  const latest = new Map<string, ConfirmedSip>();
  for (const c of confirmed) {
    const key = `${c.memberId}|${c.isin}`;
    const prev = latest.get(key);
    if (!prev || c.confirmedAt >= prev.confirmedAt) latest.set(key, c);
  }
  return [...latest.values()].filter((c) => c.monthly > 0);
}
