import { useState } from 'react';
import { ageOn } from '../../engine/dates';
import { FY_2026_27, incomeBands } from '../../engine/rules';
import type { IncomeKind, IncomeSource, ISODate, Member } from '../../engine/types';
import { RELATIONS } from '../format';
import { MoneyInput } from '../MoneyInput';

/** Shared by the setup steps and the Family page's member form, so both edit the same fields the same way. */
interface Props { member: Member; onChange: (m: Member) => void }


export const isAdult = (m: Member, asOf: ISODate) => m.type !== 'huf' && ageOn(m, asOf) >= 18;
export const isMinor = (m: Member, asOf: ISODate) => m.type !== 'huf' && ageOn(m, asOf) < 18;

/** The consent tick for a member: a child's needs their parent or guardian (DPDP Act); none for the manager or an HUF. */
export function consentLabel(m: Member, managerId: string | undefined, asOf: ISODate): string | null {
  if (!managerId || m.id === managerId || m.type === 'huf') return null;
  const name = m.name.trim() || 'this member';
  return isMinor(m, asOf) ? `I'm ${name}'s parent or guardian and agree to their data being included` : `${m.name.trim() || 'They'} agreed to be included`;
}
/** Setup is finished when every adult has a date of birth and income (even "none"). */
export const needsSetup = (members: Member[], asOf: ISODate) => members.some((m) => isAdult(m, asOf) && (!m.dob || m.income === undefined));

/** Step 1: who the person is and how they are linked to the others. */
export function PersonFields({ member: m, onChange, members, managerId, asOf }: Props & { members: Member[]; managerId: string | undefined; asOf: ISODate }) {
  const f = `p-${m.id}`;
  const others = members.filter((x) => x.id !== m.id && x.type !== 'huf');
  const set = (patch: Partial<Member>) => onChange({ ...m, ...patch });
  const toggleIn = (list: string[] | undefined, id: string) => (list?.includes(id) ? list.filter((x) => x !== id) : [...(list ?? []), id]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="form-grid">
        <label className="field" htmlFor={`${f}-name`}>Name<input id={`${f}-name`} value={m.name} onChange={(e) => set({ name: e.target.value })} required /></label>
        <label className="field" htmlFor={`${f}-type`}>A person or an HUF
          <select id={`${f}-type`} value={m.type ?? 'person'} onChange={(e) => set({ type: e.target.value as 'person' | 'huf' })}>
            <option value="person">Person</option><option value="huf">HUF (Hindu undivided family)</option>
          </select>
        </label>
        {m.type !== 'huf' && (
          <>
            <label className="field" htmlFor={`${f}-rel`}>Relation to you
              <select id={`${f}-rel`} value={m.relation} onChange={(e) => set({ relation: e.target.value as Member['relation'] })}>
                {Object.entries(RELATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field" htmlFor={`${f}-dob`}>Date of birth
              <input id={`${f}-dob`} type="date" value={m.dob ?? ''} max={asOf} onChange={(e) => set({ dob: e.target.value || undefined, age: e.target.value ? ageOn({ age: m.age, dob: e.target.value }, asOf) : m.age })} />
            </label>
            <label className="field" htmlFor={`${f}-spouse`}>Spouse
              <select id={`${f}-spouse`} value={m.spouseId ?? ''} onChange={(e) => set({ spouseId: e.target.value || undefined })}>
                <option value="">None in the family</option>
                {others.map((x) => <option key={x.id} value={x.id}>{x.name || 'Unnamed'}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field" htmlFor={`${f}-pan`}>PAN, last 4 characters
          <input id={`${f}-pan`} value={m.panLast4 ?? ''} maxLength={4} autoComplete="off" inputMode="text" placeholder="e.g. 234F"
            onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); set({ panLast4: v || undefined }); }} />
        </label>
      </div>
      {m.type !== 'huf' && others.length > 0 && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBottom: 4 }}>Parents in the family</legend>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {others.map((x) => (
              <label key={x.id} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={!!m.parentIds?.includes(x.id)} onChange={() => set({ parentIds: toggleIn(m.parentIds, x.id) })} />{x.name || 'Unnamed'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {m.type === 'huf' && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBottom: 4 }}>Members of the HUF</legend>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {others.map((x) => (
              <label key={x.id} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={!!m.hufMemberIds?.includes(x.id)} onChange={() => set({ hufMemberIds: toggleIn(m.hufMemberIds, x.id) })} />{x.name || 'Unnamed'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="row small" style={{ gap: 6 }}>
        <input type="checkbox" checked={m.resident !== false} onChange={(e) => set({ resident: e.target.checked ? undefined : false })} />Lives in India (resident for tax)
      </label>
      {m.resident === false && <p className="tiny" style={{ color: 'var(--time)' }}>Non-residents are not covered yet: their figures may be wrong, and no gifts to them are suggested.</p>}
      {managerId && consentLabel(m, managerId, asOf) && (
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={!!m.consent} onChange={(e) => set({ consent: e.target.checked ? { agreedAt: asOf, recordedBy: managerId } : undefined })} />
          {consentLabel(m, managerId, asOf)}{m.consent ? ` (${m.consent.agreedAt})` : ''}
        </label>
      )}
    </div>
  );
}

const KINDS: Array<[IncomeKind, string]> = [['salary', 'Salary'], ['pension', 'Pension'], ['interest', 'Interest'], ['rent', 'Rent'], ['business', 'Business'], ['other', 'Other']];

/** Step 2: income sources (or a slab, or none), regime, and old-regime deductions. */
export function IncomeFields({ member: m, onChange }: Props) {
  const f = `i-${m.id}`;
  const [perMonth, setPerMonth] = useState<Record<number, boolean>>({});
  const [regimeChoice, setRegimeChoice] = useState<'new' | 'old' | 'unsure'>(m.regime);
  const band = m.income?.find((s) => s.from === 'band');
  const sources = m.income?.filter((s) => s.from !== 'band') ?? [];
  const bands = incomeBands(m, FY_2026_27);
  const setSources = (list: IncomeSource[]) => onChange({ ...m, income: list });
  const mode = m.income === undefined ? 'unknown' : band ? 'band' : m.income.length === 0 ? 'none' : 'sources';
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="seg-ctl" role="group" aria-label={`How to give ${m.name}'s income`}>
        <button type="button" aria-pressed={mode === 'sources'} onClick={() => setSources(sources.length ? sources : [{ kind: 'salary', amount: 0, from: 'manual' }])}>Amounts</button>
        <button type="button" aria-pressed={mode === 'band'} onClick={() => { const b = bands[2] ?? bands[1]!; onChange({ ...m, income: [{ kind: 'other', amount: b.assumed, from: 'band', band: b.label }] }); }}>Tax slab</button>
        <button type="button" aria-pressed={mode === 'none'} onClick={() => setSources([])}>No income</button>
        <button type="button" aria-pressed={mode === 'unknown'} onClick={() => onChange({ ...m, income: undefined })}>Not sure</button>
      </div>
      {mode === 'sources' && sources.map((s, i) => (
        <div key={i} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field" htmlFor={`${f}-k${i}`}>Kind
            <select id={`${f}-k${i}`} value={s.kind} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, kind: e.target.value as IncomeKind } : x)))}>
              {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field" htmlFor={`${f}-a${i}`}>{perMonth[i] ? 'Per month (₹)' : 'Per year (₹)'}
            <MoneyInput key={perMonth[i] ? 'm' : 'y'} id={`${f}-a${i}`} value={perMonth[i] ? Math.round(s.amount / 12) : s.amount}
              onValue={(p) => setSources(sources.map((x, j) => (j === i ? { ...x, amount: p * (perMonth[i] ? 12 : 1), from: 'manual' } : x)))} />
          </label>
          <button className="btn sm" type="button" onClick={() => setPerMonth({ ...perMonth, [i]: !perMonth[i] })}>{perMonth[i] ? 'Per year' : 'Per month'}</button>
          <button className="btn sm ghost" type="button" style={{ color: 'var(--tax)' }} onClick={() => setSources(sources.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {mode === 'sources' && <button className="btn sm" type="button" onClick={() => setSources([...sources, { kind: 'interest', amount: 0, from: 'manual' }])}>Add another income</button>}
      {mode === 'band' && (
        <select aria-label="Tax slab" value={band?.band ?? ''} onChange={(e) => { const b = bands.find((x) => x.label === e.target.value); if (b) onChange({ ...m, income: [{ kind: 'other', amount: b.assumed, from: 'band', band: b.label }] }); }}>
          {bands.slice(1).map((b) => <option key={b.label} value={b.label}>{b.label}</option>)}
        </select>
      )}
      <label className="field" htmlFor={`${f}-reg`}>Tax regime
        <select id={`${f}-reg`} value={regimeChoice} onChange={(e) => { const v = e.target.value as 'new' | 'old' | 'unsure'; setRegimeChoice(v); onChange({ ...m, regime: v === 'old' ? 'old' : 'new' }); }}>
          <option value="new">New regime</option><option value="old">Old regime</option><option value="unsure">Not sure (we use new)</option>
        </select>
      </label>
      {regimeChoice !== 'new' && (
        <label className="field" htmlFor={`${f}-ded`}>Total deductions you claim (80C, health insurance, rent, NPS…), ₹ a year
          <MoneyInput id={`${f}-ded`} value={m.deductions ?? 0} onValue={(p) => onChange({ ...m, deductions: p || undefined })} />
        </label>
      )}
      <p className="tiny muted">Salary and pension: before the standard deduction, which the app takes off. Interest: from savings, deposits and bonds. A slab is read at its top end, so tax-free room is never overstated.</p>
    </div>
  );
}

/** Step 3: losses carried forward from last year's return. */
export function LossFields({ member: m, onChange }: Props) {
  const f = `l-${m.id}`;
  const cl = m.carriedLoss ?? { st: 0, lt: 0 };
  return (
    <div className="form-grid">
      <label className="field" htmlFor={`${f}-st`}>Short-term loss carried forward (₹)
        <MoneyInput id={`${f}-st`} value={cl.st} onValue={(p) => onChange({ ...m, carriedLoss: { ...cl, st: p } })} />
      </label>
      <label className="field" htmlFor={`${f}-lt`}>Long-term loss carried forward (₹)
        <MoneyInput id={`${f}-lt`} value={cl.lt} onValue={(p) => onChange({ ...m, carriedLoss: { ...cl, lt: p } })} />
      </label>
    </div>
  );
}
