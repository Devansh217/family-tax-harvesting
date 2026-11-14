import type { Move } from '../../engine/family';
import { moveKey, useApp } from '../app-context';
import { dateLabel, inr, units } from '../format';
import { Avatar, Disclaimer, Svg, Icon } from '../parts';
import { SampleBanner } from './Home';

export const movesNotDone = (moves: Move[], done: Record<string, boolean>) => moves.filter((m) => !done[moveKey(m)]);

const KIND_ORDER: Array<{ kind: Move['kind']; title: string; blurb: string }> = [
  { kind: 'harvest_gain', title: 'Sell and buy back', blurb: 'Books long-term gain inside the member’s tax-free room and resets the cost higher. Buy back on the next trading day.' },
  { kind: 'gift', title: 'Gift, then sell', blurb: 'Gift shares off-market to a member with spare room, who sells and buys back. Cost and holding period carry over to them.' },
  { kind: 'harvest_loss', title: 'Book losses', blurb: 'Sell holdings at a loss to cut tax on gains already booked this year.' },
  { kind: 'wait', title: 'Wait', blurb: 'These turn long-term soon. Selling before then is taxed at 20% instead of 12.5%.' },
];

function describe(m: Move, nameOf: (id: string) => string, kindOf: (isin: string) => string | undefined, bonusOf: (id: string) => number): { title: string; sub: string; who: string } {
  const u = units(m.qty);
  const noun = kindOf(m.isin) === 'equity' ? 'share' : 'unit';
  const unitWord = m.qty === 10_000 ? noun : `${noun}s`;
  switch (m.kind) {
    case 'harvest_gain':
      return { who: m.memberId, title: `Sell and buy back ${u} ${unitWord} of ${m.name}`, sub: `${nameOf(m.memberId)} · ${inr(m.gain)} gain, tax-free` };
    case 'gift':
      return {
        who: m.toId, title: `${nameOf(m.fromId)} gifts ${u} ${m.name} shares to ${nameOf(m.toId)}`,
        sub: `${nameOf(m.toId)} sells and buys back · ${inr(m.gain)} gain${bonusOf(m.toId) > 0 ? ', using bonus room from unused basic exemption' : ''} · needs a gift deed`,
      };
    case 'harvest_loss':
      return { who: m.memberId, title: `Sell ${u} ${unitWord} of ${m.name} at a loss`, sub: `${nameOf(m.memberId)} · offsets ${inr(m.loss)} of ${m.term === 'st' ? 'short' : 'long'}-term gains` };
    case 'wait':
      return { who: m.memberId, title: `Hold ${m.name} until ${dateLabel(m.until, false)}`, sub: `${nameOf(m.memberId)} · ${inr(m.gain)} gain turns long-term in ${m.days} days` };
  }
}

export function MoveRow({ move }: { move: Move }) {
  const { state, update, nameOf, indexOf, fam } = useApp();
  const key = moveKey(move);
  const done = !!state.done[key];
  const d = describe(move, nameOf, (isin) => fam.securities.get(isin)?.kind, (id) => fam.members.find((v) => v.member.id === id)?.year.bonus.free ?? 0);
  const who = state.members.find((m) => m.id === d.who);
  return (
    <div className={`move ${done ? 'done' : ''}`}>
      <button
        className="check" type="button" aria-pressed={done} aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${d.title}`}
        onClick={() => update((s) => ({ ...s, done: { ...s.done, [key]: !done } }))}
      >
        <span className="box"><Svg size={14} stroke={3}>{Icon.check}</Svg></span>
      </button>
      <div className="grow stack" style={{ gap: 4 }}>
        <p className="move-title">{d.title}</p>
        <p className="small muted row" style={{ gap: 6 }}>
          {who && <Avatar member={who} index={indexOf(who.id)} size="sm" />}
          <span>{d.sub}</span>
        </p>
      </div>
      <span className={`fig ${done ? 'good' : ''}`} style={{ fontSize: 14 }}>{inr(move.saving)}</span>
    </div>
  );
}

export function Plan() {
  const { fam, state } = useApp();
  const total = fam.moves.reduce((a, m) => a + m.saving, 0);
  const saved = fam.moves.filter((m) => state.done[moveKey(m)]).reduce((a, m) => a + m.saving, 0);
  const doneCount = fam.moves.filter((m) => state.done[moveKey(m)]).length;

  return (
    <>
      <SampleBanner />
      <header className="stack">
        <div className="row-between"><h1>Plan</h1><span className="small muted">{fam.rules.label}</span></div>
        <p style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>
          <span className="fig good">{inr(saved)}</span> saved <span className="muted" style={{ fontWeight: 500 }}>of {inr(total)} available</span>
        </p>
        <span className="meter" aria-hidden="true"><span className="seg-free" style={{ width: `${total ? (saved / total) * 100 : 0}%` }} /></span>
        <p className="small muted">{doneCount} of {fam.moves.length} moves done. Tick a move once the trade is placed in your broker app.</p>
      </header>

      {fam.moves.length === 0 && (
        <div className="sheet empty">
          <p>Nothing to suggest yet. Moves appear once members have priced long-term holdings and free room.</p>
          <a className="btn" href="#import">Import statements</a>
        </div>
      )}

      {KIND_ORDER.map(({ kind, title, blurb }) => {
        const list = fam.moves.filter((m) => m.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="stack">
            <div className="row-between"><h2>{title}</h2><span className="fig small muted">{inr(list.reduce((a, m) => a + m.saving, 0))}</span></div>
            <p className="small muted" style={{ marginTop: -6, maxWidth: '68ch' }}>{blurb}</p>
            <div className="sheet">{list.map((m) => <MoveRow key={m.id} move={m} />)}</div>
          </section>
        );
      })}
      <p className="tiny muted">Fasal never places trades. Savings are future tax avoided at 12.5% plus cess, or tax cut this year for losses and waiting. Gift moves assume shares in a demat account; mutual fund units are not suggested for gifting.</p>
      <Disclaimer />
    </>
  );
}
