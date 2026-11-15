import { useState } from 'react';
import type { Member } from '../../engine/types';
import { uid } from '../../store';
import { useApp } from '../app-context';
import { Avatar } from '../parts';
import { IncomeFields, isAdult, LossFields, PersonFields } from './memberFields';

const STEPS = ["Who's in the family", 'Money coming in', 'Losses carried forward'];

/** Family setup: the questionnaire steps the tax maths uses (spec §3.2 steps 1, 2 and 8). Edits save as you go. */
export function Setup() {
  const { state, update, asOf, indexOf, go } = useApp();
  const [step, setStep] = useState(0);
  const manager = state.members.find((m) => m.relation === 'self');
  const put = (m: Member) => update((s) => ({ ...s, members: s.members.map((x) => (x.id === m.id ? m : x)) }));
  const add = () => update((s) => ({
    ...s,
    members: [...s.members, { id: uid('m'), name: '', relation: s.members.some((m) => m.relation === 'self') ? 'parent' : 'self', age: 40, regime: 'new', type: 'person' }],
  }));
  const adults = state.members.filter((m) => isAdult(m, asOf));

  return (
    <>
      <h1>Family setup</h1>
      <p className="muted">Step {step + 1} of 3: {STEPS[step]}. Changes save as you go.</p>
      <div className="seg-ctl" role="tablist" aria-label="Setup steps">
        {STEPS.map((s, i) => <button key={s} type="button" role="tab" aria-selected={step === i} aria-pressed={step === i} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}
      </div>

      {step === 0 && (
        <section className="stack" aria-label={STEPS[0]}>
          {state.members.map((m) => (
            <div key={m.id} className="sheet pad stack">
              <div className="row" style={{ gap: 10 }}><Avatar member={m} index={indexOf(m.id)} /><strong>{m.name || 'New member'}</strong></div>
              <PersonFields member={m} onChange={put} members={state.members} managerId={manager?.id} asOf={asOf} />
            </div>
          ))}
          <button className="btn" type="button" onClick={add}>Add a family member</button>
        </section>
      )}

      {step === 1 && (
        <section className="stack" aria-label={STEPS[1]}>
          {adults.length === 0 && <p className="note">Add adults in step 1 first.</p>}
          {adults.map((m) => (
            <div key={m.id} className="sheet pad stack">
              <div className="row" style={{ gap: 10 }}><Avatar member={m} index={indexOf(m.id)} /><strong>{m.name || 'Unnamed'}</strong></div>
              <IncomeFields member={m} onChange={put} />
            </div>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="stack" aria-label={STEPS[2]}>
          <p className="small muted">Optional. From last year&rsquo;s return (the carried-forward losses schedule). Leave blank if none.</p>
          {adults.map((m) => (
            <div key={m.id} className="sheet pad stack">
              <strong>{m.name || 'Unnamed'}</strong>
              <LossFields member={m} onChange={put} />
            </div>
          ))}
        </section>
      )}

      <div className="row">
        {step > 0 && <button className="btn" type="button" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2 ? <button className="btn primary" type="button" onClick={() => setStep(step + 1)}>Next</button>
          : <button className="btn primary" type="button" onClick={() => go('home')}>Done</button>}
      </div>
    </>
  );
}
