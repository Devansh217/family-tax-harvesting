import { incomeTotal } from '../../engine/rules';
import { useMemo, useState } from 'react';
import { longTermFrom } from '../../engine/dates';
import type { Paise } from '../../engine/types';
import { useApp } from '../app-context';
import { FundsToCheck, TaxTypeChip } from './FundsToCheck';
import { dateLabel, inr, possessive, RELATIONS, units } from '../format';
import { Avatar, Disclaimer, Icon, RoomMeter, Section, Svg } from '../parts';
import { MoveRow } from './Plan';
import { reconcile } from '../../reconcile';
import { effectiveTxns } from '../../engine/openingLots';
import { unitMismatches } from '../units';
import { importHref } from '../plan';
import { cgSchedule, EXEMPT_NOTE, isSaleRow, SALE_SECTIONS } from '../../engine/cgSchedule';
import { scheduleCsv, scheduleFileName } from '../csv';
import { bookedDisplay, currentPnls, hasYearPnl, holdingsNoteLines, oversellLine, pnlCoverage, visibleOversells } from '../warnings';
import { UnknownTerms } from './UnknownTerms';

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

function CapitalGains({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { fam } = useApp();
  const sched = cgSchedule(fam, memberId);
  const shown = sched.sections.filter((s) => s.rows.length > 0);
  const hasSales = shown.some((s) => SALE_SECTIONS.includes(s.key));
  const download = () => {
    // The byte-order mark lets Excel read the ₹ in the header as UTF-8.
    const url = URL.createObjectURL(new Blob(['\uFEFF', scheduleCsv(sched)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = scheduleFileName(memberName);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <Section title="Capital gains this year" id="cg-h" action={shown.length > 0 ? <button className="btn" type="button" onClick={download}>Download CSV</button> : undefined}>
      {!hasSales && <p className="small muted">{sched.exemptGain !== 0 ? 'No taxable sales this year.' : 'No sales this year.'}</p>}
      <UnknownTerms memberId={memberId} />
      {shown.map((sec) => (
        <div key={sec.key} className="stack" style={{ gap: 6 }}>
          <h3 style={{ fontSize: 15 }}>{sec.title}</h3>
          <div className="tablebox">
            <table>
              <thead>
                <tr>{isSection(sec.key) ? <><th>Name</th><th className="num">Units</th><th>Sale date</th><th className="num">Sale value</th><th className="num">Cost for tax</th><th className="num">31 Jan 2018 value</th><th className="num">Gain</th></> : <><th>Line</th><th className="num">Amount</th></>}</tr>
              </thead>
              <tbody>
                {sec.rows.map((r, i) => isSection(sec.key) ? (
                  <tr key={`${r.saleDate}|${r.isin}|${i}`}>
                    <td>{r.name}{isSaleRow(r) && <span className="tiny muted" style={{ display: 'block' }}>{r.isin}</span>}</td>
                    <td className="num">{isSaleRow(r) ? units(r.units) : '—'}</td>
                    <td style={{ textAlign: 'left' }}>{isSaleRow(r) ? dateLabel(r.saleDate) : ''}</td>
                    <td className="num">{isSaleRow(r) ? inr(r.saleValue) : '—'}</td>
                    <td className="num">{isSaleRow(r) ? inr(r.cost) : '—'}</td>
                    <td className="num">{r.fmv2018 != null ? inr(r.fmv2018) : '—'}</td>
                    <td className="num">{inr(r.gain)}</td>
                  </tr>
                ) : (
                  <tr key={r.name}><td>{r.name}</td><td className="num">{inr(r.gain)}</td></tr>
                ))}
              </tbody>
              {isSection(sec.key) && (
                <tfoot>
                  <tr><td colSpan={6}>Total</td><td className="num">{inr(sec.total)}</td></tr>
                  {sec.afterSetOff != null && <tr><td colSpan={6}>{sec.afterSetOffLabel}</td><td className="num">{inr(sec.afterSetOff)}</td></tr>}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ))}
      {sched.exemptGain !== 0 && <p className="small muted">{EXEMPT_NOTE}</p>}
      {hasSales && <p className="tiny muted">After set-off: each section&rsquo;s gains once this year&rsquo;s losses, losses brought forward and any F&amp;O loss are set off. These are the figures the tax in &ldquo;Booked this year&rdquo; uses.</p>}
      <p className="tiny muted">Cost for tax: for shares and equity funds bought on or before 31 Jan 2018, it is the higher of what you paid and the lower of the 31 Jan 2018 value and the sale value. The 31 Jan 2018 value column shows the value of those units only.</p>
      <p className="tiny muted">The new Act's return forms for 2026-27 are not out yet (expected April–June 2027). Check the sections against the form, or give this to your CA.</p>
    </Section>
  );
}
const isSection = (k: string) => SALE_SECTIONS.includes(k as never);

export function MemberScreen({ id }: { id: string }) {
  const { fam, state, update, indexOf, asOf } = useApp();
  const [view, setView] = useState<'now' | 'plan'>('now');
  // Before any early return: hooks run in the same order every render.
  const txns = useMemo(() => effectiveTxns(state.txns, state.positions, asOf, state.securities), [state.txns, state.positions, asOf, state.securities]);
  const v = fam.members.find((m) => m.member.id === id);
  if (!v) return <div className="sheet empty"><p>This member no longer exists.</p><a className="btn" href="#home">Back to family</a></div>;

  const { member, year, holdings, plan, planned: plannedSale } = v;
  const planned = fam.moves
    .filter((m) => !state.done[m.id])
    .reduce((a, m) => a + ((m.kind === 'harvest_gain' && m.memberId === id) || (m.kind === 'gift' && m.toId === id) ? m.gain : 0), 0);
  const roomTotal = plan.room.free + plan.bonus.free;
  const plannedShown = view === 'plan' ? Math.min(planned, roomTotal) : 0;
  const freeShown = Math.max(0, plan.room.free - plannedShown);
  const bonusShown = Math.max(0, plan.bonus.free - Math.max(0, plannedShown - plan.room.free));
  const mySales = state.plannedSales.filter((p) => p.memberId === id);
  const toggleNeed = (isin: string) => update((s) => ({ ...s, needSoon: { ...s.needSoon, [`${id}|${isin}`]: !s.needSoon[`${id}|${isin}`] } }));
  const myMoves = fam.moves.filter((m) => (m.kind === 'gift' ? m.toId === id || m.fromId === id : m.memberId === id));
  const myWarnings = fam.ledger.warnings.filter((w) => w.memberId === id);
  const nameOf = (isin: string) => fam.securities.get(isin)?.name ?? isin;
  const oversold = visibleOversells(myWarnings, fam.rules, pnlCoverage(state.brokerSummaries, fam.rules));
  const notes = [
    ...holdingsNoteLines(fam.holdingsNotes, id, nameOf, hasYearPnl(currentPnls(state.brokerSummaries, state.imports), fam.rules)),
    ...oversold.now.map((g) => oversellLine(nameOf(g.isin), g)),
  ];
  const booked = bookedDisplay(year, fam.brokerAdjustments, id);
  // Only lots with a known date in a type that turns long-term: slab-taxed funds never do, and a guessed date says nothing.
  // Lots of one share bought on one day are one row.
  const soonByDay = new Map<string, { h: (typeof holdings)[number]; l: { date: string; qty: number; gain: number | null; longTermOn: string } }>();
  for (const h of holdings) {
    if (h.taxType !== 'equity' && h.taxType !== 'other_lt') continue;
    for (const l of h.lots) {
      if (l.term !== 'st' || !l.certain || l.longTermOn <= asOf) continue;
      const k = `${h.isin}|${l.date}`;
      const x = soonByDay.get(k);
      if (!x) { soonByDay.set(k, { h, l: { date: l.date, qty: l.qty, gain: l.gain, longTermOn: l.longTermOn } }); continue; }
      x.l.qty += l.qty;
      x.l.gain = x.l.gain == null || l.gain == null ? null : x.l.gain + l.gain;
    }
  }
  const soon = [...soonByDay.values()].sort((a, b) => a.l.longTermOn.localeCompare(b.l.longTermOn)).slice(0, 6);
  const positions = fam.positions.filter((p) => p.memberId === id);
  const mismatches = unitMismatches(
    id,
    holdings.map((h) => ({ isin: h.isin, qty: h.qty, ltQty: h.lots.filter((l) => l.term === 'lt').reduce((a, l) => a + l.qty, 0), lots: h.lots })),
    txns,
    positions,
    myWarnings,
  );
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
          <p className="small muted">{RELATIONS[member.relation]} · {member.age} · {member.regime} regime · income {member.income?.find((s) => s.band)?.band ?? (incomeTotal(member) == null ? 'not entered' : inr(incomeTotal(member)!))} · <a href={`#family`}>Edit</a></p>
        </div>
      </header>

      <FundsToCheck memberId={id} />

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
          <RoomMeter used={year.room.used} planned={plannedSale.roomUsed + plannedShown} free={freeShown} bonus={bonusShown} large />
          <div className="legend">
            <span><i style={{ background: 'var(--used)' }} />Used {inr(year.room.used)}</span>
            <span><i style={{ background: 'var(--plan)' }} />Planned {inr(plannedSale.roomUsed + plannedShown)}</span>
            <span><i className="seg-free" />Free {inr(freeShown)}</span>
            {year.bonus.total > 0 && <span><i className="seg-bonus" />Bonus {inr(bonusShown)}</span>}
          </div>
          <p className="small muted">
            {incomeTotal(member) == null
              ? <>Enter {possessive(member.name).toLowerCase() === 'your' ? 'your' : possessive(member.name)} other income on the <a href="#family">Family</a> page. If it is below the basic exemption, part of it adds bonus room.</>
              : year.bonus.total > 0
                ? `${possessive(member.name)} other income is below the ${inr(year.bonus.total + (incomeTotal(member) ?? 0))} basic exemption, so ${inr(year.bonus.total)} more of gains can be tax-free this year.`
                : 'No bonus room: other income is above the basic exemption.'}
          </p>
        </section>

        <Section title="Booked this year" id="booked-h">
          <div className="sheet">
            <div className="li"><span className="grow">Long-term gains (net)</span><span className="fig">{inr(year.ltNet)}</span></div>
            <div className="li"><span className="grow">Short-term gains (net)</span><span className="fig">{inr(year.stNet)}</span></div>
            {booked.lossesSetOff > 0 && (
              <div className="li"><span className="grow muted">Losses set off</span><span className="fig">{inr(booked.lossesSetOff)}</span></div>
            )}
            {booked.adjustments.map((line) => <div className="li" key={line}><span className="grow muted small">{line}</span></div>)}
            <div className="li"><span className="grow muted">Tax on gains so far, with cess</span><span className={`fig ${year.tax > 0 ? 'bad' : ''}`}>{inr(year.tax)}</span></div>
            {(year.lossCarriedForward.st > 0 || year.lossCarriedForward.lt > 0) && (
              <div className="li"><span className="grow muted">Losses to carry forward</span><span className="fig">{inr(year.lossCarriedForward.st + year.lossCarriedForward.lt)}</span></div>
            )}
          </div>
        </Section>
      </div>

      {(v.business.speculative !== 0 || v.business.nonSpeculative !== 0) && (
        <Section title="Intraday and F&O" id="biz-h" action={<a className="small" href="#family" style={{ fontWeight: 600, textDecoration: 'none' }}>Edit</a>}>
          <div className="sheet">
            <div className="li"><span className="grow">Intraday {member.business?.intraday == null ? <span className="tiny muted">(from tradebooks)</span> : null}</span><span className={`fig ${v.business.speculative < 0 ? 'bad' : ''}`}>{inr(v.business.speculative)}</span></div>
            <div className="li"><span className="grow">Futures and options</span><span className={`fig ${v.business.nonSpeculative < 0 ? 'bad' : ''}`}>{inr(v.business.nonSpeculative)}</span></div>
            {year.business.setOffAgainstGains > 0 && <div className="li"><span className="grow muted">F&amp;O loss set off against capital gains</span><span className="fig good">{inr(year.business.setOffAgainstGains)}</span></div>}
            {year.business.tax > 0 && <div className="li"><span className="grow muted">Tax on trading profit at your slab{year.business.assumedTopSlab ? ' (30% assumed: income not entered)' : ''}</span><span className="fig bad">{inr(year.business.tax)}</span></div>}
            {(year.business.carryForward.speculative > 0 || year.business.carryForward.nonSpeculative > 0) && (
              <div className="li"><span className="grow muted">Carried forward: intraday loss {inr(year.business.carryForward.speculative)} (4 years), F&amp;O loss {inr(year.business.carryForward.nonSpeculative)} (8 years)</span></div>
            )}
          </div>
          <ul className="warnlist">
            <li>Trading income needs ITR-3, not ITR-2.</li>
            {(member.business?.fnoTurnover ?? 0) > 10_00_00_000_00 && <li>F&amp;O turnover above ₹10 crore usually needs a tax audit (s.44AB).</li>}
            {v.business.nonSpeculative < 0 && <li>An F&amp;O loss with income above the basic exemption can trigger a tax audit. Check with a CA.</li>}
          </ul>
        </Section>
      )}

      {state.brokerSummaries.filter((b) => b.memberId === id).map((b) => {
        const lines = reconcile(fam, b);
        const allOk = lines.every((l) => l.ok);
        return (
          <Section key={b.importId} title={`Check against ${b.summary.broker}`} id={`rec-${b.importId}`}>
            <p className={`small ${allOk ? 'good' : ''}`} style={allOk ? undefined : { color: 'var(--time)' }}>
              {allOk ? `Every total matches ${b.summary.broker}'s tax P&L` : `Some totals differ from ${b.summary.broker}'s tax P&L`}
              {b.summary.from && b.summary.to ? ` for ${dateLabel(b.summary.from)} to ${dateLabel(b.summary.to)}` : ''}{b.account ? ` (${b.account})` : ''}.
            </p>
            <div className="sheet tablebox">
              <table>
                <thead><tr><th scope="col">Realised</th><th scope="col">{b.summary.broker}</th><th scope="col">Harvesting</th><th scope="col">Difference</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.label}>
                      <td>{l.label}</td><td>{inr(l.broker)}</td><td>{inr(l.ours)}</td>
                      <td className={l.ok ? 'good' : 'bad'}>{l.ok ? 'Matches' : inr(l.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!allOk && <p className="tiny muted">Differences usually mean older purchases are missing (import earlier tradebooks), a corporate action, or the same trades imported twice from different files.</p>}
            {fam.brokerAdjustments.some((a) => a.memberId === id && a.account === b.account) && (
              <p className="small" style={{ color: 'var(--time)' }}>Until the history is complete, booked gains, room and tax use {b.summary.broker}&rsquo;s figures for these lines, so they stay correct. Moves still need the purchase dates.</p>
            )}
          </Section>
        );
      })}

      {(notes.length > 0 || oversold.older.length > 0) && (
        <div className="banner" role="note" aria-label="About the imported files" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <p style={{ margin: 0 }}>{notes.length > 0
            ? "The imported files don't fully match the trade history. Here's how the figures handle it."
            : "Some sales have no matching purchase history. This year's tax isn't affected."}</p>
          {notes.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {oversold.older.length > 0 && (
            <details>
              <summary>Older history gaps (no effect on this year's tax)</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{oversold.older.map((w, i) => <li key={i}>{nameOf(w.isin)}, {dateLabel(w.date)}: {w.message}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {mismatches.length > 0 && (
        <div className="banner warn">
          <ul className="warnlist grow">
            {mismatches.map((x, i) => {
              const name = fam.securities.get(x.isin)?.name ?? x.isin;
              const on = x.asOf ? ` on ${dateLabel(x.asOf)}` : '';
              return (
                <li key={`${x.isin}|${i}`}>
                  {x.lt
                    ? <>{name}: broker counts {units(x.lt.statement)} units as long-term, trade history gives {units(x.lt.history)}.</>
                    : <>{name}: a statement shows {units(x.statement)} units{on}, trade history gives {units(x.history)}. Older purchases may be missing.</>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {mySales.length > 0 && (
        <Section title="Planned sales" id="ps-h" action={<a className="small" href="#simulate" style={{ fontWeight: 600, textDecoration: 'none' }}>Plan another</a>}>
          <div className="sheet">
            {mySales.map((p) => (
              <div className="li" key={p.id}>
                <span className="grow">{fam.securities.get(p.isin)?.name ?? p.isin}, {units(p.qty)} units</span>
                <button className="btn sm ghost" type="button" style={{ color: 'var(--tax)' }} onClick={() => update((s) => ({ ...s, plannedSales: s.plannedSales.filter((x) => x.id !== p.id) }))}>Remove</button>
              </div>
            ))}
            <div className="li"><span className="grow muted small">Gain {inr(plannedSale.gain)} · uses {inr(plannedSale.roomUsed)} of room · adds {inr(plannedSale.tax)} tax</span></div>
          </div>
        </Section>
      )}

      {myMoves.length > 0 && (
        <Section title="Moves for this member" id="mv-h">
          <div className="sheet">{myMoves.map((m) => <MoveRow key={m.id} move={m} />)}</div>
          <Disclaimer />
        </Section>
      )}

      <Section title="Holdings" id="hold-h">
        {holdings.length === 0 ? (
          <div className="sheet empty"><p>No holdings imported for {member.name}.</p><a className="btn" href={importHref(id)}>Import statements</a></div>
        ) : (
          <div className="sheet tablebox">
            <table>
              <thead><tr><th scope="col">Holding</th><th scope="col">Units</th><th scope="col">Price</th><th scope="col">Value</th><th scope="col">Long-term gain</th><th scope="col">Short-term gain</th><th scope="col">31 Jan 2018 FMV</th><th scope="col">Needed within 12 months</th></tr></thead>
              <tbody>
                {holdings.map((h) => {
                  const sec = fam.securities.get(h.isin);
                  const pre2018 = h.lots.some((l) => l.date <= fam.rules.grandfatherDate);
                  return (
                    <tr key={h.isin}>
                      <td><span style={{ fontWeight: 600 }}>{h.name}</span> <TaxTypeChip taxType={h.taxType} /><br /><span className="tiny muted">{h.isin.startsWith('SYM:') ? 'No ISIN' : h.isin} · {h.lots.length} {h.lots.length === 1 ? 'lot' : 'lots'}{h.accounts.filter(Boolean).length > 0 ? ` · ${h.accounts.filter(Boolean).join(', ')}` : ''}</span>
                        {(() => {
                          const until = h.lots.map((l) => l.lockedUntil).filter((d): d is string => !!d && d > fam.asOf).sort().pop();
                          return until ? <><br /><span className="tiny" style={{ color: 'var(--time)' }}>Locked until {dateLabel(until)} (tax-saver fund)</span></> : null;
                        })()}
                        {h.uncertainLots > 0 && <><br /><span className="tiny" style={{ color: 'var(--time)' }}>{h.uncertainLots} {h.uncertainLots === 1 ? 'lot' : 'lots'} {pre2018 && !sec?.fmv2018 ? 'need the 31 Jan 2018 value' : 'have an estimated date'}; no moves use {h.uncertainLots === 1 ? 'it' : 'them'}</span></>}</td>
                      <td>{units(h.qty)}</td>
                      <td><PriceInput key={`${h.isin}-${sec?.price}`} value={sec?.price} label={`Price of ${h.name}`} onCommit={(p) => setSecurity(h.isin, { price: p })} /></td>
                      <td>{inr(h.value)}</td>
                      <td className={h.ltGain >= 0 ? '' : 'bad'}>{h.price == null ? '—' : inr(h.ltGain)}</td>
                      <td className="muted">{h.price == null ? '—' : inr(h.stGain)}</td>
                      <td>{pre2018 ? <PriceInput key={`${h.isin}-fmv-${sec?.fmv2018}`} value={sec?.fmv2018} label={`31 Jan 2018 value of ${h.name}`} onCommit={(p) => setSecurity(h.isin, { fmv2018: p })} /> : <span className="tiny muted">n/a</span>}</td>
                      <td><input type="checkbox" aria-label={`Money from ${h.name} needed within 12 months`} checked={!!state.needSoon[`${id}|${h.isin}`]} onChange={() => toggleNeed(h.isin)} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td>Total</td><td /><td />
                <td>{inr(holdings.reduce((a, h) => a + (h.value ?? 0), 0))}</td>
                <td>{inr(holdings.reduce((a, h) => a + h.ltGain, 0))}</td>
                <td>{inr(holdings.reduce((a, h) => a + h.stGain, 0))}</td><td /><td />
              </tr></tfoot>
            </table>
          </div>
        )}
        <p className="tiny muted">Prices come from the latest statement imported. Edit a price to see gains at today's market. Shares bought before 1 Feb 2018 need their 31 Jan 2018 value for grandfathering. Tick "Needed within 12 months" for money you will spend soon: bought-back units would be short-term, so no sell-and-buy-back is suggested for them.</p>
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

      <CapitalGains memberId={id} memberName={member.name} />

      <Section title="Imported files" id="imp-h" action={<a className="small" href={importHref(id)} style={{ fontWeight: 600, textDecoration: 'none' }}>Import more</a>}>
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
