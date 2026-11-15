import type { FamilyView } from '../engine/family';
import { classifyFund } from '../engine/categories';
import overridesFile from '../engine/fund-overrides.json';
import type { ISODate, Paise, Security, TaxType } from '../engine/types';
import type { FundsFile, PriceFile } from '../prices/parse';

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

/** Uses the closing price when it is at least as recent as the price from the user's own statement. */
export function withPrices(securities: Security[], file: PriceFile | null): Security[] {
  if (!file) return securities;
  return securities.map((s) => {
    const p = file.prices[s.isin];
    if (p == null || (s.priceDate && s.priceDate > file.date)) return s;
    return { ...s, price: p, priceDate: file.date };
  });
}

/** Fund-specific corrections kept in the repo (src/engine/fund-overrides.json). */
interface FundOverride { isin: string; taxType: TaxType; listed?: boolean; reason: string; date: ISODate }
const REPO_OVERRIDES = new Map((overridesFile as FundOverride[]).map((o) => [o.isin, o]));

/**
 * Tax type for each fund. Precedence: the user's own choice (`user`) > the repo override list (`override`) > AMFI's
 * category (`amfi`). Shares and funds with no information keep what they have, so a missing file never breaks anything.
 */
export function withFunds(securities: Security[], file: FundsFile | null, userOverrides: Record<string, TaxType>): Security[] {
  return securities.map((s) => {
    if (s.taxTypeSource === 'share') return s;
    const amfi = file?.funds[s.isin];
    let out: Security = s;
    if (amfi) {
      const cl = classifyFund(amfi.c, amfi.n);
      out = { ...out, taxType: cl.taxType, listed: cl.listed, category: amfi.c, taxTypeSource: 'amfi' };
    }
    const repo = REPO_OVERRIDES.get(s.isin);
    if (repo) out = { ...out, taxType: repo.taxType, listed: repo.listed ?? out.listed, taxTypeSource: 'override' };
    const mine = userOverrides[s.isin];
    if (mine) out = { ...out, taxType: mine, taxTypeSource: 'user' };
    return out;
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
