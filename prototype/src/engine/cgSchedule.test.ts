import { describe, expect, it } from 'vitest';
import { cgSchedule, SALE_SECTIONS } from './cgSchedule';
import { computeFamily, type FamilyState } from './family';
import { inRange } from './dates';
import { summariseYear } from './tax';
import { FY_2026_27 as R } from './rules';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';
import { rupees2, scheduleCsv, scheduleFileName } from '../ui/csv';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
let seq = 0;
const tx = (memberId: string, isin: string, date: string, side: 'buy' | 'sell', units: number, priceRs: number, account?: string): Txn => ({
  id: `c${++seq}`, memberId, isin, date, side, qty: q(units), amount: rs(units * priceRs), source: 'test', ...(account ? { account } : {}),
});
const person = (id: string, over: Partial<Member> = {}): Member => ({
  id, name: id, relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: rs(20_00_000), from: 'manual' as const }], ...over,
});
const eq = (isin: string, over: Partial<Security> = {}): Security => ({ isin, name: isin, taxType: 'equity', listed: true, ...over });
const ASOF = '2026-11-14';

const run = (state: FamilyState) => computeFamily(state, ASOF, R);
/** The engine's own total: every in-year realised gain for the member (before exemption and set-off). */
const engineGain = (fam: ReturnType<typeof run>, id: string) =>
  fam.booked.filter((r) => r.memberId === id && r.taxType !== 'exempt' && inRange(r.sellDate, R.start, R.end)).reduce((a, r) => a + r.gain, 0);
const sum = (s: ReturnType<typeof cgSchedule>) => s.sections.filter((x) => SALE_SECTIONS.includes(x.key)).reduce((a, x) => a + x.total, 0);

const cases: Record<string, FamilyState> = {
  'golden: uses the exemption': {
    members: [person('a')], securities: [eq('A')],
    txns: [tx('a', 'A', '2024-01-01', 'buy', 1, 1_00_000), tx('a', 'A', '2026-06-01', 'sell', 1, 1_80_000)],
  },
  'golden: LTCG above 1.25 L': {
    members: [person('a')], securities: [eq('A')],
    txns: [tx('a', 'A', '2024-01-01', 'buy', 1, 1_00_000), tx('a', 'A', '2026-06-01', 'sell', 1, 3_25_000)],
  },
  'golden: st loss against lt gain': {
    members: [person('a')], securities: [eq('A'), eq('B')],
    txns: [tx('a', 'A', '2024-01-01', 'buy', 10, 1000), tx('a', 'A', '2026-06-01', 'sell', 10, 1500), tx('a', 'B', '2026-03-01', 'buy', 10, 1000), tx('a', 'B', '2026-07-01', 'sell', 10, 700)],
  },
  'golden: carried-forward loss': {
    members: [person('a', { carriedLoss: { st: 0, lt: rs(50_000) } })], securities: [eq('A')],
    txns: [tx('a', 'A', '2024-01-01', 'buy', 1, 1_00_000), tx('a', 'A', '2026-06-01', 'sell', 1, 3_00_000)],
  },
  'golden: sale outside the year is ignored': {
    members: [person('a')], securities: [eq('A')],
    txns: [tx('a', 'A', '2024-01-01', 'buy', 10, 100), tx('a', 'A', '2026-03-01', 'sell', 4, 200), tx('a', 'A', '2026-08-01', 'sell', 4, 220)],
  },
  'golden: intraday and F&O': {
    members: [person('a', { business: { intraday: rs(5000), fno: rs(-2000) } })], securities: [eq('A')],
    txns: [tx('a', 'A', '2024-01-10', 'buy', 10, 100), tx('a', 'A', '2026-07-01', 'sell', 10, 300)],
  },
  'hand-built 1: grandfathered shares sold in two lots, two accounts': {
    members: [person('a'), person('b', { relation: 'spouse' })], securities: [eq('G', { fmv2018: rs(500) })],
    txns: [
      tx('a', 'G', '2015-05-01', 'buy', 100, 300, 'zerodha'), tx('a', 'G', '2020-05-01', 'buy', 100, 800, 'zerodha'),
      tx('a', 'G', '2026-06-10', 'sell', 150, 900, 'zerodha'), tx('b', 'G', '2016-01-01', 'buy', 50, 200), tx('b', 'G', '2026-06-10', 'sell', 20, 900),
    ],
  },
  'hand-built 2: every tax type, with a broker adjustment': {
    members: [person('a')],
    securities: [
      eq('E'), eq('D', { name: 'Debt, "Short" Fund', taxType: 'slab', listed: false }), eq('GLD', { taxType: 'other_lt', listed: false }),
      eq('CHK', { taxType: 'check', listed: false }),
    ],
    txns: [
      tx('a', 'E', '2025-01-01', 'buy', 100, 100), tx('a', 'E', '2026-05-10', 'sell', 100, 150),
      tx('a', 'D', '2026-05-01', 'buy', 100, 10), tx('a', 'D', '2026-09-01', 'sell', 100, 12),
      tx('a', 'GLD', '2024-01-01', 'buy', 10, 100), tx('a', 'GLD', '2026-09-02', 'sell', 10, 140),
      tx('a', 'CHK', '2025-01-01', 'buy', 10, 100), tx('a', 'CHK', '2026-09-03', 'sell', 10, 90),
    ],
    brokerSummaries: [{ memberId: 'a', account: '', summary: { broker: 'Zerodha', from: R.start, to: R.end, equityShortTerm: rs(7000), equityLongTerm: null, mfShortTerm: null, mfLongTerm: null } }],
  },
};

describe('cgSchedule totals', () => {
  for (const [name, state] of Object.entries(cases)) {
    it(`sections add up to the engine's realised gains: ${name}`, () => {
      const fam = run(state);
      for (const m of state.members) expect(sum(cgSchedule(fam, m.id))).toBe(engineGain(fam, m.id));
      for (const m of state.members) expect(cgSchedule(fam, m.id).totalGain).toBe(engineGain(fam, m.id));
    });
  }
});

const BUCKET = { equity_lt: 'equityLt', equity_st: 'equitySt', other_lt: 'otherLt' } as const;

describe('cgSchedule against summariseYear', () => {
  const withExempt: FamilyState = {
    members: [person('a', { carriedLoss: { st: rs(3000), lt: rs(10_000) }, business: { intraday: 0, fno: rs(-4000) } })],
    securities: [...cases['hand-built 2: every tax type, with a broker adjustment']!.securities, eq('PPF', { taxType: 'exempt', listed: false })],
    txns: [...cases['hand-built 2: every tax type, with a broker adjustment']!.txns, tx('a', 'PPF', '2020-01-01', 'buy', 10, 100), tx('a', 'PPF', '2026-09-05', 'sell', 10, 180)],
    brokerSummaries: cases['hand-built 2: every tax type, with a broker adjustment']!.brokerSummaries,
  };
  for (const [name, state] of [...Object.entries(cases), ['with an exempt sale, losses brought forward and an F&O loss', withExempt] as const]) {
    it(`sale totals, after-set-off figures and the F&O line match the year summary: ${name}`, () => {
      const fam = run(state);
      for (const m of state.members) {
        const v = fam.members.find((x) => x.member.id === m.id)!;
        const y = summariseYear(v.member, fam.booked, R, v.business);
        const s = cgSchedule(fam, m.id);
        const exempt = s.exemptGain;
        expect(s.totalGain + exempt).toBe(y.stGains - y.stLosses + y.ltGains - y.ltLosses);
        for (const sec of s.sections.filter((x) => x.rows.length > 0 && x.key in BUCKET)) {
          expect(sec.afterSetOff).toBe(y.buckets[BUCKET[sec.key as keyof typeof BUCKET]]);
        }
        const slabish = s.sections.filter((x) => (x.key === 'slab' || x.key === 'check') && x.afterSetOff != null);
        if (s.sections.some((x) => (x.key === 'slab' || x.key === 'check') && x.rows.length > 0)) {
          expect(slabish).toHaveLength(1);
          expect(slabish[0]!.afterSetOff).toBe(y.buckets.slab);
        }
        const fno = s.sections.find((x) => x.key === 'business')!.rows.find((r) => r.name.startsWith('F&O loss set off'));
        expect(fno?.gain ?? 0).toBe(0 - y.business.setOffAgainstGains || 0);
      }
    });
  }

  it('notes exempt sales, which are not listed', () => {
    const fam = run(withExempt);
    const s = cgSchedule(fam, 'a');
    expect(s.exemptGain).toBe(rs(800));
    expect(s.sections.flatMap((x) => x.rows).some((r) => r.isin === 'PPF')).toBe(false);
    expect(scheduleCsv(s)).toContain('Exempt sales are not listed here');
    expect(scheduleCsv(cgSchedule(run(cases['golden: uses the exemption']!), 'a'))).not.toContain('Exempt sales');
  });

  it("the F&O set-off line and the after-set-off figures are in the CSV, with a total per sale section", () => {
    const fam = run(withExempt);
    const csv = scheduleCsv(cgSchedule(fam, 'a'));
    const lines = csv.split('\r\n');
    expect(lines.some((l) => l.startsWith("Intraday and F&O (from your broker's report),,F&O loss set off against capital gains,"))).toBe(true);
    const st = cgSchedule(fam, 'a').sections.find((x) => x.key === 'equity_st')!;
    expect(lines).toContain(`Equity short-term (111A),,Total,,,,,,${rupees2(st.total)}`);
    expect(lines).toContain(`Equity short-term (111A),,After set-off (what the tax uses),,,,,,${rupees2(st.afterSetOff!)}`);
    expect(lines.filter((l) => l.includes(',Total,'))).toHaveLength(cgSchedule(fam, 'a').sections.filter((x) => x.rows.length > 0 && SALE_SECTIONS.includes(x.key)).length);
  });
});

describe('cgSchedule rows', () => {
  const fam = run(cases['hand-built 1: grandfathered shares sold in two lots, two accounts']!);

  it('merges lot-level sales of one sale into one row, with the 31 Jan 2018 value on grandfathered units', () => {
    const lt = cgSchedule(fam, 'a').sections.find((s) => s.key === 'equity_lt')!;
    expect(lt.rows).toHaveLength(1);
    expect(lt.rows[0]).toMatchObject({ isin: 'G', name: 'G', units: q(150), saleDate: '2026-06-10', saleValue: rs(135_000) });
    // only the 100 units bought in 2015 are grandfathered: 100 x ₹500
    expect(lt.rows[0]!.fmv2018).toBe(rs(50_000));
    expect(lt.rows[0]!.cost).toBe(rs(50_000 + 40_000));
  });

  it("gates the 31 Jan 2018 value on the sale's own tax type, not the security's", () => {
    const securities = new Map(fam.securities);
    securities.set('G', { ...securities.get('G')!, taxType: 'check' });
    const lt = cgSchedule({ ...fam, securities }, 'a').sections.find((s) => s.key === 'equity_lt')!;
    expect(lt.rows[0]!.fmv2018).toBe(rs(50_000));
  });

  it('leaves fmv2018 off rows that were not grandfathered', () => {
    const f = run(cases['golden: uses the exemption']!);
    expect(cgSchedule(f, 'a').sections.find((s) => s.key === 'equity_lt')!.rows[0]).not.toHaveProperty('fmv2018');
  });

  it('sorts by sale date then ISIN and keeps sales outside the year out', () => {
    const f = run({
      members: [person('a')], securities: [eq('B'), eq('A')],
      txns: [tx('a', 'A', '2024-01-01', 'buy', 10, 100), tx('a', 'B', '2024-01-01', 'buy', 10, 100),
        tx('a', 'B', '2026-05-01', 'sell', 1, 150), tx('a', 'A', '2026-06-01', 'sell', 1, 150), tx('a', 'A', '2026-05-01', 'sell', 1, 150), tx('a', 'A', '2026-02-01', 'sell', 1, 150)],
    });
    const rows = cgSchedule(f, 'a').sections.find((s) => s.key === 'equity_lt')!.rows;
    expect(rows.map((r) => `${r.saleDate} ${r.isin}`)).toEqual(['2026-05-01 A', '2026-05-01 B', '2026-06-01 A']);
  });

  it('puts unknown tax types in their own section, and short-term other-long-term gains in slab', () => {
    const f = run(cases['hand-built 2: every tax type, with a broker adjustment']!);
    const s = cgSchedule(f, 'a');
    const by = (k: string) => s.sections.find((x) => x.key === k)!;
    expect(by('check').rows.map((r) => r.isin)).toEqual(['CHK']);
    expect(by('check').title).toBe('Needs checking (tax type unknown)');
    expect(by('other_lt').rows.map((r) => r.isin)).toEqual(['GLD']);
    expect(by('slab').rows.map((r) => r.isin)).toEqual(['D']);
    expect(by('equity_st').rows.length).toBeGreaterThan(0);
  });

  it('shows losses and business lines as information, outside the total', () => {
    const f = run(cases['golden: intraday and F&O']!);
    const s = cgSchedule(f, 'a');
    const biz = s.sections.find((x) => x.key === 'business')!;
    expect(biz.rows.map((r) => r.gain)).toEqual([rs(5000), rs(-2000)]);
    const g = run(cases['golden: carried-forward loss']!);
    expect(cgSchedule(g, 'a').sections.find((x) => x.key === 'set_off')!.rows[0]).toMatchObject({ gain: -rs(50_000) });
  });

  it('is empty for a member with no sales', () => {
    const f = run({ members: [person('a')], securities: [eq('A')], txns: [tx('a', 'A', '2024-01-01', 'buy', 1, 100)] });
    const s = cgSchedule(f, 'a');
    expect(s.totalGain).toBe(0);
    expect(s.sections.every((x) => x.rows.length === 0)).toBe(true);
  });
});

describe('scheduleCsv', () => {
  const fam = run(cases['hand-built 2: every tax type, with a broker adjustment']!);
  const csv = scheduleCsv(cgSchedule(fam, 'a'));
  const lines = csv.split('\r\n');

  it('starts with the header and uses CRLF line ends', () => {
    expect(lines[0]).toBe('Section,ISIN,Name,Units,Sale date,Sale value (₹),Cost for tax (₹),31 Jan 2018 value (₹),Gain (₹)');
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('writes plain rupees with 2 decimals and quotes names with commas or quotes', () => {
    expect(lines).toContain('Slab-taxed gains (debt and specified funds),D,"Debt, ""Short"" Fund",100,2026-09-01,1200.00,1000.00,,200.00');
    expect(lines).toContain('Equity short-term (111A),,"Broker figure: Shares, short-term",,,,,,7000.00');
  });

  it('keeps spreadsheets from running text as a formula', () => {
    const f = run({ members: [person('a')], securities: [eq('F', { name: '=HYPERLINK("x")' }), eq('P', { name: '+cmd' }), eq('M', { name: '-1' }), eq('T', { name: '@SUM' })],
      txns: ['F', 'P', 'M', 'T'].flatMap((i) => [tx('a', i, '2024-01-01', 'buy', 1, 100), tx('a', i, '2026-06-01', 'sell', 1, 200)]) });
    const out = scheduleCsv(cgSchedule(f, 'a'));
    expect(out).toContain(",\"'=HYPERLINK(\"\"x\"\")\",");
    for (const n of ["'+cmd", "'-1", "'@SUM"]) expect(out).toContain(`,${n},`);
    expect(out).not.toMatch(/,[=+@]/);
  });

  it('retitles the loss section to what it shows', () => {
    expect(cgSchedule(fam, 'a').sections.find((x) => x.key === 'set_off')!.title).toBe('Losses brought forward and carried forward');
  });

  it('formats units, negatives and the file name', () => {
    expect(rupees2(-5)).toBe('-0.05');
    expect(rupees2(123456789)).toBe('1234567.89');
    expect(scheduleFileName('Priya Sharma-Rao')).toBe('capital-gains-priya-sharma-rao-2026-27.csv');
    const f = run({ members: [person('a')], securities: [{ ...eq('MF'), listed: false }], txns: [tx('a', 'MF', '2024-01-01', 'buy', 10.5, 100), tx('a', 'MF', '2026-06-01', 'sell', 10.123, 150)] });
    expect(scheduleCsv(cgSchedule(f, 'a'))).toContain(',10.123,');
  });
});
