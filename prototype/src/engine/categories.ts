import type { TaxType } from './types';

/**
 * Tax type of a mutual fund or ETF from its SEBI category, as AMFI prints it in NAVAll.txt (the bracketed heading,
 * e.g. "Hybrid Scheme - Conservative Hybrid Fund"). Data, not logic: when SEBI or the Act changes a category, change
 * the rules below and the test. Anything unrecognised is `check`, shown to the family as "check how this is taxed".
 * Sources: docs/research/2026-11-15-family-financial-planning.md §3.9, 2026-11-15-product-universe.md §4.
 *
 * Fund-specific corrections live in fund-overrides.json:
 *   { isin: string; taxType: TaxType; listed?: boolean; reason: string; date: ISODate }[]
 */
export type ReturnClass = 'equity' | 'debt' | 'conservative_hybrid' | 'balanced' | 'gold' | 'international' | 'fd' | 'ppf';

export interface Classification { taxType: TaxType; listed: boolean; returnClass: ReturnClass | null }

const c = (taxType: TaxType, listed: boolean, returnClass: ReturnClass | null): Classification => ({ taxType, listed, returnClass });

/** Index funds and ETFs that track Indian equity indices, by name; anything foreign, debt or commodity is excluded. */
const DOMESTIC_EQUITY = /nifty|sensex|bse/i;
const NOT_DOMESTIC_EQUITY = /gold|silver|gilt|g-sec|gsec|sdl|bond|psu|crisil|nasdaq|s&p|hang seng|us |global|international|liquid|money market|bharat bond/i;
const domesticEquity = (name: string) => DOMESTIC_EQUITY.test(name) && !NOT_DOMESTIC_EQUITY.test(name);

/** Rules in order; the first whose pattern matches the heading wins. */
const RULES: Array<[RegExp, (name: string) => Classification]> = [
  // Hybrids first: their headings also contain words like "Equity".
  [/Conservative Hybrid/i, () => c('slab', false, 'conservative_hybrid')],
  [/Balanced Hybrid/i, () => c('other_lt', false, 'balanced')],
  [/Aggressive Hybrid|Arbitrage|Equity Savings/i, () => c('equity', false, 'equity')],
  [/Dynamic Asset Allocation|Balanced Advantage|Multi Asset/i, () => c('check', false, 'balanced')],
  // ETFs (listed).
  [/ETFs?\)? - Gold ETF|Gold ETF/i, () => c('other_lt', true, 'gold')],
  [/Silver ETF/i, () => c('other_lt', true, null)],
  [/ETFs investing overseas/i, () => c('other_lt', true, 'international')],
  [/Debt ETF/i, () => c('slab', true, 'debt')],
  [/Hybrid ETF/i, () => c('check', true, null)],
  [/Equity ETF|Other\s+ETFs?/i, (n) => (domesticEquity(n) ? c('equity', true, 'equity') : c('check', true, null))],
  // Index funds (unlisted).
  [/Index Funds - Debt/i, () => c('slab', false, 'debt')],
  [/Index Funds - Hybrid/i, () => c('check', false, null)],
  [/Index Funds/i, (n) => (domesticEquity(n) ? c('equity', false, 'equity') : c('check', false, null))],
  // Fund of funds.
  [/FoF Overseas|Overseas Fund of Funds|investing overseas/i, () => c('other_lt', false, 'international')],
  [/FoF Domestic|Fund of Funds Scheme \(Domestic\)/i, () => c('check', false, null)],
  // Plain categories.
  [/Debt Scheme|Income\/Debt Oriented/i, () => c('slab', false, 'debt')],
  [/Equity Schemes? -|^ELSS$/i, () => c('equity', false, 'equity')],
];

export function classifyFund(category: string, schemeName: string): Classification {
  for (const [re, f] of RULES) if (re.test(category)) return f(schemeName);
  return c('check', false, null);
}

/** Every category heading in AMFI's NAVAll.txt of 13 Nov 2026. A heading not here is new: add it and its rule. */
export const KNOWN_AMFI_HEADINGS: string[] = [
  "ELSS",
  "Growth",
  "Income",
  "Income/Debt Oriented Schemes - Fixed Term Plan",
  "Income/Debt Oriented Schemes - Other Debt Scheme",
  "Income",
  "Children’s Fund - Childrens' Fund",
  "Debt Scheme - Banking and PSU Fund",
  "Debt Scheme - Corporate Bond Fund",
  "Debt Scheme - Credit Risk Fund",
  "Debt Scheme - Dynamic Bond",
  "Debt Scheme - Gilt Fund",
  "Debt Scheme - Liquid Fund",
  "Debt Scheme - Long Duration Fund",
  "Debt Scheme - Low Duration Fund",
  "Debt Scheme - Medium Duration Fund",
  "Debt Scheme - Medium to Long Duration Fund",
  "Debt Scheme - Money Market Fund",
  "Debt Scheme - Overnight Fund",
  "Debt Scheme - Short Duration Fund",
  "Debt Scheme - Ultra Short Duration Fund",
  "Equity Scheme - Contra Fund",
  "Equity Scheme - Dividend Yield Fund",
  "Equity Scheme - ELSS",
  "Equity Scheme - Flexi Cap Fund",
  "Equity Scheme - Focused Fund",
  "Equity Scheme - Large & Mid Cap Fund",
  "Equity Scheme - Large Cap Fund",
  "Equity Scheme - Mid Cap Fund",
  "Equity Scheme - Multi Cap Fund",
  "Equity Scheme - Sectoral/ Thematic",
  "Equity Scheme - Small Cap Fund",
  "Equity Scheme - Value Fund",
  "Equity Schemes - Contra Fund",
  "Equity Schemes - Dividend Yield Fund",
  "Equity Schemes - ELSS- Tax Saver Fund",
  "Equity Schemes - Flexi Cap Fund",
  "Equity Schemes - Focused Fund",
  "Equity Schemes - Large & Mid Cap Fund",
  "Equity Schemes - Large Cap Fund",
  "Equity Schemes - Mid Cap Fund",
  "Equity Schemes - Multi Cap Fund",
  "Equity Schemes - Sectoral Fund",
  "Equity Schemes - Small Cap Fund",
  "Equity Schemes - Thematic Fund",
  "Equity Schemes - Value Fund",
  "Exchange Traded Funds (ETFs) - Debt ETF",
  "Exchange Traded Funds (ETFs) - ETFs investing overseas",
  "Exchange Traded Funds (ETFs) - Equity ETF",
  "Exchange Traded Funds (ETFs) - Gold ETF",
  "Exchange Traded Funds (ETFs) - Hybrid ETF",
  "Exchange Traded Funds (ETFs) - Other ETF",
  "Exchange Traded Funds (ETFs) - Silver ETF",
  "Fund of Funds Scheme (Domestic) - Fund of Funds Scheme (Domestic)",
  "Gilt",
  "Growth",
  "Hybrid Scheme - Aggressive Hybrid Fund",
  "Hybrid Scheme - Arbitrage Fund",
  "Hybrid Scheme - Balanced Hybrid Fund",
  "Hybrid Scheme - Conservative Hybrid Fund",
  "Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage",
  "Hybrid Scheme - Equity Savings",
  "Hybrid Scheme - Multi Asset Allocation",
  "Hybrid Schemes - Aggressive Hybrid Fund",
  "Hybrid Schemes - Arbitrage Fund",
  "Hybrid Schemes - Balanced Advantage Fund/ Dynamic Asset Allocation",
  "Hybrid Schemes - Balanced Hybrid Fund",
  "Hybrid Schemes - Conservative Hybrid Fund",
  "Hybrid Schemes - Equity Savings Fund",
  "Hybrid Schemes - Multi Asset Allocation Fund",
  "Income",
  "Income/Debt Oriented Schemes - 10-year Constant Maturity Gilt Fund",
  "Income/Debt Oriented Schemes - Banking and PSU Debt Fund",
  "Income/Debt Oriented Schemes - Corporate Bond Fund",
  "Income/Debt Oriented Schemes - Credit Risk Fund",
  "Income/Debt Oriented Schemes - Dynamic Term Fund",
  "Income/Debt Oriented Schemes - Floating Interest Rates Fund",
  "Income/Debt Oriented Schemes - Gilt Fund",
  "Income/Debt Oriented Schemes - Liquid Fund",
  "Income/Debt Oriented Schemes - Long Term Fund",
  "Income/Debt Oriented Schemes - Medium Term Fund",
  "Income/Debt Oriented Schemes - Medium to Long Term Fund",
  "Income/Debt Oriented Schemes - Money Market Fund",
  "Income/Debt Oriented Schemes - Overnight Fund",
  "Income/Debt Oriented Schemes - Sectoral Fund",
  "Income/Debt Oriented Schemes - Short Term Fund",
  "Income/Debt Oriented Schemes - Ultra Short Term Fund",
  "Income/Debt Oriented Schemes - Ultra Short to Short Term Fund",
  "Index Funds - Debt Funds",
  "Index Funds - Equity Funds",
  "Index Funds - Hybrid Fund",
  "Life Cycle Funds - Life Cycle Fund with Maturity of 10 Years",
  "Life Cycle Funds - Life Cycle Fund with Maturity of 15 Years",
  "Life Cycle Funds - Life Cycle Fund with Maturity of 30 Years",
  "Life Cycle Funds - Life Cycle Fund with Maturity of 5 Years",
  "Other Scheme - FoF Domestic",
  "Other Scheme - FoF Overseas",
  "Other Scheme - Gold ETF",
  "Other Scheme - Index Funds",
  "Other Scheme - Other  ETFs",
  "Overseas Fund of Funds - Fund of Funds investing overseas",
  "Solution Oriented Scheme - Children’s Fund",
  "Solution Oriented Scheme - Retirement Fund",
  "Solution Oriented Schemes ** - Retirement Fund"
];
