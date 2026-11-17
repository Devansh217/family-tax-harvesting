import type { ISODate } from '../types';

/**
 * NSE trading holidays for 2027 (weekday closures only; weekends are handled in season.ts).
 * Fill from NSE's 2027 holiday circular (published mid-December 2026), then set published: true.
 */
export const NSE_HOLIDAYS_2027: { published: boolean; dates: ISODate[] } = {
  published: false,
  dates: [],
};
