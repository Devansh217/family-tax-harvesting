import { useMemo, useState } from 'react';
import { KNOWN_AMFI_HEADINGS, classifyFund } from '../../engine/categories';
import { ASSUMPTIONS_REVIEWED, type Scenario } from '../../engine/marketAssumptions';
import { bringsHome, nominalReturn, type BringsHomeResult, type Product } from '../../engine/planner';
import { slabRate } from '../../engine/rules';
import { useApp } from '../app-context';
import { dateLabel, inr, inrShort } from '../format';
import { groupCategories } from '../categoryGroups';
import { securitiesForCompare } from '../market';
import { Avatar, Disclaimer } from '../parts';

type Kind = Product['kind'];
interface Pick { kind: Kind; isin: string; category: string; label: string }

const SCENARIOS: Array<[Scenario, string]> = [['conservative', 'Cautious'], ['base', 'Base'], ['optimistic', 'Optimistic']];
const CATEGORIES = [...new Set(KNOWN_AMFI_HEADINGS)].filter((h) => classifyFund(h, '').taxType !== 'check').sort();
const CATEGORY_GROUPS = groupCategories(CATEGORIES);
const KINDS: Array<[Kind, string]> = [['fund', 'A fund'], ['category', 'Fund category'], ['fd', 'Fixed deposit'], ['ppf', 'PPF'], ['gold_etf', 'Gold ETF']];
const TYPE_LABEL: Record<string, string> = { equity: 'Equity', slab: 'Slab rate', other_lt: 'Long-term 12.5%', interest: 'Interest, yearly', exempt: 'Tax-free' };

const toProduct = (p: Pick): Product | null =>
  p.kind === 'fund' ? (p.isin ? { kind: 'fund', isin: p.isin } : null) : p.kind === 'category' ? { kind: 'category', category: p.category } : { kind: p.kind } as Product;

/** Picks what to compare: a fund by name (from AMFI's list and the family's own holdings), a category, or a product. */
function ProductPicker({ value, onChange, id }: { value: Pick; onChange: (p: Pick) => void; id: string }) {
  const { market, state } = useApp();
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    if (q.trim().length < 3) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const own = state.securities.filter((s) => s.isin.startsWith('INF')).map((s) => [s.isin, s.name] as const);
    const all = [...own, ...Object.entries(market.funds?.funds ?? {}).map(([isin, f]) => [isin, f.n] as const)];
    const seen = new Set<string>();
    return all.filter(([isin, n]) => !seen.has(isin) && seen.add(isin) && words.every((w) => n.toLowerCase().includes(w))).slice(0, 20);
  }, [q, market.funds, state.securities]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="seg-ctl" role="group" aria-label="What to compare">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={value.kind === k} onClick={() => onChange({ ...value, kind: k, label })}>{label}</button>
        ))}
      </div>
      {value.kind === 'fund' && (
        <>
          <label className="field" htmlFor={`${id}-q`}>Fund name (3 letters or more)
            <input id={`${id}-q`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. conservative hybrid" autoComplete="off" />
          </label>
          {value.isin && <p className="small">Comparing <strong>{value.label}</strong></p>}
          {matches.length > 0 && (
            <div className="sheet" role="listbox" aria-label="Matching funds" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {matches.map(([isin, n]) => (
                <button key={isin} type="button" role="option" aria-selected={value.isin === isin} className="li btn ghost block" style={{ justifyContent: 'flex-start', color: 'var(--ink)', whiteSpace: 'normal', textAlign: 'left' }}
                  onClick={() => { onChange({ ...value, isin, label: n }); setQ(''); }}>{n}</button>
              ))}
            </div>
          )}
        </>
      )}
      {value.kind === 'category' && (
        <label className="field" htmlFor={`${id}-cat`}>Category
          <select id={`${id}-cat`} value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value, label: e.target.value })}>
            {CATEGORY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

const GIFT_TEXT = 'A gift becomes theirs for good: it counts as their income, can be spent by them, and passes by their will or nominee, not yours. Move it by bank transfer from the giver to the receiver, invest it in their own name, and keep a signed gift letter.';

export function Compare() {
  const { fam, state, asOf, indexOf, nameOf, market } = useApp();
  const members = state.members;
  const self = members.find((m) => m.relation === 'self') ?? members[0];
  const [a, setA] = useState<Pick>({ kind: 'category', isin: '', category: 'Hybrid Scheme - Conservative Hybrid Fund', label: 'Fund category' });
  const [b, setB] = useState<Pick | null>(null);
  const [amountText, setAmountText] = useState('500000');
  const [yearsText, setYearsText] = useState('1');
  const [from, setFrom] = useState(self?.id ?? '');
  const [scenario, setScenario] = useState<Scenario>('base');
  const [payout, setPayout] = useState<'growth' | 'idcw'>('growth');
  const [returnText, setReturnText] = useState<string | null>(null);

  if (!members.length || !self) return <><h1>Compare</h1><p>Add your family first. <a href="#family">Family</a></p></>;

  const amount = Math.round(Number(amountText.replace(/[,₹\s]/g, '')) * 100);
  const years = Number(yearsText);
  const run = (p: Pick, ownReturn: boolean): BringsHomeResult | null => {
    const product = toProduct(p);
    if (!product) return null;
    // Holdings as classified (AMFI category, your own choices), plus the picked fund if the family doesn't hold it.
    const secs = securitiesForCompare([...fam.securities.values()], market.funds, p.kind === 'fund' ? p.isin : '');
    const userReturn = ownReturn && returnText != null && returnText.trim() !== '' ? Number(returnText) / 100 : undefined;
    return bringsHome({ product, amount, years, scenario, fromMemberId: from || self.id, payout, annualReturn: userReturn }, fam, members, secs, asOf);
  };
  const ra = run(a, true);
  const rb = b ? run(b, false) : null;
  const assumed = ra?.status === 'ok' ? ra.annualReturn : null;
  const ok = ra?.status === 'ok' ? ra : null;
  const rowB = (id: string) => (rb?.status === 'ok' ? rb.rows.find((x) => x.memberId === id) : undefined);

  return (
    <>
      <h1>What it brings home</h1>
      <p className="muted">The same money, held in each family member&rsquo;s name: what is left after tax when it is sold.</p>
      <div className="grid-2">
        <section className="stack" aria-label="What to compare">
          <ProductPicker value={a} onChange={(p) => { setA(p); setReturnText(null); }} id="pa" />
          <div className="form-grid">
            <label className="field" htmlFor="amt">Amount (₹)<input id="amt" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} /></label>
            <label className="field" htmlFor="yrs">Years<input id="yrs" inputMode="decimal" value={yearsText} onChange={(e) => setYearsText(e.target.value)} /></label>
            <label className="field" htmlFor="from">Whose money today
              <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>
          <div className="seg-ctl" role="group" aria-label="Scenario">
            {SCENARIOS.map(([s, label]) => <button key={s} type="button" aria-pressed={scenario === s} onClick={() => { setScenario(s); setReturnText(null); }}>{label}</button>)}
          </div>
          {(a.kind === 'fund' || a.kind === 'category') && (
            <div className="seg-ctl" role="group" aria-label="Payout">
              <button type="button" aria-pressed={payout === 'growth'} onClick={() => setPayout('growth')}>Growth</button>
              <button type="button" aria-pressed={payout === 'idcw'} onClick={() => setPayout('idcw')}>Payout (IDCW)</button>
            </div>
          )}
          <label className="field" htmlFor="ret">Assumed average return, % a year ({SCENARIOS.find(([s]) => s === scenario)![1].toLowerCase()})
            <input id="ret" inputMode="decimal" value={returnText ?? (assumed != null ? (assumed * 100).toFixed(2) : '')} onChange={(e) => setReturnText(e.target.value)} />
          </label>
          <p className="tiny muted">An average, not a promise: in a typical year equity earns less than its average. Assumptions reviewed {dateLabel(ASSUMPTIONS_REVIEWED).replace(/^\d+ /, '')}.</p>
          {b ? (
            <div className="stack" style={{ gap: 8 }}>
              <h2>Compare with</h2>
              <ProductPicker value={b} onChange={setB} id="pb" />
              <button className="btn sm ghost" type="button" onClick={() => setB(null)}>Remove the second</button>
            </div>
          ) : (
            <button className="btn sm" type="button" onClick={() => setB({ kind: 'fd', isin: '', category: CATEGORIES[0]!, label: 'Fixed deposit' })}>Compare with another fund</button>
          )}
        </section>

        <section className="stack" aria-live="polite" aria-label="Result">
          {ra == null && <p className="note">Pick a fund to compare.</p>}
          {ra?.status === 'invalid' && <p className="note" role="alert">{ra.message}</p>}
          {ra?.status === 'check' && <p className="note">{ra.reason} Set this fund&rsquo;s tax type first on the member&rsquo;s page.</p>}
          {ok && (
            <>
              <p className="small muted">{TYPE_LABEL[ok.taxType]} · {inrShort(amount)} for {years} {years === 1 ? 'year' : 'years'} at an assumed {(ok.annualReturn * 100).toFixed(2)}% average{rb?.status === 'ok' ? ` · second: ${TYPE_LABEL[rb.taxType]} at ${(rb.annualReturn * 100).toFixed(2)}%` : ''}</p>
              {rb && rb.status !== 'ok' && <p className="note">{rb.status === 'check' ? rb.reason : rb.message}</p>}
              <div className="tablebox">
                <table>
                  <thead><tr><th>Member</th><th>Slab</th><th className="num">Gain</th><th className="num">Tax</th><th className="num">Brings home</th>{rb?.status === 'ok' && <th className="num">Second</th>}</tr></thead>
                  <tbody>
                    {ok.rows.map((row, i) => {
                      const m = members.find((x) => x.id === row.memberId)!;
                      const taxedIn = members.find((x) => x.id === row.taxedInId)!;
                      const rate = slabRate(taxedIn, fam.rules);
                      const second = rowB(row.memberId);
                      return (
                        <tr key={row.memberId}>
                          <td>
                            <span className="row" style={{ gap: 8 }}>
                              <Avatar member={m} index={indexOf(m.id)} size="sm" /><strong>{m.name}</strong>
                              {i === 0 && <span className="chip ink">Most</span>}
                              {row.gift && <span className="chip club">gift</span>}
                            </span>
                            {row.clubbedReason && <span className="tiny muted" style={{ display: 'block' }}>Taxed as {nameOf(row.taxedInId)}&rsquo;s income. {row.clubbedReason}</span>}
                            {row.warnings.length > 0 && <ul className="warnlist">{row.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                            {row.gift && <details className="tiny"><summary>What a gift means</summary><p className="muted">{GIFT_TEXT}</p></details>}
                          </td>
                          <td>{rate == null ? 'not entered' : `${Math.round(rate * 100)}%`}</td>
                          <td className="num">{inr(row.gain)}</td>
                          <td className="num">{inr(row.tax)}</td>
                          <td className="num"><strong>{inr(row.bringsHome)}</strong></td>
                          {rb?.status === 'ok' && <td className="num">{second ? inr(second.bringsHome) : '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="tiny muted">Each member&rsquo;s income stays at today&rsquo;s level. Sold once at the end; interest and payouts taxed each year. Tax of a later year uses today&rsquo;s rules.</p>
            </>
          )}
          <Disclaimer />
        </section>
      </div>
    </>
  );
}
