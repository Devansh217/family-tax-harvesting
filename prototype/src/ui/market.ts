import type { FamilyView } from '../engine/family';
import type { ISODate, Paise, Security } from '../engine/types';
import type { PriceFile } from '../prices/parse';

export interface Market { latest: PriceFile | null; previous: PriceFile | null }

async function getJson(path: string): Promise<PriceFile | null> {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = (await r.json()) as PriceFile;
    return j && typeof j.date === 'string' && j.prices ? j : null;
  } catch {
    return null;
  }
}

/** Closing prices published with the site by the nightly job. Missing files (local dev, first deploy) are fine. */
export async function loadMarket(): Promise<Market> {
  const [latest, previous] = await Promise.all([getJson('./prices/latest.json'), getJson('./prices/previous.json')]);
  return { latest, previous };
}

/** Uses the closing price when it is at least as recent as the price from the user's own statement. */
export function withPrices(securities: Security[], file: PriceFile | null): Security[] {
  if (!file) return securities;
  return securities.map((s) => {
    const p = file.prices[s.isin];
    if (p == null || (s.priceDate && s.priceDate > file.date)) return s;
    return { ...s, price: p, priceDate: file.date };
  });
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
