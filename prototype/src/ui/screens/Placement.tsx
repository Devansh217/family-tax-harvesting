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

/** One row per member and fund: guesses in several accounts of one fund add up, as a confirmed SIP is per member and fund. */
interface SipRow { key: string; memberId: string; isin: string; name: string; guessed: Paise; confirmed: ConfirmedSip | undefined }
function sipRows(guesses: SipGuess[], confirmed: ConfirmedSip[]): SipRow[] {
  const rows = new Map<string, SipRow>();
  for (const g of guesses) {
    const key = `${g.memberId}|${g.isin}`;
    const row = rows.get(key) ?? { key, memberId: g.memberId, isin: g.isin, name: g.name, guessed: 0, confirmed: undefined };
    rows.set(key, { ...row, guessed: row.guessed + g.monthly });
  }
  for (const c of confirmed) {
    const row = rows.get(`${c.memberId}|${c.isin}`);
    if (row && (!row.confirmed || c.confirmedAt >= row.confirmed.confirmedAt)) row.confirmed = c;
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
/** The amount a row stands at: the family's latest answer, or the guess until they give one. */
const amountOf = (r: SipRow) => r.confirmed?.monthly ?? r.guessed;

/** "You invest about … a month. Right?" Yes confirms the guesses not yet confirmed; Change edits every row. */
function SipPrompt({ guesses }: { guesses: SipGuess[] }) {
  const { state, update, asOf, nameOf } = useApp();
  const rows = sipRows(guesses, state.confirmedSips ?? []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, { rupees: string; stopped: boolean }>>({});
  const sum = rows.reduce((a, r) => a + amountOf(r), 0);
  const confirm = (list: ConfirmedSip[]) => update((s) => ({ ...s, confirmedSips: [...(s.confirmedSips ?? []), ...list] }));
  const rowDraft = (r: SipRow) => draft[r.key] ?? { rupees: String(Math.round(amountOf(r) / 100)), stopped: amountOf(r) === 0 };
  const valid = rows.every((r) => {
    const d = rowDraft(r);
    return d.stopped || (d.rupees.trim() !== '' && Number.isFinite(Number(d.rupees)) && Number(d.rupees) >= 0);
  });
  return (
    <div className="sheet pad stack">
      <p>{`You invest about ${inrShort(sum)} a month. Right?`}</p>
      {!editing && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" type="button" onClick={() => confirm(rows.filter((r) => !r.confirmed).map((r) => ({ memberId: r.memberId, isin: r.isin, monthly: r.guessed, confirmedAt: asOf })))}>Yes</button>
          <button className="btn" type="button" onClick={() => setEditing(true)}>Change</button>
        </div>
      )}
      {editing && (
        <>
          {rows.map((r) => {
            const d = rowDraft(r);
            const set = (next: Partial<typeof d>) => setDraft((x) => ({ ...x, [r.key]: { ...d, ...next } }));
            return (
              <div key={r.key} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="small grow">{`${nameOf(r.memberId)} · ${r.name}`}</span>
                <label className="small">₹ a month <input type="number" min={0} value={d.rupees} disabled={d.stopped} onChange={(e) => set({ rupees: e.target.value })} style={{ width: 110 }} /></label>
                <label className="small"><input type="checkbox" checked={d.stopped} onChange={(e) => set({ stopped: e.target.checked })} /> Stopped</label>
              </div>
            );
          })}
          <p>
            <button
              className="btn" type="button" disabled={!valid}
              onClick={() => {
                confirm(rows.map((r) => {
                  const d = rowDraft(r);
                  return { memberId: r.memberId, isin: r.isin, monthly: d.stopped ? 0 : Math.round(Number(d.rupees) * 100), confirmedAt: asOf };
                }));
                setEditing(false);
              }}
            >Save</button>
          </p>
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
        <span className={`fig ${done ? 'good' : ''}`} style={{ fontSize: 14 }}>{inr(move.savingPerYear)}</span>
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
      {view.unconfirmed && <SipPrompt guesses={view.sipGuesses} />}
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
