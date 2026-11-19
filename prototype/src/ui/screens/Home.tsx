import { sampleState } from '../../sample';
import { startOwnFamily } from '../../store';
import { useApp } from '../app-context';
import { inr, inrShort } from '../format';
import { Avatar, Disclaimer, Icon, RoomMeter, Section, Svg } from '../parts';
import { LastSafeDay, MoveRow, movesNotDone } from './Plan';
import { needsSetup } from './memberFields';
import { FirstRunNotice } from './About';
import { SinceClose } from './SinceClose';
import { isLaterBenefit } from '../../engine/family';

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
  const { state, fam, update, go, asOf, cloud } = useApp();

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
  const openGain = open.reduce((a, m) => a + (m.kind === 'harvest_gain' || m.kind === 'gift' ? m.gain : 0), 0);
  const openLater = open.filter(isLaterBenefit).reduce((a, m) => a + m.saving, 0);
  const openNow = open.filter((m) => !isLaterBenefit(m)).reduce((a, m) => a + m.saving, 0);
  const uncertain = fam.totals.uncertainLots;
  const toCheck = new Set(fam.members.flatMap((v) => v.holdings.filter((h) => h.taxType === 'check').map((h) => h.isin))).size;
  const unchecked = fam.members.reduce((a, v) => a + v.year.unchecked, 0);
  const adjusted = new Set(fam.brokerAdjustments.map((a) => a.memberId)).size;
  const warnings = fam.ledger.warnings.length;
  const unpriced = fam.members.flatMap((v) => v.holdings).filter((h) => h.price == null).length;

  return (
    <>
      <SampleBanner />
      <FirstRunNotice />
      <div className="row-between" style={{ alignItems: 'center' }}>
        <h1>{state.isSample ? 'Mehta family' : 'Your family'}</h1>
        <span className={`chip time ${days <= 30 ? 'urgent' : ''}`}>
          <Svg size={15}>{Icon.clock}</Svg>
          {days >= 0 ? `${days} days left in ${fam.rules.label}` : `${fam.rules.label} has ended`}
        </span>
      </div>

      {cloud.session && !state.isSample && !state.alerts?.seasonHelp && !state.alerts?.chosen && (
        <p className="small" role="note"><a href="#account">Turn on harvest season help (Account)</a></p>
      )}
      <LastSafeDay />
      <div className="grid-2">
        <section className="hero" aria-labelledby="room-h">
          <h2 id="room-h" className="hero-line">
            <span className="hero-figure">{inr(totals.freeRoom)}</span>
            of tax-free room is still unused across {state.members.length} {state.members.length === 1 ? 'member' : 'members'}
          </h2>
          <div className="stackbar" role="img" aria-label={`Free room by member, and ${inr(used)} already used`}>
            {fam.members.map((v, i) => v.plan.room.free > 0 && (
              <span key={v.member.id} style={{ flexBasis: `${(v.plan.room.free / totals.limit) * 100}%`, opacity: 1 - (i % 2) * 0.12 }} title={`${v.member.name}: ${inr(v.plan.room.free)}`}>
                {v.plan.room.free / totals.limit > 0.07 ? v.member.name.charAt(0) : ''}
              </span>
            ))}
            {used > 0 && <span className="used" style={{ flexBasis: `${(used / totals.limit) * 100}%` }}>{used / totals.limit > 0.12 ? 'Used' : ''}</span>}
          </div>
          {totals.bonusFree > 0 && (
            <p className="small muted">Plus <strong className="fig good">{inr(totals.bonusFree)}</strong> of unused basic exemption that low-income members can set against gains.</p>
          )}
          <div className="row-between" style={{ alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span className="small muted">Moves still to do make this much of your gains tax-free</span>
            <span className="chip room" style={{ fontSize: 15, padding: '4px 12px' }}>{inr(openGain)}</span>
          </div>
          <p className="tiny muted" style={{ marginTop: -8 }}>
            That avoids up to {inr(openLater)} of tax later, when you sell, in a year your gains would pass {inr(fam.rules.ltcgExemption)}.
            {openNow > 0 && <> Plus {inr(openNow)} less tax this year from losses and waiting.</>}
          </p>
          <a className="btn primary block" href="#plan">See the plan <Svg size={18}>{Icon.arrow}</Svg></a>
        </section>

        <Section title="Room by member" id="mem-h" action={<a href="#family" className="small" style={{ fontWeight: 600, textDecoration: 'none' }}>Manage</a>}>
          <div className="sheet">
            {fam.members.map((v, i) => (
              <a key={v.member.id} className="li" href={`#member-${v.member.id}`}>
                <Avatar member={v.member} index={i} />
                <span className="grow stack" style={{ gap: 6 }}>
                  <span className="row-between"><span style={{ fontWeight: 600 }}>{v.member.name}</span><span className="fig good">{inr(v.plan.room.free)}</span></span>
                  <RoomMeter used={v.year.room.used} planned={v.planned.roomUsed} free={v.plan.room.free} bonus={v.plan.bonus.free} />
                  <span className="tiny muted">
                    {v.year.room.used > 0 ? `${inr(v.year.room.used)} used` : 'Nothing used yet'}
                    {v.planned.roomUsed > 0 ? ` · ${inr(v.planned.roomUsed)} for planned sales` : ''}
                    {v.holdings.length === 0 ? ' · no holdings' : ` · ${inrShort(v.holdings.reduce((a, h) => a + h.ltGain, 0))} long-term gains`}
                    {v.plan.bonus.free > 0 ? ` · +${inrShort(v.plan.bonus.free)} bonus room` : ''}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </Section>
      </div>

      <SinceClose />

      {needsSetup(state.members, asOf) && (
        <div className="banner" role="status">
          <span className="grow">Add each adult&rsquo;s date of birth and income so the tax figures are right.</span>
          <a className="btn sm primary" href="#setup">Finish family setup</a>
        </div>
      )}

      {(toCheck > 0 || unchecked > 0) && (
        <div className="banner warn" role="status">
          <span className="grow">
            {toCheck > 0 && <>{toCheck} {toCheck === 1 ? 'fund needs' : 'funds need'} a tax type checked before they get moves. </>}
            {unchecked > 0 && <>Includes gains from funds still to check, taxed at slab rate for now. </>}
            Open the member pages to check them.
          </span>
        </div>
      )}

      {(warnings > 0 || unpriced > 0 || uncertain > 0 || adjusted > 0) && (
        <div className="banner warn" role="status">
          <span className="grow">
            {warnings > 0 && <>{warnings} {warnings === 1 ? 'sale has' : 'sales have'} no matching purchase history. </>}
            {unpriced > 0 && <>{unpriced} {unpriced === 1 ? 'holding has' : 'holdings have'} no current price, so their gains are not counted. </>}
            {adjusted > 0 && <>Booked gains for {adjusted} {adjusted === 1 ? 'member use' : 'members use'} the broker&rsquo;s tax P&amp;L because some purchase history is missing. </>}
            {uncertain > 0 && <>{uncertain} {uncertain === 1 ? 'lot has' : 'lots have'} an estimated purchase date or no 31 Jan 2018 value, so no moves use {uncertain === 1 ? 'it' : 'them'}. </>}
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
