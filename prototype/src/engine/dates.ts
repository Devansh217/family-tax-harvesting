import type { ISODate } from './types';

const parse = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return { y, m, day };
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Add calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: ISODate, months: number): ISODate {
  const { y, m, day } = parse(d);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(day, last))}`;
}

export function addDays(d: ISODate, days: number): ISODate {
  const { y, m, day } = parse(d);
  const t = new Date(Date.UTC(y, m - 1, day + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const A = parse(a);
  const B = parse(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.day) - Date.UTC(A.y, A.m - 1, A.day)) / 86_400_000);
}

/** First date on which a holding bought on `buy` counts as long-term ("held more than N months"). */
export function longTermFrom(buy: ISODate, months: number): ISODate {
  return addDays(addMonths(buy, months), 1);
}

export function isLongTerm(buy: ISODate, sell: ISODate, months: number): boolean {
  return sell >= longTermFrom(buy, months);
}

export const inRange = (d: ISODate, start: ISODate, end: ISODate) => d >= start && d <= end;

export function todayISO(): ISODate {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
