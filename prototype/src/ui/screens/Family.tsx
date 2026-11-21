import { useRef, useState } from 'react';
import { canGift } from '../../engine/relations';
import { autoLink, linkProblems } from '../../engine/links';
import { todayISO } from '../../engine/dates';
import type { Member } from '../../engine/types';
import { sampleState } from '../../sample';
import { backupHadSeasonHelp, emptyState, parseBackup, RESTORE_ALERTS_NOTE, removeMember, uid } from '../../store';
import { FY_2026_27 } from '../../engine/rules';
import { IncomeFields, LossFields, PersonFields } from './memberFields';
import { useApp } from '../app-context';
import { inr, RELATIONS } from '../format';
import { Avatar, Section } from '../parts';
import { SampleBanner } from './Home';

const rupees = (p: number) => String(Math.round(p / 100));
const toPaise = (t: string) => Math.max(0, Math.round((Number(t.replace(/[,₹\s]/g, '')) || 0) * 100));
const toOptionalPaise = (t: string) => (t.trim() === '' ? undefined : toPaise(t));
/** Signed: profits positive, losses negative ("-25000" or "(25,000)"). Blank stays undefined. */
const toSignedPaise = (t: string) => {
  const s = t.trim().replace(/[,₹\s]/g, '');
  if (s === '') return undefined;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[()-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : undefined;
};
const signed = (p?: number) => (p == null ? '' : String(p / 100));

function MemberForm({ initial, onSave, onCancel }: { initial: Member; onSave: (m: Member) => void; onCancel: () => void }) {
  const { state, asOf } = useApp();
  const [m, setM] = useState(initial);
  const [intraday, setIntraday] = useState(signed(initial.business?.intraday));
  const [fno, setFno] = useState(signed(initial.business?.fno));
  const [turnover, setTurnover] = useState(initial.business?.fnoTurnover == null ? '' : rupees(initial.business.fnoTurnover));
  const f = `mf-${initial.id}`;
  const manager = state.members.find((x) => x.relation === 'self');
  const others = state.members.some((x) => x.id === m.id) ? state.members : [...state.members, m];
  return (
    <form
      className="stack pad"
      onSubmit={(e) => {
        e.preventDefault();
        // Link problems are shown next to the fields; don't save until they are fixed.
        const linked = autoLink(others.map((x) => (x.id === m.id ? m : x)));
        if (linkProblems(linked.find((x) => x.id === m.id)!, linked).length) return;
        const business = { intraday: toSignedPaise(intraday), fno: toSignedPaise(fno), fnoTurnover: toOptionalPaise(turnover) };
        onSave({ ...m, name: m.name.trim() || 'Member', business });
      }}
    >
      <PersonFields member={m} onChange={setM} members={others} managerId={manager?.id ?? (m.relation === 'self' ? undefined : undefined)} asOf={asOf} />
      {!m.dob && m.type !== 'huf' && (
        <label className="field" htmlFor={`${f}-age`}>Age (or add the date of birth above)<input id={`${f}-age`} type="number" min={0} max={120} value={m.age} onChange={(e) => setM({ ...m, age: Number(e.target.value) })} /></label>
      )}
      <h3 className="small" style={{ margin: 0 }}>Income besides capital gains</h3>
      <IncomeFields member={m} onChange={setM} />
      <LossFields member={m} onChange={setM} />
      <details>
        <summary>Intraday and F&amp;O this year</summary>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field" htmlFor={`${f}-intra`}>Intraday profit or loss (₹)<input id={`${f}-intra`} inputMode="text" placeholder="Blank: use tradebooks" value={intraday} onChange={(e) => setIntraday(e.target.value)} /></label>
          <label className="field" htmlFor={`${f}-fno`}>F&amp;O profit or loss (₹)<input id={`${f}-fno`} inputMode="text" placeholder="e.g. -25000 for a loss" value={fno} onChange={(e) => setFno(e.target.value)} /></label>
          <label className="field" htmlFor={`${f}-turn`}>F&amp;O turnover (₹)<input id={`${f}-turn`} inputMode="numeric" placeholder="From the tax P&L" value={turnover} onChange={(e) => setTurnover(e.target.value)} /></label>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>Take these from the broker&rsquo;s tax P&amp;L for {FY_2026_27.label}. Use a minus sign for a loss.</p>
      </details>
      <div className="row"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export function Family() {
  const { state, update, fam, indexOf, toast, cloud } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const owner = state.members.find((m) => m.relation === 'self');

  const save = (m: Member) => {
    update((s) => ({ ...s, members: s.members.some((x) => x.id === m.id) ? s.members.map((x) => (x.id === m.id ? m : x)) : [...s.members, m] }));
    setEditing(null);
    toast(`${m.name} saved`);
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `harvesting-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (file: File) => {
    try {
      const text = await file.text();
      const s = parseBackup(text);
      if (!s) throw new Error('bad');
      update(() => s);
      toast(backupHadSeasonHelp(text) ? `Backup restored. ${RESTORE_ALERTS_NOTE}` : 'Backup restored');
    } catch {
      toast('That file is not a Harvesting backup');
    }
  };

  const newMember: Member = { id: uid('m'), name: '', relation: owner ? 'parent' : 'self', age: 40, regime: 'new', type: 'person' };

  return (
    <>
      <SampleBanner />
      <div className="row-between" style={{ alignItems: 'center' }}>
        <h1>Family</h1>
        <button className="btn primary sm" type="button" onClick={() => setEditing('new')}>Add member</button>
      </div>

      <Section title={`${state.members.length} ${state.members.length === 1 ? 'member' : 'members'}`} id="members-h">
        <div className="sheet">
          {editing === 'new' && <MemberForm initial={newMember} onSave={save} onCancel={() => setEditing(null)} />}
          {state.members.map((m) => {
            const v = fam.members.find((x) => x.member.id === m.id);
            const clubbedWith = owner && owner.id !== m.id && !canGift(owner, m, state.members, todayISO()) ? `Gifts from ${owner.name} are clubbed` : null;
            if (editing === m.id) return <div key={m.id} style={{ borderTop: '1px solid var(--line)' }}><MemberForm initial={m} onSave={save} onCancel={() => setEditing(null)} /></div>;
            return (
              <div className="li" key={m.id}>
                <Avatar member={m} index={indexOf(m.id)} />
                <a className="grow stack" href={`#member-${m.id}`} style={{ gap: 2, color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span className="tiny muted">{RELATIONS[m.relation]} · {m.age} · {m.regime} regime · {v ? `${inr(v.plan.room.free)} free` : ''} · {state.imports.filter((i) => i.memberId === m.id).length} files</span>
                  {clubbedWith && <span><span className="chip club">{clubbedWith}</span></span>}
                </a>
                {confirm === m.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <span className="tiny muted">Delete {m.name} and their data?</span>
                    <button className="btn sm danger" type="button" onClick={() => { update((s) => removeMember(s, m.id)); setConfirm(null); }}>Delete</button>
                    <button className="btn sm" type="button" onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn sm ghost" type="button" onClick={() => setEditing(m.id)}>Edit</button>
                    <button className="btn sm ghost" type="button" style={{ color: 'var(--tax)' }} onClick={() => setConfirm(m.id)}>Remove</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="tiny muted">Relations are relative to you. Harvesting never suggests gifts that would be taxed back to the giver: to a spouse, a minor child or a son's wife.</p>
      </Section>

      <Section title="Data on this device" id="data-h">
        <div className="sheet">
          <button className="li" type="button" onClick={backup}><span className="grow">Download a backup</span><span className="tiny muted">JSON, stays with you</span></button>
          <button className="li" type="button" onClick={() => restoreRef.current?.click()}><span className="grow">Restore from a backup</span></button>
          <button className="li" type="button" onClick={() => { update(() => sampleState()); toast('Sample family loaded'); }}><span className="grow">Load the sample family</span><span className="tiny muted">Replaces current data</span></button>
          {confirm === 'all' ? (
            <div className="li">
              <span className="grow small">Delete every member, file and plan tick from this browser? This cannot be undone.</span>
              <button className="btn sm danger" type="button" onClick={() => { update(() => emptyState()); setConfirm(null); toast('All data deleted'); }}>Delete all</button>
              <button className="btn sm" type="button" onClick={() => setConfirm(null)}>Keep</button>
            </div>
          ) : (
            <button className="li" type="button" style={{ color: 'var(--tax)', fontWeight: 600 }} onClick={() => setConfirm('all')}>Delete all data</button>
          )}
        </div>
        <input ref={restoreRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} />
        <p className="tiny muted">{cloud.session
          ? 'Saved in this browser and, encrypted, in your account. Clearing site data removes only this browser’s copy.'
          : 'Everything is stored in this browser only. Clearing site data removes it.'}</p>
      </Section>
    </>
  );
}
