import type { Paise } from '../engine/types';

/** Rupees typed into a field, as paise. Blank or not a plain non-negative number: null. "0" is 0. */
export function parseRupees(text: string): Paise | null {
  const s = text.replace(/[,₹\s]/g, '');
  if (s === '' || !/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/**
 * What a money field shows: the text the person typed while it still means the stored value (so "0" or "1,00,000"
 * stays as typed), otherwise the stored value. Nothing typed and zero stored shows blank.
 */
export function moneyText(typed: string | null, value: Paise): string {
  if (typed != null && (parseRupees(typed) ?? 0) === value) return typed;
  return value ? String(Math.round(value / 100)) : '';
}
