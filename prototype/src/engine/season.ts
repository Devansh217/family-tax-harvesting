import { addDays } from './dates';
import type { ISODate } from './types';

export { NSE_HOLIDAYS_2027 } from './data/holidays-2027';

/** Day of week from the ISO date alone (0 = Sunday), via UTC so no clock or time zone is involved. */
function weekday(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** A trading day is Monday to Friday and not an exchange holiday. */
export function isTradingDay(d: ISODate, holidays: ISODate[]): boolean {
  const w = weekday(d);
  return w !== 0 && w !== 6 && !holidays.includes(d);
}

/** The first trading day strictly after `d`. */
export function nextTradingDay(d: ISODate, holidays: ISODate[]): ISODate {
  let n = addDays(d, 1);
  while (!isTradingDay(n, holidays)) n = addDays(n, 1);
  return n;
}

/**
 * The last day to sell this year with the buyback still landing before year end: the second-to-last trading day on or
 * before `yearEnd`. Null while the holiday list is not published, since a guess could be a day off.
 */
export function lastSafeDay(yearEnd: ISODate, h: { published: boolean; dates: ISODate[] }): ISODate | null {
  if (!h.published) return null;
  let d = yearEnd;
  let found = 0;
  for (;;) {
    if (isTradingDay(d, h.dates) && ++found === 2) return d;
    d = addDays(d, -1);
  }
}

/** When to buy back after a sale: the next trading day. Funds redeem on the sale day and settle on the next business day, same calendar. */
export function buybackDate(saleDate: ISODate, _listed: boolean, holidays: ISODate[]): ISODate {
  return nextTradingDay(saleDate, holidays);
}
