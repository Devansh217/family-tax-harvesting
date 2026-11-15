import { describe, expect, it } from 'vitest';
import { moneyText, parseRupees } from './money';

describe('money fields', () => {
  it('reads what was typed: zero is zero, blank is nothing, commas and ₹ are fine', () => {
    expect(parseRupees('0')).toBe(0);
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('  ')).toBeNull();
    expect(parseRupees('1,00,000')).toBe(1_00_000_00);
    expect(parseRupees('₹ 25000')).toBe(25_000_00);
    expect(parseRupees('12abc')).toBeNull();
    expect(parseRupees('-5')).toBeNull();
  });
  it('keeps the typed text while it means the stored value, so a typed 0 stays on screen', () => {
    expect(moneyText('0', 0)).toBe('0');
    expect(moneyText('1,00,000', 1_00_000_00)).toBe('1,00,000');
    expect(moneyText(null, 0)).toBe('');
    expect(moneyText(null, 25_000_00)).toBe('25000');
    expect(moneyText('500', 9_00_00)).toBe('900'); // the value changed elsewhere: show it
  });
});
