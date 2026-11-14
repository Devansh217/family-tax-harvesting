import { useState } from 'react';
import { longTermFrom } from '../../engine/dates';
import type { Paise } from '../../engine/types';
import { moveKey, useApp } from '../app-context';
import { dateLabel, inr, possessive, RELATIONS, units } from '../format';
import { Avatar, Icon, RoomMeter, Section, Svg } from '../parts';
import { MoveRow } from './Plan';

function PriceInput({ value, onCommit, label }: { value: Paise | undefined; onCommit: (p: Paise | undefined) => void; label: string }) {
  const [text, setText] = useState(value != null ? String(value / 100) : '');
  return (
    <input
      className="inline" inputMode="decimal" aria-label={label} placeholder="Add" value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text.replace(/[,₹\s]/g, ''));
        onCommit(text.trim() === '' || !Number.isFinite(n) ? undefined : Math.round(n * 100));
      }}
    />
  );
}

export function MemberScreen({ id }: { id: string }) {
  const { fam, state, update, indexOf, asOf } = useApp();
  const [view, setView] = useState<'now' | 'plan'>('now');
  const v = fam.members.find((m) => m.member.id === id);
  if (!v) return <div className="sheet empty"><p>This member no longer exists.</p><a className="btn" href="#home">Back to family</a></div>;

  const { member, year, holdings } = v;
  const planned = fam.moves
    .filter((m) => !state.done[moveKey(m)])
    .reduce((a, m) => a + ((m.kind === 'harvest_gain' && m.memberId === id) || (m.kind === 'gift' && m.toId === id) ? m.gain : 0), 0);
  const roomTotal = year.room.free + year.bonus.free;
  const plannedShown = view === 'plan' ? Math.min(planned, roomTotal) : 0;
  const freeShown = Math.max(0, year.room.free - plannedShown);
  const bonusShown = Math.max(0, year.bonus.free - Math.max(0, plannedShown - year.room.free));
  const myMoves = fam.moves.filter((m) => (m.kind === 'gift' ? m.toId === id || m.fromId === id : m.memberId === id));
  const myWarnings = fam.ledger.warnings.filter((w) => w.memberId === id);
  const soon = holdings
    .flatMap((h) => h.lots.filter((l) => l.term === 'st').map((l) => ({ h, l })))
    .sort((a, b) => a.l.longTermOn.localeCompare(b.l.longTermOn))
    .slice(0, 6);
  const positions = state.positions.filter((p) => p.memberId === id);
  const mismatches = positions
    .map((p) => ({ p, held: holdings.find((h) => h.isin === p.isin)?.qty ?? 0, name: fam.securities.get(p.isin)?.name ?? p.isin }))
    .filter((x) => Math.abs(x.held - x.p.qty) > 10);
  const imports = state.imports.filter((i) => i.memberId === id);

  const setSecurity = (isin: string, patch: { price?: Paise; fmv2018?: Paise }) =>
    update((s) => ({ ...s, securities: s.securities.map((x) => (x.isin === isin ? { ...x, ...patch, ...(patch.price !== undefined ? { priceDate: asOf } : {}) } : x)) }));

  return (
    <>
      <a href="#home" className="row small" style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 600, gap: 4, minHeight: 32 }}>
        <Svg size={18}>{Icon.back}</Svg>Family
      </a>
      <header className="row" style={{ gap: 14, marginTop: -12 }}>
        <Avatar member={member} index={indexOf(id)} size="lg" />
        <div className="grow">
          <h1>{member.name}</h1>
          <p className="small muted">{RELATIONS[member.relation]} · {member.age} · {member.regime} regime · other income {member.otherIncome == null ? 'not entered' : inr(member.otherIncome)} · <a href={`#family`}>Edit</a></p>
        </div>
      </header>

      <div className="grid-2">
        <section className="stack" aria-labelledby="room-h">
          <div className="seg-ctl" role="group" aria-label="Show room">
            <button type="button" aria-pressed={view === 'now'} onClick={() => setView('now')}>Today</button>
            <button type="button" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>After the plan</button>
          </div>
          <h2 id="room-h" style={{ fontFamily: 'var(--f-display)', fontSize: 34, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.025em' }}>
            <span className="fig">{inr(freeShown)}</span>{' '}
            <span style={{ fontFamily: 'var(--f-body)', fontSize: 16, fontWeight: 500, letterSpacing: 0, color: 'var(--ink-2)' }}>free of {inr(year.room.limit)}</span>
          </h2>
          <RoomMeter used={year.room.used} planned={plannedShown} free={freeShown} bonus={bonusShown} large />
          <div className="legend">
            <span><i style={{ background: 'var(--used)' }} />Used {inr(year.room.used)}</span>
            <span><i style={{ background: 'var(--plan)' }} />Planned {inr(plannedShown)}</span>
            <span><i style={{ background: 'var(--room)' }} />Free {inr(freeShown)}</span>
            {year.bonus.total > 0 && <span><i style={{ background: 'color-mix(in srgb, var(--room) 45%, var(--track))' }} />Bonus {inr(bonusShown)}</span>}
          </div>
          <p className="small muted">
            {member.otherIncome == null
              ? <>Enter {possessive(member.name).toLowerCase() === 'your' ? 'your' : possessive(member.name)} other income on the <a href="#family">Family</a> page. If it is below the basic exemption, part of it adds bonus room.</>
              : year.bonus.total > 0
                ? `${possessive(member.name)} other income is below the ${inr(year.bonus.total + member.otherIncome)} basic exemption, so ${inr(year.bonus.total)} more of gains can be tax-free this year.`
                : 'No bonus room: other income is above the basic exemption.'}
          </p>
        </section>

        <Section title="Booked this year" id="booked-h">
          <div className="sheet">
            <div className="li"><span className="grow">Long-term gains (net)</span><span className="fig">{inr(year.ltNet)}</span></div>
            <div className="li"><span className="grow">Short-term gains (net)</span><span className="fig">{inr(year.stNet)}</span></div>
            {(year.stLosses > 0 || year.ltLosses > 0) && (
              <div className="li"><span className="grow muted">Losses set off</span><span className="fig">{inr(year.stLosses + year.ltLosses)}</span></div>
            )}
            <div className="li"><span className="grow muted">Tax on gains so far, with cess</span><span className={`fig ${year.tax > 0 ? 'bad' : ''}`}>{inr(year.tax)}</span></div>
            {(year.lossCarriedForward.st > 0 || year.lossCarriedForward.lt > 0) && (
              <div className="li"><span className="grow muted">Losses to carry forward</span><span className="fig">{inr(year.lossCarriedForward.st + year.lossCarriedForward.lt)}</span></div>
            )}
          </div>
        </Section>
      </div>

      {myWarnings.length > 0 && (
        <div className="banner warn"><ul className="warnlist grow">{myWarnings.map((w, i) => <li key={i}>{fam.securities.get(w.isin)?.name ?? w.isin}, {dateLabel(w.date)}: {w.message}</li>)}</ul></div>
      )}
      {mismatches.length > 0 && (
        <div className="banner warn">
          <ul className="warnlist grow">
            {mismatches.map((x) => <li key={x.p.isin}>{x.name}: statement shows {units(x.p.qty)} units, trade history gives {units(x.held)}. Older purchases may be missing.</li>)}
          </ul>
        </div>
      )}

      {myMoves.length > 0 && (
        <Section title="Moves for this member" id="mv-h">
          <div className="sheet">{myMoves.map((m) => <MoveRow key={m.id} move={m} />)}</div>
        </Section>
      )}

      <Section title="Holdings" id="hold-h">
        {holdings.length === 0 ? (
          <div className="sheet empty"><p>No holdings imported for {member.name}.</p><a className="btn" href="#import">Import statements</a></div>
        ) : (
          <div className="sheet tablebox">
            <table>
              <thead><tr><th scope="col">Holding</th><th scope="col">Units</th><th scope="col">Price</th><th scope="col">Value</th><th scope="col">Long-term gain</th><th scope="col">Short-term gain</th><th scope="col">31 Jan 2018 FMV</th></tr></thead>
              <tbody>
                {holdings.map((h) => {
                  const sec = fam.securities.get(h.isin);
                  const pre2018 = h.lots.some((l) => l.date <= fam.rules.grandfatherDate);
                  return (
                    <tr key={h.isin}>
                      <td><span style={{ fontWeight: 600 }}>{h.name}</span><br /><span className="tiny muted">{h.isin.startsWith('SYM:') ? 'No ISIN' : h.isin} · {h.lots.length} {h.lots.length === 1 ? 'lot' : 'lots'}{h.accounts.filter(Boolean).length > 0 ? ` · ${h.accounts.filter(Boolean).join(', ')}` : ''}</span>
                        {h.uncertainLots > 0 && <><br /><span className="tiny" style={{ color: 'var(--time)' }}>{h.uncertainLots} {h.uncertainLots === 1 ? 'lot' : 'lots'} {pre2018 && !sec?.fmv2018 ? 'need the 31 Jan 2018 value' : 'have an estimated date'}; no moves use {h.uncertainLots === 1 ? 'it' : 'them'}</span></>}</td>
                      <td>{units(h.qty)}</td>
                      <td><PriceInput key={`${h.isin}-${sec?.price}`} value={sec?.price} label={`Price of ${h.name}`} onCommit={(p) => setSecurity(h.isin, { price: p })} /></td>
                      <td>{inr(h.value)}</td>
                      <td className={h.ltGain >= 0 ? '' : 'bad'}>{h.price == null ? '—' : inr(h.ltGain)}</td>
                      <td className="muted">{h.price == null ? '—' : inr(h.stGain)}</td>
                      <td>{pre2018 ? <PriceInput key={`${h.isin}-fmv-${sec?.fmv2018}`} value={sec?.fmv2018} label={`31 Jan 2018 value of ${h.name}`} onCommit={(p) => setSecurity(h.isin, { fmv2018: p })} /> : <span className="tiny muted">n/a</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td>Total</td><td /><td />
                <td>{inr(holdings.reduce((a, h) => a + (h.value ?? 0), 0))}</td>
                <td>{inr(holdings.reduce((a, h) => a + h.ltGain, 0))}</td>
                <td>{inr(holdings.reduce((a, h) => a + h.stGain, 0))}</td><td />
              </tr></tfoot>
            </table>
          </div>
        )}
        <p className="tiny muted">Prices come from the latest statement imported. Edit a price to see gains at today's market. Shares bought before 1 Feb 2018 need their 31 Jan 2018 value for grandfathering.</p>
      </Section>

      {soon.length > 0 && (
        <Section title="Turning long-term soon" id="soon-h">
          <div className="sheet">
            {soon.map(({ h, l }, i) => (
              <div className="li" key={i}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span>{h.name}, {units(l.qty)} units bought {dateLabel(l.date)}</span>
                  <span className="tiny muted">{l.gain != null ? `${inr(l.gain)} gain` : 'no price'} · long-term from {dateLabel(longTermFrom(l.date, fam.rules.longTermMonths))}</span>
                </span>
                <span className="chip time">{dateLabel(l.longTermOn, false)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Imported files" id="imp-h" action={<a className="small" href="#import" style={{ fontWeight: 600, textDecoration: 'none' }}>Import more</a>}>
        {imports.length === 0 ? <p className="small muted">None yet.</p> : (
          <div className="sheet">
            {imports.map((i) => (
              <div className="li" key={i.id}>
                <span className="grow stack" style={{ gap: 0 }}><span>{i.fileName}</span><span className="tiny muted">{i.format} · {i.txns} transactions · {i.prices} prices</span></span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <p className="tiny muted">Units are matched first in, first out within each demat account or folio, across all of {possessive(member.name).toLowerCase() === 'your' ? 'your' : possessive(member.name)} accounts.</p>
    </>
  );
}
