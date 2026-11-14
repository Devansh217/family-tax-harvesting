import { QTY_SCALE, type Member, type Security } from './engine/types';
import type { AppState } from './store';

const rs = (n: number) => Math.round(n * 100);

/** A made-up family of five, matching the design canvas. Prices and fund ISINs are invented. */
export function sampleState(): AppState {
  const members: Member[] = [
    { id: 'a', name: 'Arjun', relation: 'self', age: 38, regime: 'new', otherIncome: rs(30_00_000) },
    { id: 'm', name: 'Meera', relation: 'spouse', age: 36, regime: 'new', otherIncome: rs(18_00_000) },
    { id: 'r', name: 'Ramesh', relation: 'parent', age: 64, regime: 'new', otherIncome: rs(4_60_000) },
    { id: 's', name: 'Sunita', relation: 'parent', age: 61, regime: 'new', otherIncome: rs(4_20_000) },
    { id: 'k', name: 'Kabir', relation: 'child_adult', age: 19, regime: 'new', otherIncome: 0 },
  ];
  const d = '2026-11-13';
  const securities: Security[] = [
    { isin: 'INE467B01029', name: 'TCS', kind: 'equity', price: rs(4450), priceDate: d },
    { isin: 'INE009A01021', name: 'Infosys', kind: 'equity', price: rs(3700), priceDate: d },
    { isin: 'INE040A01034', name: 'HDFC Bank', kind: 'equity', price: rs(2000), priceDate: d },
    { isin: 'INE154A01025', name: 'ITC', kind: 'equity', price: rs(610), priceDate: d, fmv2018: rs(270) },
    { isin: 'INE018A01030', name: 'Larsen & Toubro', kind: 'equity', price: rs(3700), priceDate: d },
    { isin: 'INF0SAMPLE01', name: 'Nifty 50 index fund (sample)', kind: 'equity_mf', price: rs(180), priceDate: d },
    { isin: 'INF0SAMPLE02', name: 'Flexi-cap fund (sample)', kind: 'equity_mf', price: rs(438), priceDate: d },
    { isin: 'INF0SAMPLE03', name: 'Large-cap fund (sample)', kind: 'equity_mf', price: rs(104), priceDate: d },
  ];
  let n = 0;
  const t = (memberId: string, isin: string, date: string, side: 'buy' | 'sell', units: number, price: number) => ({
    id: `sample${++n}`, memberId, isin, date, side, qty: Math.round(units * QTY_SCALE), amount: rs(units * price),
    source: 'Sample data', importId: 'sample',
  });
  const txns = [
    t('a', 'INE467B01029', '2021-06-10', 'buy', 60, 3200),
    t('a', 'INE009A01021', '2022-02-01', 'buy', 100, 1700),
    t('a', 'INE009A01021', '2026-07-15', 'sell', 100, 2800),
    t('a', 'INE040A01034', '2025-12-06', 'buy', 96, 1500),
    t('a', 'INE154A01025', '2019-03-01', 'buy', 2000, 280),
    t('a', 'INE018A01030', '2020-05-01', 'buy', 50, 900),
    t('m', 'INE009A01021', '2021-01-10', 'buy', 120, 1400),
    t('m', 'INE009A01021', '2026-05-20', 'sell', 20, 2400),
    t('r', 'INF0SAMPLE01', '2019-04-01', 'buy', 3625, 100),
    t('r', 'INE154A01025', '2018-06-01', 'buy', 300, 290),
    t('r', 'INF0SAMPLE03', '2021-01-01', 'buy', 1000, 50),
    t('r', 'INF0SAMPLE03', '2026-01-17', 'buy', 500, 60),
    t('r', 'INE040A01034', '2026-04-10', 'buy', 100, 1800),
    t('r', 'INE040A01034', '2026-08-20', 'sell', 100, 1924),
    t('s', 'INF0SAMPLE02', '2020-02-01', 'buy', 1000, 400),
  ];
  return {
    version: 1, isSample: true, members, securities, txns, positions: [], done: {}, plannedSales: [], needSoon: {}, history: [], brokerSummaries: [],
    imports: [{ id: 'sample', memberId: 'a', fileName: 'Sample family', format: 'Sample data', at: '2026-11-14T00:00:00Z', txns: txns.length, prices: securities.length, warnings: [] }],
  };
}
