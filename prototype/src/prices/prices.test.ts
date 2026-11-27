import { describe, expect, it } from 'vitest';
import { mergePriceFiles, parseAmfiFunds, parseAmfiNav, parseBhavcopy, parseShareNames } from './parse';
import { withFunds } from '../engine/market';

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
});


describe('share names file', () => {
  it('maps each company name and symbol to its ISIN, NSE first, plus former names', () => {
    const nse = [HEAD, row('INE009A01021', 'INFY', '1910.25'), row('INE00FF01025', 'ACUTAAS', '3900')].join('\n');
    const bse = [HEAD, row('INE009A01021', 'INFOSYS', '1910.00', 'BSE'), row('INE111A01011', 'BSEONLY', '10', 'BSE')].join('\n');
    const changes = 'SYMBOL,OLD NAME OF THE COMPANY,NEW NAME OF THE COMPANY,EFFECTIVE DATE\nACUTAAS,Ami Organics Limited,Acutaas Chemicals Limited,02-JUN-2025\nGONE,Old Co,New Co,01-JAN-2020';
    const r = parseShareNames([nse, bse], changes);
    expect(r.bySymbol).toMatchObject({ INFY: 'INE009A01021', ACUTAAS: 'INE00FF01025', BSEONLY: 'INE111A01011' });
    expect(r.byName).toMatchObject({ INFYLTD: 'INE009A01021', AMIORGANICSLIMITED: 'INE00FF01025', BSEONLYLTD: 'INE111A01011' });
    expect(r.byName).not.toHaveProperty('OLDCO'); // symbol no longer listed
  });
});

describe('share names: ambiguous names are left out', () => {
  const rowN = (isin: string, sym: string, name: string, src = 'NSE') =>
    `2026-11-13,2026-11-13,CM,${src},STK,1,${isin},${sym},EQ,,,,,${name},1,1,1,10,10,1,,10,,,1,1,1,F1,1,,,,,`;
  it('drops a name two securities share (a DVR or rights entitlement), partly-paid lines, and a former name now used by another company', () => {
    const nse = [HEAD,
      rowN('INE001A01011', 'ABC', 'ABC LIMITED'), rowN('INE001A01029', 'ABCDVR', 'ABC LIMITED'),
      rowN('INE155A01022', 'TMPV', 'TATA MOTORS PASSENGER VEHICLES LTD'), rowN('INE1TAE01010', 'TMCV', 'TATA MOTORS LIMITED'),
      rowN('IN9002A01024', 'XYZPP', 'XYZ PARTLY PAID'), rowN('INE777A01011', 'SOLO', 'SOLO INDUSTRIES LTD'),
    ].join('\n');
    const changes = 'SYMBOL,OLD NAME OF THE COMPANY,NEW NAME OF THE COMPANY,EFFECTIVE DATE\nTMPV,Tata Motors Limited,Tata Motors Passenger Vehicles Limited,14-OCT-2025';
    const r = parseShareNames([nse], changes);
    expect(r.byName).not.toHaveProperty('ABCLIMITED');
    expect(r.byName).not.toHaveProperty('TATAMOTORSLIMITED');
    expect(r.byName).not.toHaveProperty('XYZPARTLYPAID');
    expect(r.bySymbol).not.toHaveProperty('XYZPP');
    expect(r.byName).toMatchObject({ SOLOINDUSTRIESLTD: 'INE777A01011', TATAMOTORSPASSENGERVEHICLESLTD: 'INE155A01022' });
    expect(r.bySymbol).toMatchObject({ ABC: 'INE001A01011', ABCDVR: 'INE001A01029' });
  });
});
