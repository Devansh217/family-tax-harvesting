import type { ReactNode } from 'react';
import { useApp } from '../app-context';
import { Icon, Svg } from '../parts';

/** The plain-language rules for reading every number in the app. Shown in full here and in short on first visit. */
export const NOT_ADVICE_POINTS: Array<{ title: string; body: string }> = [
  { title: 'It is a tax calculator, not advice', body: 'Harvesting works out the tax effect of selling holdings you already own. It does not recommend buying, selling or holding any security, and it does not judge whether an investment is good.' },
  { title: 'Moves are tax arithmetic', body: 'A "move" shows what would happen to your tax if you sold and bought back the same holding, gifted it, or waited. Whether to do it, and when, is your decision.' },
  { title: 'Numbers are estimates', body: 'They come from the statements you import. Missing history, corporate actions and price changes can make them wrong. Check them against your broker’s tax P&L.' },
  { title: 'Check with a chartered accountant', body: 'For large sales, gifts and filing, confirm with a CA. Harvesting is not registered with SEBI as an investment adviser.' },
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function About() {
  return (
    <>
      <h1>About and privacy</h1>
      <Block title="How to read the suggestions">
        <div className="sheet">
          {NOT_ADVICE_POINTS.map((p) => (
            <div className="li" key={p.title} style={{ alignItems: 'flex-start' }}>
              <span className="grow stack" style={{ gap: 2 }}><strong>{p.title}</strong><span className="small muted">{p.body}</span></span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Your data">
        <div className="sheet">
          <div className="li" style={{ alignItems: 'flex-start' }}>
            <Svg size={20}>{Icon.lock}</Svg>
            <span className="grow stack" style={{ gap: 2 }}>
              <strong>Never used for ads, never sold, never shared</strong>
              <span className="small muted">Your statements and the numbers worked out from them are used only to show you your own tax position. They are not used for advertising, profiling or marketing, not sold or passed to anyone, and never used for any unlawful purpose.</span>
            </span>
          </div>
          <div className="li" style={{ alignItems: 'flex-start' }}>
            <Svg size={20}>{Icon.lock}</Svg>
            <span className="grow stack" style={{ gap: 2 }}>
              <strong>Where it is kept</strong>
              <span className="small muted">Statement files are always read in your browser; the files themselves are never uploaded. Without an account, the results stay in this browser only. If you sign in, your family&rsquo;s data (members, transactions, plan and daily history) is saved to your account in our database, hosted by Supabase, locked so that only your login can read it. You can delete it from the Account page at any time.</span>
            </span>
          </div>
          <div className="li" style={{ alignItems: 'flex-start' }}>
            <Svg size={20}>{Icon.lock}</Svg>
            <span className="grow stack" style={{ gap: 2 }}>
              <strong>Only what is needed</strong>
              <span className="small muted">No Aadhaar, no broker passwords, no bank details. PDF passwords are used once to open the file and are not stored.</span>
            </span>
          </div>
        </div>
      </Block>

      <Block title="What is covered">
        <p className="small muted" style={{ maxWidth: '72ch' }}>
          Listed shares and equity mutual funds held for delivery, for resident individuals, FY 2026-27 rules: 12.5% long-term tax above ₹1.25 L, 20% short-term, 4% cess, 31 Jan 2018 grandfathering, loss set-off and carry-forward. Intraday share trades (detected from tradebooks) and F&O profit or loss (entered from the broker's tax P&L) are taxed at the member's slab; an F&O loss is set off against capital gains, short-term first. F&O figures are not computed from individual contracts. Surcharge, NRI rules, debt funds, gold and property are not covered.
        </p>
      </Block>
    </>
  );
}

export function Footer() {
  return (
    <footer className="tiny muted" style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <span>Not a buy or sell recommendation. Tax estimates only.</span>
      <span>Your data is never used for ads.</span>
      <a href="#about">About and privacy</a>
    </footer>
  );
}

const FIRST_RUN_POINTS = [
  ...NOT_ADVICE_POINTS,
  { title: 'Your data is never used for ads or sold', body: 'It stays in this browser, or in your account if you sign in, where only you can read it.' },
];

/** One-time card on Home until the person confirms they have read how to use the numbers. Titles show; reasons open on request so the family's figures stay in the first screen on a phone. */
export function FirstRunNotice() {
  const { state, update } = useApp();
  if (state.ackGuidance) return null;
  return (
    <section className="sheet pad stack" aria-labelledby="first-h" style={{ borderColor: 'var(--room)', boxShadow: 'var(--shadow)' }}>
      <h2 id="first-h">Before you start</h2>
      <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FIRST_RUN_POINTS.map((p) => <li key={p.title}><strong>{p.title}.</strong></li>)}
      </ul>
      <details className="small">
        <summary>Show details</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FIRST_RUN_POINTS.map((p) => <li key={p.title}><strong>{p.title}.</strong> <span className="muted">{p.body}</span></li>)}
        </ul>
      </details>
      <div className="row wrap">
        <button className="btn primary" type="button" onClick={() => update((s) => ({ ...s, ackGuidance: true }))}>I understand</button>
        <a className="btn ghost" href="#about">Read more</a>
      </div>
    </section>
  );
}
