import { BUYBACK_DIVIDEND_FROM, rulesFor } from '../engine/rules';
import type { ISODate, Paise } from '../engine/types';

/**
 * What a buyback exit in a broker Tax P&L is, by its date: a capital gain to book (from 1 Apr 2026), dividend income
 * (1 Oct 2024 to 31 Mar 2026) or tax the company paid (before 1 Oct 2024). Shared by every Tax P&L reader.
 */
export type BuybackOutcome = 'book' | 'dividend' | 'companyPaid';

export function buybackOutcome(exit: ISODate): BuybackOutcome {
  const rules = rulesFor(exit);
  // rulesFor falls back to the oldest known year for earlier dates, so the exit must also fall inside that year.
  if (rules.buybackIsCapitalGain && exit >= rules.start) return 'book';
  return exit < BUYBACK_DIVIDEND_FROM ? 'companyPaid' : 'dividend';
}

/** The card lines for buybacks left out, in the same words for every broker. */
export function buybackWarnings(dividend: number, companyPaid: number): string[] {
  const out: string[] = [];
  const exits = (n: number) => `${n} buyback ${n === 1 ? 'exit' : 'exits'}`;
  const was = (n: number) => (n === 1 ? 'was' : 'were');
  if (dividend) out.push(`${exits(dividend)} from 1 Oct 2024 to 31 Mar 2026 ${was(dividend)} left out: in that period buyback money was taxed as dividend income.`);
  if (companyPaid) out.push(`${exits(companyPaid)} before 1 Oct 2024 ${was(companyPaid)} left out: the company paid the tax on those.`);
  return out;
}

/**
 * A broker equity total that counts the buyback exits the parser books (capital gains from 1 Apr 2026), so the
 * engine's own figure, which books them, lands on it. A total that already matches its section plus the buybacks is
 * kept; one that matches the section alone gets them added. One that matches neither gets a buyback gain added and a
 * buyback loss left out: more booked gain is the safe side (less room, more tax).
 */
export function withBuybacks(total: Paise | null, section: Paise, buybacks: Paise): Paise | null {
  if (total == null || buybacks === 0) return total;
  const near = (a: Paise, b: Paise) => Math.abs(a - b) <= Math.max(100, Math.abs(total) * 0.0005);
  if (near(total, section + buybacks)) return total;
  if (near(total, section)) return total + buybacks;
  return total + Math.max(0, buybacks);
}
