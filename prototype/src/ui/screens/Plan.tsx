import { useState } from 'react';
import { isLaterBenefit, taxFreeGainOf, type Move } from '../../engine/family';
import { useApp } from '../app-context';
import { datedRecord, statusRecord } from '../../engine/records';
import { dateLabel, inr, inrShort, units } from '../format';
import { Avatar, Disclaimer, Svg, Icon } from '../parts';
import { SampleBanner } from './Home';
import { NSE_HOLIDAYS_2027, lastSafeDay } from '../../engine/season';
import { buildIcs } from '../calendar';
import { brokerOf } from '../warnings';
import { cushionNudge, datePickerBounds, dateVerb, planGaps, planView, type PlanGap } from '../plan';

export const movesNotDone = (moves: Move[], done: Record<string, boolean>) => moves.filter((m) => !done[m.id]);

const KIND_ORDER: Array<{ kind: Move['kind']; title: string; blurb: string }> = [
  { kind: 'harvest_gain', title: 'Sell and buy back', blurb: 'Books long-term gain inside the member’s tax-free room and resets the cost higher, so that gain is never taxed. Buy back on the next trading day; mutual funds take 1–2 days to pay out. Bought-back units count as short-term for a year, so skip money you need within 12 months.' },
  { kind: 'switch_direct', title: 'Switch to direct', blurb: 'Moves money from the regular plan, which pays a distributor commission, to the direct plan of the same fund. The fee saving is an estimate by fund type.' },
  { kind: 'gift', title: 'Gift, then sell', blurb: 'The shares, and the money from selling them, belong to the person receiving them. Only gift what you mean to give. Cost and holding period carry over, and a gift deed records it.' },
  { kind: 'harvest_loss', title: 'Book losses', blurb: 'Sell holdings at a loss to cut tax on gains already booked this year. You can buy them back afterwards.' },
  { kind: 'wait', title: 'Wait', blurb: 'These turn long-term soon. Selling before then is taxed at 20% instead of 12.5%.' },
];

/**
 * Moves the family can put a day on. A switch beyond the room (wait, next year) has its own timing, and one that costs tax
 * now is not dated: a picked day holds tax-free room, and a dated switch that would cost tax shows "No room left".
 */
const isDatable = (m: Move) => m.kind === 'harvest_gain' || m.kind === 'gift' || m.kind === 'harvest_loss' || (m.kind === 'switch_direct' && m.when === 'now' && m.tax === 0);

/** The last day to sell this year, when the exchange holiday list for the year end is published. */
const useLastSafeDay = () => {
  const { fam } = useApp();
  return fam.rules.end.startsWith('2027') ? lastSafeDay(fam.rules.end, NSE_HOLIDAYS_2027) : null;
};

/** A day picker for one move. Saving keeps the day (replacing an earlier one) and records it; the move is then sized first. */
function DatePicker({ move }: { move: Move }) {
  const { update, asOf, fam } = useApp();
  const { min, max } = datePickerBounds(asOf, fam.rules.end, useLastSafeDay());
  const [day, setDay] = useState(move.date ?? asOf);
  const ok = day !== '' && day >= min && day <= max;
  return (
    <p className="tiny row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <label>{`${dateVerb(move.kind)} `}
        <input type="date" value={day} min={min} max={max} onChange={(e) => setDay(e.target.value)} />
      </label>
      <button
        className="btn" type="button" disabled={!ok || day === move.date}
        onClick={() => update((s) => ({
          ...s,
          datedMoves: [...s.datedMoves.filter((d) => d.moveId !== move.id), { moveId: move.id, date: day }],
          recommendations: [...s.recommendations, datedRecord(move, day, new Date().toISOString())],
        }))}
      >{move.date ? 'Change date' : 'Set date'}</button>
    </p>
  );
}

function describe(m: Move, nameOf: (id: string) => string, bonusOf: (id: string) => number) {
  const u = units(m.qty);
  const noun = m.isin.startsWith('INF') ? 'unit' : 'share';
  const unitWord = m.qty === 10_000 ? noun : `${noun}s`;
  const where = m.account ? ` · ${m.account}` : '';
  switch (m.kind) {
    case 'harvest_gain':
      return { who: m.memberId, title: `Sell and buy back ${u} ${unitWord} of ${m.name}`, sub: `${nameOf(m.memberId)}${where}` };
    case 'gift':
      return {
        who: m.toId, title: `${nameOf(m.fromId)} gifts ${u} ${m.name} shares worth ${inrShort(m.value)} to ${nameOf(m.toId)}`,
        sub: `${nameOf(m.toId)} then sells and buys back${bonusOf(m.toId) > 0 ? ', using bonus room' : ''}${where}`,
      };
    case 'harvest_loss':
      return { who: m.memberId, title: `Sell ${u} ${unitWord} of ${m.name} at a loss`, sub: `${nameOf(m.memberId)} · offsets ${inr(m.loss)} of ${m.term === 'st' ? 'short' : 'long'}-term gains${where}` };
    case 'switch_direct': {
      const when = m.when === 'now' ? 'now' : m.when === 'wait' && m.until ? `wait until ${dateLabel(m.until, false)}` : 'next tax year';
      return { who: m.memberId, title: `Switch ${u} ${unitWord} of ${m.name} to the direct plan`, sub: `${nameOf(m.memberId)} · ${when}${where}` };
    }
    case 'wait':
      return { who: m.memberId, title: `Hold ${m.name} until ${dateLabel(m.until, false)}`, sub: `${nameOf(m.memberId)} · turns long-term in ${m.days} days${where}` };
  }
}

export function MoveRow({ move }: { move: Move }) {
  const { state, update, nameOf, indexOf, fam } = useApp();
  const seenDone = state.recommendations.some((r) => r.moveId === move.id && r.event === 'detected_done');
  const done = !!state.done[move.id] || seenDone;
  const d = describe(move, nameOf, (id) => fam.members.find((v) => v.member.id === id)?.year.bonus.free ?? 0);
  const who = state.members.find((m) => m.id === d.who);
  const nudge = cushionNudge(move, fam);
  const later = isLaterBenefit(move);
  const switching = move.kind === 'switch_direct';
  const gain = taxFreeGainOf(move);
  return (
    <div className={`move ${done ? 'done' : ''}`}>
      <button
        className="check" type="button" aria-pressed={done} aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${d.title}`} disabled={seenDone}
        onClick={() => update((s) => ({
          ...s, done: { ...s.done, [move.id]: !done },
          recommendations: [...s.recommendations, statusRecord(move, done ? 'undone' : 'done', new Date().toISOString())],
        }))}
      >
        <span className="box"><Svg size={14} stroke={3}>{Icon.check}</Svg></span>
      </button>
      <div className="grow stack" style={{ gap: 4 }}>
        <p className="move-title">{d.title}</p>
        {seenDone && <p className="tiny"><span className="chip room">Done, seen in your statement</span></p>}
        <p className="small muted row" style={{ gap: 6 }}>
          {who && <Avatar member={who} index={indexOf(who.id)} size="sm" />}
          <span>{d.sub}</span>
        </p>
        {!move.noRoom && (
        <p className="tiny muted">
          {move.kind === 'switch_direct'
            ? `${move.tax > 0 ? `Tax now: ${inr(move.tax)}` : 'No tax now'} · saves about ${inr(move.feeSavedPerYear)} a year in fees (estimate)${move.toIsin ? '' : ' · find the direct plan at the fund house'} · check the exit load in your fund statement before selling`
            : later
            ? `Avoids ${inr(move.taxAvoided)} of tax on a future sale · costs about ${inr(move.costs)}`
            : move.costs > 0 ? `${inr(move.taxAvoided)} less tax · costs about ${inr(move.costs)}` : `Tax drops from 20% to 12.5% on this gain`}
        </p>
        )}
        {move.noRoom && <p className="tiny" style={{ color: 'var(--time)' }}>{move.reasons[0]}</p>}
        {move.approx && !move.noRoom && <p className="tiny muted">Some units were bought before your trade history, so this uses their average cost and leaves 10% of the room spare. After selling, check the gain in your broker&rsquo;s tax P&amp;L.</p>}
        {nudge && <p className="tiny muted">{nudge.fy ? `Import the ${nudge.fy} tradebook` : 'Import older tradebooks'} from {brokerOf(move.account)} to use the {inr(nudge.rupees)} of room left spare.</p>}
        {move.date && !move.noRoom && <p className="tiny">{`${move.kind === 'gift' ? 'Gift and sell' : 'Sell'} on ${dateLabel(move.date)}`}{move.buyOn && ` · ${move.kind === 'switch_direct' ? 'Buy the direct plan' : 'Buy back'} on ${dateLabel(move.buyOn)}`}</p>}
        {move.date && !move.noRoom && <p className="tiny muted">Units for today&rsquo;s prices; check again on the day</p>}
        {!done && isDatable(move) && <DatePicker move={move} />}
      </div>
      {!move.noRoom && <span className="stack" style={{ gap: 0, alignItems: 'flex-end', flex: 'none' }}>
        <span className={`fig ${done ? 'good' : ''}`} style={{ fontSize: 14 }}>{inr(move.kind === 'switch_direct' ? move.feeSavedPerYear : later ? gain : move.saving)}</span>
        <span className="tiny muted">{switching ? 'less in fees a year' : later ? 'made tax-free' : 'less tax now'}</span>
      </span>}
    </div>
  );
}

/** What keeps the plan from being complete, each with the file or step that fixes it. */
function PlanGaps({ gaps, empty }: { gaps: PlanGap[]; empty: boolean }) {
  if (gaps.length === 0) return null;
  return (
    <section className="sheet pad stack" aria-labelledby="gaps-h" style={{ borderColor: 'var(--time)' }}>
      <h2 id="gaps-h">{empty ? 'Why there are no moves yet' : 'Make this plan complete'}</h2>
      <p className="small muted" style={{ maxWidth: '72ch' }}>Moves need long-term holdings with known buy dates. These holdings are left out until the files below are imported.</p>
      <ul className="stack" style={{ gap: 8, margin: 0, paddingLeft: 18 }}>
        {gaps.map((g, i) => (
          <li key={`${g.memberId}|${g.key}|${i}`} className="small">{g.text} <a href={g.href}>{g.action}</a></li>
        ))}
      </ul>
    </section>
  );
}

/** "Last safe day to sell this year", from 1 February; nothing until the holiday list for the year end is published. */
export function LastSafeDay() {
  const { fam, asOf } = useApp();
  const day = useLastSafeDay();
  if (asOf < `${fam.rules.end.slice(0, 4)}-02-01` || asOf > fam.rules.end || !day) return null;
  return <p className="small">Last safe day to sell this year: <strong>{dateLabel(day)}</strong></p>;
}

/** Downloads the dated steps as a calendar file. Shown once at least one move has a day. */
function CalendarButton() {
  const { fam, nameOf } = useApp();
  const safe = useLastSafeDay();
  if (!fam.moves.some((m) => m.date && !m.noRoom)) return null;
  const download = () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = buildIcs({ moves: fam.moves, nameOf, lastSafeDay: safe, yearEnd: fam.rules.end }, stamp);
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'harvesting-2026-27.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <p><button className="btn" type="button" onClick={download}>Add to my calendar</button></p>;
}

export function Plan() {
  const { fam, state, update, nameOf } = useApp();
  const { open, done, gainDone, gainTotal, nowDone, nowTotal, doneCount, liveCount } = planView(fam, state.recommendations);
  const gaps = state.isSample ? [] : planGaps(fam, fam.positions, state.brokerSummaries, state.imports);
  const empty = fam.moves.length === 0 && done.length === 0;

  return (
    <>
      <SampleBanner />
      <header className="stack">
        <div className="row-between"><h1>Plan</h1><span className="small muted">{fam.rules.label}</span></div>
        <p style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>
          <span className="fig good">{inr(gainDone)}</span> of gains made tax-free <span className="muted" style={{ fontWeight: 500 }}>of {inr(gainTotal)} possible</span>
        </p>
        <LastSafeDay />
        <CalendarButton />
        <span className="meter" aria-hidden="true"><span className="seg-free" style={{ width: `${gainTotal ? (gainDone / gainTotal) * 100 : 0}%` }} /></span>
        {nowTotal > 0 && <p className="small"><strong className="fig">{inr(nowDone)}</strong> cut from this year&rsquo;s tax <span className="muted">of {inr(nowTotal)} possible</span></p>}
        <p className="small muted" style={{ maxWidth: '72ch' }}>
          Gains made tax-free stop being taxed later, when you sell. That is worth up to {inr(fam.totals.laterSaving)} after costs, but only in a year your gains would go past the {inr(fam.rules.ltcgExemption)} exemption. {doneCount} of {liveCount} moves done.
        </p>
        <p className="note" style={{ maxWidth: '72ch' }}>
          <strong style={{ color: 'var(--ink)' }}>Not a recommendation to buy or sell.</strong> Each move shows the tax effect of an action on holdings you already own. Whether to act is your decision; check large moves with a CA. <a href="#about">How to read this</a>
        </p>
        {fam.totals.uncertainLots > 0 && gaps.length === 0 && (
          <p className="small" style={{ color: 'var(--time)' }}>{fam.totals.uncertainLots} {fam.totals.uncertainLots === 1 ? 'lot is' : 'lots are'} left out because the purchase date was estimated or the 31 Jan 2018 value is missing. Fix them on the member pages.</p>
        )}
      </header>

      <PlanGaps gaps={gaps} empty={empty} />
      {empty && gaps.length === 0 && (
        <div className="sheet empty">
          <p>Nothing to suggest yet. {fam.totals.freeRoom > 0 ? `There is ${inr(fam.totals.freeRoom)} of tax-free room, but no long-term gains big enough to be worth the trading costs.` : 'Every member has used their tax-free room this year.'}</p>
          <a className="btn" href="#import">Import statements</a>
        </div>
      )}

      {KIND_ORDER.map(({ kind, title, blurb }) => {
        const list = open.filter((m) => m.kind === kind);
        if (list.length === 0) return null;
        const total = kind === 'switch_direct' ? `${inr(list.reduce((a, m) => a + (m.kind === 'switch_direct' ? m.feeSavedPerYear : 0), 0))} a year in fees` : isLaterBenefit(list[0]!) ? `${inr(list.reduce((a, m) => a + taxFreeGainOf(m), 0))} tax-free` : `${inr(list.reduce((a, m) => a + m.saving, 0))} less tax`;
        return (
          <section key={kind} className="stack">
            <div className="row-between"><h2>{title}</h2><span className="fig small muted">{total}</span></div>
            <p className="small muted" style={{ marginTop: -6, maxWidth: '72ch' }}>{blurb}</p>
            <div className="sheet">{list.map((m) => <MoveRow key={m.id} move={m} />)}</div>
          </section>
        );
      })}
      {done.length > 0 && (
        <section className="stack">
          <div className="row-between"><h2>Done this season</h2><span className="fig small muted">{done.length}</span></div>
          <div className="sheet">
            {done.map(({ move, detected, label }) => (
              <div key={move.id} className="move done">
                <div className="grow stack" style={{ gap: 4 }}>
                  <p className="move-title">{describe(move, nameOf, () => 0).title}</p>
                  <p className="small muted">{move.kind === 'gift' ? `${nameOf(move.fromId)} to ${nameOf(move.toId)}` : nameOf(move.memberId)}</p>
                  <p className="tiny"><span className="chip room">{label}</span></p>
                </div>
                {!detected && (
                  <button
                    className="btn" type="button"
                    onClick={() => update((s) => ({
                      ...s, done: { ...s.done, [move.id]: false },
                      recommendations: [...s.recommendations, statusRecord(move, 'undone', new Date().toISOString())],
                    }))}
                  >Not done</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="tiny muted">Harvesting never places trades. Costs are estimates for a discount broker: securities transaction tax, stamp duty, exchange charges and the depository fee. Gift moves assume shares in a demat account; mutual fund units are not suggested for gifting.</p>
      <Disclaimer />
    </>
  );
}
