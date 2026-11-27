import { useEffect, useMemo, useState } from 'react';
import type { Move } from '../../engine/family';
import { computePlacement } from '../../engine/placementMoves';
import { newShownRecords, statusRecord } from '../../engine/records';
import type { ConfirmedSip, SipGuess } from '../../engine/sips';
import type { Paise } from '../../engine/types';
import { useApp } from '../app-context';
import { dateLabel, inr, inrShort, units, unitWord } from '../format';
import { Avatar, Svg, Icon } from '../parts';
import { nameList, sleepOnIt } from '../plan';

type PlacementMove = Extract<Move, { kind: 'place_sip' | 'place_holding' }>;

/** A placement move's one line. */
export function placementTitle(m: PlacementMove, nameOf: (id: string) => string): string {
  const to = nameOf(m.toId);
  return m.kind === 'place_sip'
    ? `Gift ${to} ${inrShort(m.yearlyGift)} once a year · ${to} runs the ${inrShort(m.monthly)} SIP in ${m.name}`
    : `Gift ${to} ${units(m.qty)} ${unitWord(m.isin, m.qty)} of ${m.name}`;
}

/**
 * One row per member and fund: guesses in several accounts of one fund add up, as a confirmed SIP is per member and
 * fund. A SIP the family confirmed and still runs gets a row even when the files no longer show it, so it can be
 * changed or stopped.
 */
interface SipRow { key: string; memberId: string; isin: string; name: string; guessed: Paise; confirmed: ConfirmedSip | undefined }
function sipRows(guesses: SipGuess[], confirmed: ConfirmedSip[], fundName: (isin: string) => string): SipRow[] {
  const rows = new Map<string, SipRow>();
  for (const g of guesses) {
    const key = `${g.memberId}|${g.isin}`;
    const row = rows.get(key) ?? { key, memberId: g.memberId, isin: g.isin, name: g.name, guessed: 0, confirmed: undefined };
    rows.set(key, { ...row, guessed: row.guessed + g.monthly });
  }
  const latest = new Map<string, ConfirmedSip>();
  for (const c of confirmed) {
    const key = `${c.memberId}|${c.isin}`;
    const prev = latest.get(key);
    if (!prev || c.confirmedAt >= prev.confirmedAt) latest.set(key, c);
  }
  for (const [key, c] of latest) {
    const row = rows.get(key);
    if (row) row.confirmed = c;
    else if (c.monthly > 0) rows.set(key, { key, memberId: c.memberId, isin: c.isin, name: fundName(c.isin), guessed: 0, confirmed: c });
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
/** The amount a row stands at: the family's latest answer, or the guess until they give one. */
const amountOf = (r: SipRow) => r.confirmed?.monthly ?? r.guessed;

const rupeesOk = (x: string, min: number) => x.trim() !== '' && Number.isFinite(Number(x)) && Number(x) >= min;

/**
 * Monthly investing (spec D1). While a guess is unconfirmed: "You invest about … a month. Right?" Yes confirms the
 * guesses not yet confirmed; Change edits every row. Otherwise "Change monthly investing" (or "Add monthly investing"
 * when there is none) opens the same editor, where a SIP the files don't show can be added in a fund the member holds.
 */
function SipEditor({ guesses, unconfirmed }: { guesses: SipGuess[]; unconfirmed: boolean }) {
  const { state, fam, update, asOf, nameOf } = useApp();
  const fundName = (isin: string) => fam.securities.get(isin)?.name ?? isin;
  const rows = sipRows(guesses, state.confirmedSips ?? [], fundName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, { rupees: string; stopped: boolean }>>({});
  const [added, setAdded] = useState<Array<{ memberId: string; isin: string; rupees: string }>>([]);
  const sum = rows.reduce((a, r) => a + amountOf(r), 0);
  const confirm = (list: ConfirmedSip[]) => update((s) => ({ ...s, confirmedSips: [...(s.confirmedSips ?? []), ...list] }));
  const rowDraft = (r: SipRow) => draft[r.key] ?? { rupees: String(Math.round(amountOf(r) / 100)), stopped: amountOf(r) === 0 };
  // Funds each member holds that have no row yet: where a SIP the files don't show can be added.
  const taken = new Set([...rows.map((r) => r.key), ...added.map((a) => `${a.memberId}|${a.isin}`)]);
  const fundsOf = (memberId: string, keep?: string) => [...new Set((fam.members.find((v) => v.member.id === memberId)?.holdings ?? [])
    .filter((h) => h.isin.startsWith('INF') && !h.listed).map((h) => h.isin))]
    .filter((isin) => isin === keep || !taken.has(`${memberId}|${isin}`))
    .sort((a, b) => fundName(a).localeCompare(fundName(b)));
  const canAdd = fam.members.filter((v) => fundsOf(v.member.id).length > 0).map((v) => v.member);
  const valid = rows.every((r) => { const d = rowDraft(r); return d.stopped || rupeesOk(d.rupees, 0); })
    && added.every((a) => a.memberId && a.isin && rupeesOk(a.rupees, 1));
  const close = () => { setEditing(false); setDraft({}); setAdded([]); };
  if (!unconfirmed && !editing && rows.length === 0 && canAdd.length === 0) return null;
  return (
    <div className={unconfirmed || editing ? 'sheet pad stack' : 'row'}>
      {unconfirmed && <p>{`You invest about ${inrShort(sum)} a month. Right?`}</p>}
      {!editing && (
        <div className="row" style={{ gap: 8 }}>
          {unconfirmed && <button className="btn" type="button" onClick={() => confirm(rows.filter((r) => !r.confirmed).map((r) => ({ memberId: r.memberId, isin: r.isin, monthly: r.guessed, confirmedAt: asOf })))}>Yes</button>}
          <button className="btn" type="button" onClick={() => setEditing(true)}>{unconfirmed ? 'Change' : rows.length > 0 ? 'Change monthly investing' : 'Add monthly investing'}</button>
        </div>
      )}
      {editing && (
        <>
          {rows.map((r) => {
            const d = rowDraft(r);
            const set = (next: Partial<typeof d>) => setDraft((x) => ({ ...x, [r.key]: { ...d, ...next } }));
            const label = `${nameOf(r.memberId)} · ${r.name}`;
            return (
              <div key={r.key} role="group" aria-label={label} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="small grow">{label}</span>
                <label className="small">₹ a month <input type="number" min={0} value={d.rupees} disabled={d.stopped} onChange={(e) => set({ rupees: e.target.value })} style={{ width: 110 }} /></label>
                <label className="small"><input type="checkbox" checked={d.stopped} onChange={(e) => set({ stopped: e.target.checked })} /> Stopped</label>
              </div>
            );
          })}
          {added.map((a, k) => {
            const set = (next: Partial<typeof a>) => setAdded((xs) => xs.map((x, j) => (j === k ? { ...x, ...next } : x)));
            const funds = fundsOf(a.memberId, a.isin);
            return (
              <div key={k} role="group" aria-label="New SIP" className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <label className="small">Who <select value={a.memberId} onChange={(e) => set({ memberId: e.target.value, isin: fundsOf(e.target.value)[0] ?? '' })}>
                  {fam.members.map((v) => v.member).filter((m) => m.id === a.memberId || fundsOf(m.id).length > 0).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></label>
                <label className="small" style={{ flexBasis: '100%', minWidth: 0 }}>Fund <select value={a.isin} onChange={(e) => set({ isin: e.target.value })} style={{ width: '100%' }}>
                  {funds.map((isin) => <option key={isin} value={isin}>{fundName(isin)}</option>)}
                </select></label>
                <label className="small">₹ a month <input type="number" min={1} value={a.rupees} onChange={(e) => set({ rupees: e.target.value })} style={{ width: 110 }} /></label>
                <button className="btn ghost" type="button" onClick={() => setAdded((xs) => xs.filter((_, j) => j !== k))}>Remove</button>
              </div>
            );
          })}
          {canAdd.length > 0 && (
            <p><button
              className="btn ghost" type="button"
              onClick={() => { const m = canAdd[0]!; setAdded((xs) => [...xs, { memberId: m.id, isin: fundsOf(m.id)[0] ?? '', rupees: '' }]); }}
            >Add a SIP</button></p>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn" type="button" disabled={!valid}
              onClick={() => {
                confirm([
                  ...rows.map((r) => {
                    const d = rowDraft(r);
                    return { memberId: r.memberId, isin: r.isin, monthly: d.stopped ? 0 : Math.round(Number(d.rupees) * 100), confirmedAt: asOf };
                  }),
                  ...added.map((a) => ({ memberId: a.memberId, isin: a.isin, monthly: Math.round(Number(a.rupees) * 100), confirmedAt: asOf })),
                ]);
                close();
              }}
            >Save</button>
            <button className="btn ghost" type="button" onClick={close}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function PlacementRow({ move }: { move: PlacementMove }) {
  const { state, update, nameOf, indexOf } = useApp();
  const [asking, setAsking] = useState(false);
  const done = !!state.done[move.id];
  const title = placementTitle(move, nameOf);
  const who = state.members.find((m) => m.id === move.toId);
  const mark = (to: boolean) => {
    setAsking(false);
    update((s) => ({
      ...s, done: { ...s.done, [move.id]: to },
      recommendations: [...s.recommendations, statusRecord(move, to ? 'done' : 'undone', new Date().toISOString())],
    }));
  };
  return (
    <div className={`move ${done ? 'done' : ''}`}>
      <button
        className="check" type="button" aria-pressed={done} aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${title}`}
        onClick={() => (!done && sleepOnIt(move) ? setAsking(true) : mark(!done))}
      >
        <span className="box"><Svg size={14} stroke={3}>{Icon.check}</Svg></span>
      </button>
      <div className="grow stack" style={{ gap: 4 }}>
        <p className="move-title">{title}</p>
        <p className="small muted row" style={{ gap: 6 }}>
          {who && <Avatar member={who} index={indexOf(who.id)} size="sm" />}
          <span>{`${nameOf(move.fromId)} to ${nameOf(move.toId)}${move.account ? ` · ${move.account}` : ''}`}</span>
        </p>
        {move.oldData && <p className="tiny" style={{ color: 'var(--time)' }}>{`Based on data from ${dateLabel(move.oldData)}. Check you still hold these before acting.`}</p>}
        {move.roomMayBeSmaller && <p className="tiny" style={{ color: 'var(--time)' }}>{`Gains booked since ${dateLabel(move.roomMayBeSmaller)} aren't counted, so the tax-free room may be smaller. Import this year's tax P&L before acting.`}</p>}
        {asking && (
          <div className="stack" style={{ gap: 6 }}>
            <p className="small">{`This is ${inr(move.value)} that becomes ${nameOf(move.toId)}'s for good. Sleep on it?`}</p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" type="button" onClick={() => setAsking(false)}>Not yet</button>
              <button className="btn" type="button" onClick={() => mark(true)}>Mark as done</button>
            </div>
          </div>
        )}
        <details className="tiny">
          <summary>Why?</summary>
          <ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {move.reasons.map((r) => <li key={r}>{r}</li>)}
            <li>{`${inr(move.saving10y)} over 10 years, at assumed average returns`}</li>
          </ul>
        </details>
      </div>
      <span className="stack" style={{ gap: 0, alignItems: 'flex-end', flex: 'none' }}>
        <span className={`fig ${done ? 'good' : ''}`} style={{ fontSize: 14 }}>{`about ${inr(move.savingPerYear)}`}</span>
        <span className="tiny muted">less tax a year</span>
      </span>
    </div>
  );
}

/**
 * The Plan's "Holding in another name": placement moves (spec 2026-11-24 §5.4), biggest saving first. They stay out
 * of the season lists and headline. Each is recorded as shown the first time, for real families once the funds file
 * has settled, as App does for the season's moves.
 */
export function Placement() {
  const { state, fam, update, nameOf, viewing, marketSettled } = useApp();
  // The solver takes a while: solve once per family change, not on every render.
  const view = useMemo(() => computePlacement(state, fam), [state, fam]);
  const moves = view.moves as PlacementMove[];

  const record = !state.isSample && !viewing && marketSettled;
  useEffect(() => {
    if (!record || newShownRecords(moves, state.recommendations, '').length === 0) return;
    const at = new Date().toISOString();
    update((s) => ({ ...s, recommendations: [...s.recommendations, ...newShownRecords(moves, s.recommendations, at)] }));
  }, [record, moves, state.recommendations, update]);

  const hasMoney = fam.members.some((v) => v.holdings.length > 0) || view.sipGuesses.length > 0 || (state.confirmedSips ?? []).length > 0;
  if (!hasMoney) return null;
  return (
    <section className="stack" aria-labelledby="placement-h">
      <h2 id="placement-h">Holding in another name</h2>
      <SipEditor guesses={view.sipGuesses} unconfirmed={view.unconfirmed} />
      {moves.length > 0 && <div className="sheet">{moves.map((m) => <PlacementRow key={m.id} move={m} />)}</div>}
      {moves.length === 0 && !view.unconfirmed && view.missingIncome.length === 0 && (
        <p className="small muted">Your money is already in the lowest-tax names.</p>
      )}
      {view.clubbedLeftOut.length > 0 && (
        <p className="small muted" style={{ maxWidth: '72ch' }}>{`Not suggested for ${nameList(view.clubbedLeftOut.map(nameOf))}: money you give them is still taxed as yours.`}</p>
      )}
      {view.missingIncome.map((id) => (
        <p key={id} className="small"><a href={`#member-${id}`}>{view.missingGiverIncome.includes(id)
          ? `Add ${nameOf(id)}'s income to see what moving their money could save.`
          : `Add ${nameOf(id)}'s income to see what moving money to them could save.`}</a></p>
      ))}
    </section>
  );
}
