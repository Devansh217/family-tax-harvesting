import { describe, expect, it } from 'vitest';
import { activeSips, guessSips, type ConfirmedSip, type SipGuess } from './sips';
import type { Security, Txn } from './types';

const fund: Security = { isin: 'INF000TEST01', name: 'Test Flexi Fund', taxType: 'equity', listed: false };
const share: Security = { isin: 'INE000TEST01', name: 'Test Share Ltd', taxType: 'equity', listed: true };
let n = 0;
const buy = (isin: string, date: string, rupees: number, memberId = 'm1'): Txn => ({
  id: `t${++n}`, memberId, isin, date, side: 'buy', qty: 10_0000, amount: rupees * 100, source: 'test', account: 'F1',
});
const ASOF = '2026-11-24';

describe('guessSips', () => {
  it('finds a fund bought on a steady day for a steady amount', () => {
    const txns = [buy(fund.isin, '2026-08-01', 10_000), buy(fund.isin, '2026-09-02', 9_500), buy(fund.isin, '2026-10-03', 10_000), buy(fund.isin, '2026-11-02', 10_500)];
    const g = guessSips(txns, [fund], ASOF);
    expect(g).toEqual([{ memberId: 'm1', isin: fund.isin, name: 'Test Flexi Fund', account: 'F1', monthly: 10_000_00, day: 2, months: 4 }]);
  });

  it('needs 3 of the last 4 months', () => {
    expect(guessSips([buy(fund.isin, '2026-09-02', 10_000), buy(fund.isin, '2026-11-02', 10_000)], [fund], ASOF)).toEqual([]);
  });

  it('ignores one-off top-ups and listed shares', () => {
    const txns = [
      ...['2026-08-02', '2026-09-02', '2026-10-02', '2026-11-02'].map((d) => buy(share.isin, d, 10_000)),
      ...['2026-08-02', '2026-09-02', '2026-10-02', '2026-11-02'].map((d) => buy(fund.isin, d, 10_000)),
      buy(fund.isin, '2026-10-15', 50_000),
    ];
    const g = guessSips(txns, [fund, share], ASOF);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ isin: fund.isin, monthly: 10_000_00, months: 4 });
  });

  it('ignores a stopped SIP', () => {
    const txns = ['2026-04-02', '2026-05-02', '2026-06-02', '2026-07-02'].map((d) => buy(fund.isin, d, 10_000));
    expect(guessSips(txns, [fund], ASOF)).toEqual([]);
  });
});

describe('activeSips', () => {
  it('keeps the latest confirmation and drops stopped ones', () => {
    const c = (memberId: string, isin: string, monthly: number, confirmedAt: string): ConfirmedSip => ({ memberId, isin, monthly, confirmedAt });
    const confirmed = [
      c('m1', 'INF1', 5_000_00, '2026-10-01'), c('m1', 'INF1', 8_000_00, '2026-11-01'),
      c('m1', 'INF2', 3_000_00, '2026-09-01'), c('m1', 'INF2', 0, '2026-11-05'),
    ];
    expect(activeSips([] as SipGuess[], confirmed)).toEqual([c('m1', 'INF1', 8_000_00, '2026-11-01')]);
  });
});
