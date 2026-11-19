import { classifyFund } from './categories';
import overridesFile from './fund-overrides.json';
import type { ISODate, Paise, Security, TaxType } from './types';

// Shared by the browser and the server's season emails, so both classify funds and price holdings the same way.
export interface PriceFile { date: ISODate; source: string; prices: Record<string, Paise> }
export interface FundsFile { date: ISODate; funds: Record<string, { n: string; c: string }> }

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
