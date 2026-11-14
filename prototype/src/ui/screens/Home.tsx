import { sampleState } from '../../sample';
import { startOwnFamily } from '../../store';
import { useApp } from '../app-context';
import { inr, inrShort } from '../format';
import { Avatar, Disclaimer, Icon, RoomMeter, Section, Svg } from '../parts';
import { MoveRow, movesNotDone } from './Plan';

export function SampleBanner() {
  const { state, update, go, toast } = useApp();
  if (!state.isSample) return null;
  return (
    <div className="banner" role="status">
      <span className="grow">You are looking at a <strong>sample family</strong>. Start your own to import your statements; nothing leaves this browser.</span>
      <button className="btn sm primary" type="button" onClick={() => { update(() => startOwnFamily()); go('family'); toast('Sample cleared. Add your family, then import.'); }}>
        Start my own family
      </button>
    </div>
  );
}

export function Home({ days }: { days: number }) {
  const { state, fam, update, go } = useApp();

  if (state.members.length === 0) {
    return (
      <div className="sheet empty">
        <h1>Set up your family</h1>
        <p>Add the people whose tax-free room you want to track, then import their statements.</p>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn primary" type="button" onClick={() => { update(() => startOwnFamily()); go('family'); }}>Add my family</button>
          <button className="btn" type="button" onClick={() => update(() => sampleState())}>Show the sample family</button>
        </div>
      </div>
    );
  }

  const { totals } = fam;
  const used = totals.limit - totals.freeRoom;
  const open = movesNotDone(fam.moves, state.done);
  const openSaving = open.reduce((a, m) => a + m.saving, 0);
  const warnings = fam.ledger.warnings.length;
  const unpriced = fam.members.flatMap((v) => v.holdings).filter((h) => h.price == null).length;

  return (
    <>
      <SampleBanner />
      <div className="row-between" style={{ alignItems: 'center' }}>
        <h1>{state.isSample ? 'Mehta family' : 'Your family'}</h1>
        <span className={`chip time ${days <= 30 ? 'urgent' : ''}`}>
          <Svg size={15}>{Icon.clock}</Svg>
          {days >= 0 ? `${days} days left in ${fam.rules.label}` : `${fam.rules.label} has ended`}
        </span>
      </div>

      <div className="grid-2">
        <section className="hero" aria-labelledby="room-h">
          <h2 id="room-h" className="hero-line">
            <span className="hero-figure">{inr(totals.freeRoom)}</span>
            of tax-free room is still unused across {state.members.length} {state.members.length === 1 ? 'member' : 'members'}
          </h2>
          <div className="stackbar" role="img" aria-label={`Free room by member, and ${inr(used)} already used`}>
            {fam.members.map((v, i) => v.year.room.free > 0 && (
              <span key={v.member.id} style={{ flexBasis: `${(v.year.room.free / totals.limit) * 100}%`, opacity: 1 - (i % 2) * 0.12 }} title={`${v.member.name}: ${inr(v.year.room.free)}`}>
                {v.year.room.free / totals.limit > 0.07 ? v.member.name.charAt(0) : ''}
              </span>
            ))}
            {used > 0 && <span className="used" style={{ flexBasis: `${(used / totals.limit) * 100}%` }}>{used / totals.limit > 0.12 ? 'Used' : ''}</span>}
          </div>
          {totals.bonusFree > 0 && (
            <p className="small muted">Plus <strong className="fig good">{inr(totals.bonusFree)}</strong> of unused basic exemption that low-income members can set against gains.</p>
          )}
          <div className="row-between" style={{ alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span className="small muted">Moves still to do avoid tax of</span>
            <span className="chip room" style={{ fontSize: 15, padding: '4px 12px' }}>{inr(openSaving)}</span>
          </div>
          <a className="btn primary block" href="#plan">See the plan <Svg size={18}>{Icon.arrow}</Svg></a>
        </section>

        <Section title="Room by member" id="mem-h" action={<a href="#family" className="small" style={{ fontWeight: 600, textDecoration: 'none' }}>Manage</a>}>
          <div className="sheet">
            {fam.members.map((v, i) => (
              <a key={v.member.id} className="li" href={`#member-${v.member.id}`}>
                <Avatar member={v.member} index={i} />
                <span className="grow stack" style={{ gap: 6 }}>
                  <span className="row-between"><span style={{ fontWeight: 600 }}>{v.member.name}</span><span className="fig good">{inr(v.year.room.free)}</span></span>
                  <RoomMeter used={v.year.room.used} free={v.year.room.free} bonus={v.year.bonus.free} />
                  <span className="tiny muted">
                    {v.year.room.used > 0 ? `${inr(v.year.room.used)} used` : 'Nothing used yet'}
                    {v.holdings.length === 0 ? ' · no holdings' : ` · ${inrShort(v.holdings.reduce((a, h) => a + h.ltGain, 0))} long-term gains`}
                    {v.year.bonus.free > 0 ? ` · +${inrShort(v.year.bonus.free)} bonus room` : ''}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </Section>
      </div>

      {(warnings > 0 || unpriced > 0) && (
        <div className="banner warn" role="status">
          <span className="grow">
            {warnings > 0 && <>{warnings} {warnings === 1 ? 'sale has' : 'sales have'} no matching purchase history. </>}
            {unpriced > 0 && <>{unpriced} {unpriced === 1 ? 'holding has' : 'holdings have'} no current price, so their gains are not counted. </>}
            Import more statements or add prices on the member pages.
          </span>
        </div>
      )}

      <Section title="Act before it lapses" id="act-h" action={<a href="#plan" className="small" style={{ fontWeight: 600, textDecoration: 'none' }}>All {fam.moves.length} moves</a>}>
        {open.length === 0 ? (
          <div className="sheet empty"><p>No moves left. Every member's room is used or there are no long-term gains to harvest.</p></div>
        ) : (
          <div className="sheet">{open.slice(0, 3).map((m) => <MoveRow key={m.id} move={m} />)}</div>
        )}
        <Disclaimer />
      </Section>
    </>
  );
}
