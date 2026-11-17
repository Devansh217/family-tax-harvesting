import { useEffect, useState, type FormEvent } from 'react';
import { sendPasswordReset, setNewPassword, SHOW_EMAIL_SIGNIN, signIn, signInWithGoogle, signUp } from '../../cloud';
import { deleteAccount, listMyAdminReads, loadSeasonLog, saveProfile } from '../../storage';
import { useApp } from '../app-context';
import { Icon, Svg } from '../parts';

const STATUS_TEXT = {
  'signed-out': 'Not signed in',
  loading: 'Loading your family…',
  choose: 'Waiting for you to choose which copy to keep',
  saving: 'Saving…',
  saved: 'All changes saved to your account',
  error: 'Could not save. Your changes are kept in this browser; the next change tries again.',
  not_invited: 'This beta is invite-only for now.',
  signin: 'Your sign-in has ended. Sign in again to keep saving; your family is safe in this browser.',
} as const;

function GoogleButton({ onError }: { onError: (m: string) => void }) {
  return (
    <button className="btn block" type="button" onClick={() => signInWithGoogle().catch((e: Error) => onError(e.message))}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" /></svg>
      Continue with Google
    </button>
  );
}

function SignedOut() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'up') {
        if (!first.trim() || !last.trim()) throw new Error('Enter your first and last name.');
        if (password.length < 8) throw new Error('Use a password of at least 8 characters.');
        const { needsConfirmation } = await signUp(email.trim(), password, first, last);
        if (needsConfirmation) setInfo(`We sent a confirmation link to ${email.trim()}. Open it on this device, then you are signed in.`);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null); setInfo(null);
    if (!email.trim()) { setError('Enter your email above first, then choose Forgot password.'); return; }
    try {
      await sendPasswordReset(email.trim());
      setInfo(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid-2">
      <section className="sheet pad stack">
        {SHOW_EMAIL_SIGNIN && <div className="seg-ctl" role="group" aria-label="Sign in or create an account">
          <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setError(null); setInfo(null); }}>Sign in</button>
          <button type="button" aria-pressed={mode === 'up'} onClick={() => { setMode('up'); setError(null); setInfo(null); }}>Create account</button>
        </div>}
        <GoogleButton onError={setError} />
        {!SHOW_EMAIL_SIGNIN && error && <p className="small bad" role="alert">{error}</p>}
        {!SHOW_EMAIL_SIGNIN && <p className="tiny muted">During the beta, sign in with a Google account.</p>}
        {SHOW_EMAIL_SIGNIN && <p className="tiny muted" style={{ textAlign: 'center' }}>or with email</p>}
        {SHOW_EMAIL_SIGNIN && <form className="stack" onSubmit={submit} noValidate>
          {mode === 'up' && (
            <div className="form-grid">
              <label className="field" htmlFor="acc-first">First name<input id="acc-first" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} required /></label>
              <label className="field" htmlFor="acc-last">Last name<input id="acc-last" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} required /></label>
            </div>
          )}
          <label className="field" htmlFor="acc-email">Email<input id="acc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field" htmlFor="acc-pass">Password
            <input id="acc-pass" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          {error && <p className="small bad" role="alert">{error}</p>}
          {info && <p className="small good" role="status">{info}</p>}
          <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'up' ? 'Create account' : 'Sign in'}</button>
          {mode === 'in' && <button className="btn ghost" type="button" onClick={reset}>Forgot password?</button>}
        </form>}
      </section>
      <aside className="stack">
        <h2>Why sign in</h2>
        <p className="small muted">Your family is saved to your account, so you can open it on your phone and laptop and it survives clearing the browser. Each day&rsquo;s closing-price history is kept with it.</p>
        <div className="note">
          <strong style={{ color: 'var(--ink)' }}>Encrypted, and every look is logged.</strong> Your family is encrypted before it is stored. If the app&rsquo;s maker ever opens it to fix a problem, you see when and why on this page. Your data is never used for ads, never sold or shared.
        </div>
        <p className="small muted">You can keep using Harvesting without an account. Everything then stays in this browser only.</p>
      </aside>
    </div>
  );
}

function NewPassword() {
  const { cloud, toast } = useApp();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="sheet pad stack" style={{ maxWidth: 440 }} onSubmit={async (e) => {
      e.preventDefault();
      if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
      try { await setNewPassword(pw); cloud.doneRecovering(); toast('Password changed'); } catch (err) { setError((err as Error).message); }
    }}>
      <h2>Choose a new password</h2>
      <label className="field" htmlFor="acc-newpw">New password<input id="acc-newpw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {error && <p className="small bad" role="alert">{error}</p>}
      <button className="btn primary" type="submit">Save password</button>
    </form>
  );
}

/** Every time the app's maker opened this family through the logged admin function. */
function AdminReads() {
  const [rows, setRows] = useState<Array<{ at: string; reason: string }> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { listMyAdminReads().then(setRows, () => setFailed(true)); }, []);
  return (
    <div className="sheet pad stack">
      <h2>Who has looked at your data</h2>
      {failed ? <p className="small muted">Could not load the list. Try again later.</p>
        : rows == null ? <p className="small muted">Loading…</p>
        : rows.length === 0 ? <p className="small muted">Nobody has opened your family.</p>
        : <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r) => <li key={r.at + r.reason}>{new Date(r.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}: {r.reason}</li>)}</ul>}
      <p className="tiny muted">Only the app&rsquo;s maker can open a family, with two-factor sign-in and a written reason, and every time is listed here.</p>
    </div>
  );
}

/** The consent wording, verbatim from the spec. */
const SEASON_CONSENT = "From 1 Feb to 31 Mar, our server reads your family once a week to email you what's left to do, and adds your numbers, without names, to the beta's totals. Each read is listed below.";

const SEASON_KIND: Record<string, string> = {
  season_check: 'Read your family',
  email_start: 'Emailed: season has started',
  email_weekly: 'Emailed: weekly summary',
  email_deadline: 'Emailed: deadline reminder',
};

/** The harvest-season switch, with the consent text, and every automatic read listed under it. */
function SeasonHelp() {
  const { state, update } = useApp();
  const [rows, setRows] = useState<Array<{ on_date: string; kind: string }> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadSeasonLog().then(setRows, () => setFailed(true)); }, []);
  const on = state.alerts?.seasonHelp === true;
  return (
    <div className="sheet pad stack">
      <h2>Harvest season help</h2>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={on} onChange={(e) => update((s) => ({ ...s, alerts: { seasonHelp: e.target.checked } }))} />
        Turn on harvest season help
      </label>
      <p className="small">{SEASON_CONSENT}</p>
      <h3>Automatic season checks</h3>
      {failed ? <p className="small muted">Could not load the list. Try again later.</p>
        : rows == null ? <p className="small muted">Loading…</p>
        : rows.length === 0 ? <p className="small muted">No automatic checks yet.</p>
        : <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r) => <li key={r.on_date + r.kind}>{r.on_date}: {SEASON_KIND[r.kind] ?? r.kind}</li>)}</ul>}
    </div>
  );
}

function SignedIn() {
  const { cloud, toast } = useApp();
  const user = cloud.session!.user;
  const [first, setFirst] = useState(cloud.profile?.first_name ?? '');
  const [last, setLast] = useState(cloud.profile?.last_name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const provider = (user.app_metadata?.provider as string | undefined) ?? 'email';

  return (
    <div className="grid-2">
      <section className="stack">
        <form className="sheet pad stack" onSubmit={async (e) => {
          e.preventDefault();
          try { await saveProfile(user.id, { first_name: first, last_name: last }); cloud.setProfile({ first_name: first.trim(), last_name: last.trim() }); toast('Name saved'); }
          catch (err) { toast((err as Error).message); }
        }}>
          <h2>Your details</h2>
          <div className="form-grid">
            <label className="field" htmlFor="acc-f">First name<input id="acc-f" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
            <label className="field" htmlFor="acc-l">Last name<input id="acc-l" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} /></label>
          </div>
          <p className="small muted">{user.email} · signed in with {provider === 'google' ? 'Google' : 'email and password'}</p>
          <div className="row"><button className="btn primary" type="submit">Save name</button></div>
        </form>
      </section>
      <aside className="stack">
        <div className="sheet pad stack">
          <h2>Saved to your account</h2>
          <p className="small row" style={{ gap: 8 }}><Svg size={16}>{Icon.lock}</Svg>{STATUS_TEXT[cloud.status]}</p>
          <div className="row wrap">
            <button className="btn" type="button" onClick={() => void cloud.signOutAndClear()}>Sign out</button>
          </div>
          <p className="tiny muted">Signing out removes your family from this browser. It stays in your account.</p>
        </div>
        <AdminReads />
        <SeasonHelp />
        <div className="sheet pad stack">
          {confirmDelete ? (
            <>
              <p className="small">Delete your account and everything in it: your family, the log of who opened it and your name. This cannot be undone.</p>
              <div className="row">
                <button className="btn danger" type="button" onClick={async () => {
                  try { await deleteAccount(user.id); setConfirmDelete(false); await cloud.signOutAndClear(); toast('Your account and data are deleted'); }
                  catch (err) { toast((err as Error).message); }
                }}>Delete everything</button>
                <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            </>
          ) : (
            <button className="btn danger" type="button" onClick={() => setConfirmDelete(true)}>Delete my account and data</button>
          )}
        </div>
      </aside>
    </div>
  );
}

export function Account() {
  const { cloud } = useApp();
  return (
    <>
      <h1>{cloud.session ? 'Account' : 'Sign in to Harvesting'}</h1>
      {!cloud.ready ? <p className="small muted">Checking sign-in…</p> : cloud.recovering ? <NewPassword /> : cloud.session ? <SignedIn /> : <SignedOut />}
    </>
  );
}

/** Shown when the account already holds a different family than this browser. */
export function ChooseCopy() {
  const { cloud } = useApp();
  if (cloud.status !== 'choose' || !cloud.pending) return null;
  const acct = cloud.pending.state;
  return (
    <div className="banner warn" role="alert">
      <span className="grow">Your account already has a saved family ({acct.members.length} members, {acct.txns.length} transactions), different from the one in this browser. Which should you keep?</span>
      <button className="btn sm primary" type="button" onClick={cloud.keepAccountCopy}>Use my account&rsquo;s copy</button>
      <button className="btn sm" type="button" onClick={cloud.keepThisBrowser}>Replace it with this browser&rsquo;s</button>
    </div>
  );
}
