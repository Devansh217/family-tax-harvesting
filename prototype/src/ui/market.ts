import type { FamilyView } from '../engine/family';
import { classifyFund } from '../engine/categories';
import { withFunds, withPrices } from '../engine/market';
import type { ISODate, Paise, Security } from '../engine/types';
import type { FundsFile, PriceFile } from '../prices/parse';

// Kept here for the screens that already import them from this file.
export { withFunds, withPrices };

export interface Market { latest: PriceFile | null; previous: PriceFile | null; funds: FundsFile | null }

async function getJson(path: string): Promise<PriceFile | null> {
  const j = await fetchJson<PriceFile>(path);
  return j && typeof j.date === 'string' && j.prices ? j : null;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Closing prices published with the site by the nightly job. Missing files (local dev, first deploy) are fine. */
export async function loadMarket(): Promise<Market> {
  const [latest, previous] = await Promise.all([getJson('./prices/latest.json'), getJson('./prices/previous.json')]);
  const f = await fetchJson<FundsFile>('./prices/funds.json');
  const funds = f && typeof f.date === 'string' && f.funds && typeof f.funds === 'object' ? f : null;
  return { latest, previous, funds };
}

/**
 * Securities for the Compare screen: the family's holdings as already classified, plus the picked fund from AMFI's
 * list when the family doesn't hold it, classified from its category.
 */
export function securitiesForCompare(held: Security[], file: FundsFile | null, isin: string): Security[] {
  const f = file?.funds[isin];
  if (!isin || held.some((s) => s.isin === isin) || !f) return held;
  const cl = classifyFund(f.c, f.n);
  return [...held, { isin, name: f.n, taxType: cl.taxType, listed: cl.listed, category: f.c, taxTypeSource: 'amfi' }];
}

/** One row of the daily history kept in the browser. */
export interface Snapshot {
  date: ISODate;
  value: Paise;
  ltGain: Paise;
  stGain: Paise;
  freeRoom: Paise;
  taxFreePossible: Paise;
}

export function snapshotOf(fam: FamilyView, date: ISODate): Snapshot {
  const hs = fam.members.flatMap((v) => v.holdings);
  return {
    date,
    value: hs.reduce((a, h) => a + (h.value ?? 0), 0),
    ltGain: hs.reduce((a, h) => a + h.ltGain, 0),
    stGain: hs.reduce((a, h) => a + h.stGain, 0),
    freeRoom: fam.totals.freeRoom,
    taxFreePossible: fam.totals.taxFreeGains,
  };
}

/** Keeps one snapshot per closing date, newest last, at most 120. */
export function addSnapshot(history: Snapshot[], s: Snapshot): Snapshot[] {
  const rest = history.filter((h) => h.date !== s.date);
  return [...rest, s].sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
}
