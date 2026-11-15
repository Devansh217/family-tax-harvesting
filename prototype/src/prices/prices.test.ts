import { describe, expect, it } from 'vitest';
import { mergePriceFiles, parseAmfiFunds, parseAmfiNav, parseBhavcopy } from './parse';
import { securitiesForCompare, withFunds } from '../ui/market';

const HEAD = 'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4';
const row = (isin: string, sym: string, close: string, src = 'NSE') =>
  `2026-11-13,2026-11-13,CM,${src},STK,1,${isin},${sym},EQ,,,,,${sym} LTD,1,1,1,${close},${close},1,,${close},,,1,1,1,F1,1,,,,,`;

describe('price files', () => {
  it('reads closing prices from an NSE or BSE bhavcopy', () => {
    const r = parseBhavcopy([HEAD, row('INE009A01021', 'INFY', '1910.25'), row('INE040A01034', 'HDFCBANK', '1650.00')].join('\n'));
    expect(r.date).toBe('2026-11-13');
    expect(r.prices.get('INE009A01021')).toBe(1910_25);
    expect(r.prices.size).toBe(2);
  });

  it('reads fund NAVs from AMFI NAVAll, both ISIN columns', () => {
    const text = [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      ' ',
      'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
      '122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;94.2594;13-Nov-2026',
      '135763;INF846K01WS2;INF846K01WQ6;Axis Children’s Fund;Direct Plan;IDCW Option;28.6857;13-Nov-2026',
      '999999;INF000000000;-;Closed fund;Direct Plan;Growth;N.A.;13-Nov-2026',
    ].join('\n');
    const r = parseAmfiNav(text);
    expect(r.date).toBe('2026-11-13');
    expect(r.prices.get('INF879O01027')).toBe(94_26);
    expect(r.prices.get('INF846K01WQ6')).toBe(28_69);
    expect(r.prices.has('INF000000000')).toBe(false);
  });

  it('prefers NSE, fills gaps from BSE and adds NAVs', () => {
    const nse = parseBhavcopy([HEAD, row('INE009A01021', 'INFY', '1910.25')].join('\n'));
    const bse = parseBhavcopy([HEAD, row('INE009A01021', 'INFY', '1911.00', 'BSE'), row('INE117A01022', 'ABB', '7045.00', 'BSE')].join('\n'));
    const merged = mergePriceFiles([nse, bse, null])!;
    expect(merged.prices).toEqual({ INE009A01021: 1910_25, INE117A01022: 7045_00 });
    expect(merged.source).toBe('NSE, BSE');
  });

  it('reads each fund’s AMFI category heading, both ISIN columns', () => {
    const text = [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      ' ',
      'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
      ' ',
      'PPFAS Mutual Fund',
      '122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;94.2594;13-Nov-2026',
      'Open Ended Schemes(Hybrid Schemes - Conservative Hybrid Fund)',
      'IL&FS Mutual Fund (IDF)',
      '135763;INF846K01WS2;INF846K01WQ6;X Conservative Hybrid;Direct Plan;IDCW Option;28.6857;13-Nov-2026',
    ].join('\n');
    const f = parseAmfiFunds(text);
    expect(f['INF879O01027']).toEqual({ n: 'Parag Parikh Flexi Cap Fund', c: 'Equity Scheme - Flexi Cap Fund' });
    expect(f['INF846K01WS2']?.c).toBe('Hybrid Schemes - Conservative Hybrid Fund');
    expect(f['INF846K01WQ6']?.c).toBe('Hybrid Schemes - Conservative Hybrid Fund');
  });

  it('a missing funds file leaves funds as check and never throws', () => {
    const fund = { isin: 'INF879O01027', name: 'X', taxType: 'check' as const, listed: false };
    expect(withFunds([fund], null, {})).toEqual([fund]);
  });

  it('funds take their tax type from AMFI, the override list, then the user, and shares are untouched', () => {
    const file = { date: '2026-11-13', funds: { INF1: { n: 'Liquid', c: 'Debt Scheme - Liquid Fund' }, INF2: { n: 'Flexi', c: 'Equity Scheme - Flexi Cap Fund' } } };
    const secs = [
      { isin: 'INF1', name: 'Liquid', taxType: 'check' as const, listed: false },
      { isin: 'INF2', name: 'Flexi', taxType: 'check' as const, listed: false },
      { isin: 'INE1', name: 'Share', taxType: 'equity' as const, listed: true, taxTypeSource: 'share' as const },
    ];
    const out = withFunds(secs, file, { INF2: 'slab' });
    expect(out[0]).toMatchObject({ taxType: 'slab', taxTypeSource: 'amfi', category: 'Debt Scheme - Liquid Fund' });
    expect(out[1]).toMatchObject({ taxType: 'slab', taxTypeSource: 'user' });
    expect(out[2]).toEqual(secs[2]);
  });

  it('review: Compare sees classified holdings and funds the family does not hold', () => {
    const file = { date: '2026-11-13', funds: { INF9: { n: 'Liquid X', c: 'Debt Scheme - Liquid Fund' } } };
    const held = [{ isin: 'INF2', name: 'Flexi', taxType: 'equity' as const, listed: false, taxTypeSource: 'amfi' as const }];
    const out = securitiesForCompare(held, file, 'INF9');
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ isin: 'INF9', taxType: 'slab', category: 'Debt Scheme - Liquid Fund' });
    expect(securitiesForCompare(held, file, 'INF2')).toEqual(held);
  });
});

