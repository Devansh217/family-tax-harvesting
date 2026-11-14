import { describe, expect, it } from 'vitest';
import { mergePriceFiles, parseAmfiNav, parseBhavcopy } from './parse';

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
});
