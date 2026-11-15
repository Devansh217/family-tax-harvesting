import { describe, expect, it } from 'vitest';
import { classifyFund, KNOWN_AMFI_HEADINGS } from './categories';

describe('fund tax type from the AMFI category', () => {
  it('maps hybrid categories by tax treatment', () => {
    expect(classifyFund('Hybrid Scheme - Conservative Hybrid Fund', 'X Conservative Hybrid').taxType).toBe('slab');
    expect(classifyFund('Hybrid Schemes - Conservative Hybrid Fund', 'X Conservative Hybrid').taxType).toBe('slab');
    expect(classifyFund('Hybrid Scheme - Arbitrage Fund', 'X Arbitrage').taxType).toBe('equity');
    expect(classifyFund('Hybrid Schemes - Equity Savings Fund', 'X').taxType).toBe('equity');
    expect(classifyFund('Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage', 'X BAF').taxType).toBe('check');
    expect(classifyFund('Hybrid Schemes - Balanced Advantage Fund/ Dynamic Asset Allocation', 'X BAF').taxType).toBe('check');
    expect(classifyFund('Hybrid Scheme - Balanced Hybrid Fund', 'X').taxType).toBe('other_lt');
  });

  it('separates domestic equity index funds from the rest', () => {
    expect(classifyFund('Other Scheme - Index Funds', 'UTI Nifty 50 Index Fund').taxType).toBe('equity');
    expect(classifyFund('Index Funds - Equity Funds', 'UTI Nifty 50 Index Fund').taxType).toBe('equity');
    expect(classifyFund('Other Scheme - Index Funds', 'Motilal Oswal Nasdaq 100 Index').taxType).toBe('check');
    expect(classifyFund('Other Scheme - Gold ETF', 'Nippon Gold BeES')).toEqual({ taxType: 'other_lt', listed: true, returnClass: 'gold' });
    expect(classifyFund('Exchange Traded Funds (ETFs) - Gold ETF', 'Nippon Gold BeES')).toEqual({ taxType: 'other_lt', listed: true, returnClass: 'gold' });
    expect(classifyFund('Exchange Traded Funds (ETFs) - Equity ETF', 'Nippon Nifty BeES')).toEqual({ taxType: 'equity', listed: true, returnClass: 'equity' });
  });

  it('debt, overseas and equity headings in both of AMFI’s naming styles', () => {
    expect(classifyFund('Debt Scheme - Liquid Fund', 'X')).toEqual({ taxType: 'slab', listed: false, returnClass: 'debt' });
    expect(classifyFund('Income/Debt Oriented Schemes - Liquid Fund', 'X').taxType).toBe('slab');
    expect(classifyFund('Index Funds - Debt Funds', 'X Nifty SDL Index').taxType).toBe('slab');
    expect(classifyFund('Exchange Traded Funds (ETFs) - Debt ETF', 'Bharat Bond ETF')).toMatchObject({ taxType: 'slab', listed: true });
    expect(classifyFund('Other Scheme - FoF Overseas', 'X')).toEqual({ taxType: 'other_lt', listed: false, returnClass: 'international' });
    expect(classifyFund('Overseas Fund of Funds - Fund of Funds investing overseas', 'X').taxType).toBe('other_lt');
    expect(classifyFund('Equity Schemes - ELSS- Tax Saver Fund', 'X').taxType).toBe('equity');
    expect(classifyFund('Equity Scheme - ELSS', 'X').taxType).toBe('equity');
  });

  it('every known AMFI heading maps, and an unknown one is check', () => {
    expect(KNOWN_AMFI_HEADINGS.length).toBeGreaterThan(80);
    for (const h of KNOWN_AMFI_HEADINGS) expect(classifyFund(h, 'x').taxType).toMatch(/^(equity|slab|other_lt|check)$/);
    expect(classifyFund('Something New', 'x').taxType).toBe('check');
    expect(classifyFund('Close Ended Schemes', 'x').taxType).toBe('check');
  });
});
