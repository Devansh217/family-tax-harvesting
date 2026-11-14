import type { ReactNode } from 'react';
import type { Member, Paise } from '../engine/types';
import { tint } from './format';

export function Avatar({ member, index, size }: { member: Member; index: number; size?: 'sm' | 'lg' }) {
  const [bg, fg] = tint(index);
  return (
    <span className={`av ${size ?? ''}`} style={{ background: bg, color: fg }} aria-hidden="true">
      {member.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

const pct = (part: number, whole: number) => `${whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0}%`;

/** The room meter: used, planned, free, then bonus room from unused basic exemption. */
export function RoomMeter({ used, planned = 0, free, bonus = 0, large }: { used: Paise; planned?: Paise; free: Paise; bonus?: Paise; large?: boolean }) {
  const total = used + planned + free + bonus;
  return (
    <span className={`meter ${large ? 'lg' : ''}`} aria-hidden="true">
      <span className="seg-used" style={{ width: pct(used, total) }} />
      <span className="seg-plan" style={{ width: pct(planned, total) }} />
      <span className="seg-free" style={{ width: pct(free, total) }} />
      <span className="seg-bonus" style={{ width: pct(bonus, total) }} />
    </span>
  );
}

export const Icon = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  plan: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" /></>,
  sim: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  family: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.4 3.3-5.5 6.5-5.5s5.7 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.6 3.5 5.2" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M15 5l-7 7 7 7" />,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z" /></>,
  down: <path d="M12 4v12m-5-5 5 5 5-5M5 20h14" />,
};

export function Svg({ children, size = 20, stroke = 1.9 }: { children: ReactNode; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function Section({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="stack" aria-labelledby={id}>
      <div className="row-between">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Disclaimer() {
  return <p className="tiny muted">Planning estimates from your imported statements, not investment or tax advice. Check large moves with a CA.</p>;
}
