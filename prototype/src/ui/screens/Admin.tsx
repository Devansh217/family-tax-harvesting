import { useEffect, useState } from 'react';
import { adminList, adminRead, invitesAdd, invitesList, invitesRemove, isAdmin, mfaEnroll, mfaFactorId, mfaStatus, mfaVerify, type FamilyListing, type Invite } from '../../storage/admin';
import type { AppState } from '../../store';
import { useApp } from '../app-context';

/**
 * The founder's screen: set up an authenticator app, step up to two-factor, list families (who and when only), and
 * open one read-only after writing a reason. Every open is logged on the server and shown to that family.
 */
export function Admin({ onView }: { onView: (s: AppState, name: string) => void }) {
  const { cloud, toast } = useApp();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [mfa, setMfa] = useState<'none' | 'enrolled' | 'verified' | null>(null);
  const [enrol, setEnrol] = useState<{ qr: string; factorId: string } | null>(null);
  const [code, setCode] = useState('');
  const [list, setList] = useState<FamilyListing[] | null>(null);
  const [opening, setOpening] = useState<FamilyListing | null>(null);
  const [reason, setReason] = useState('');
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');

  useEffect(() => {
    if (!cloud.session) return;
    void isAdmin().then(setAllowed);
    void mfaStatus().then(setMfa);
  }, [cloud.session]);
  useEffect(() => { if (mfa === 'verified') adminList().then(setList, (e: Error) => toast(e.message)); }, [mfa, toast]);

  useEffect(() => { if (mfa === 'verified') invitesList().then(setInvites, (e: Error) => toast(e.message)); }, [mfa, toast]);

  if (!cloud.session) return <><h1>Admin</h1><p>Sign in first.</p></>;
  if (allowed === false) return <><h1>Admin</h1><p>This page is only for the app&rsquo;s maker.</p></>;
  if (allowed == null || mfa == null) return <><h1>Admin</h1><p className="muted">Checking…</p></>;

  const verify = async (factorId: string) => {
    try { await mfaVerify(factorId, code); setCode(''); setEnrol(null); setMfa('verified'); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <>
      <h1>Admin</h1>
      {mfa !== 'verified' && (
        <section className="sheet pad stack" style={{ maxWidth: 480 }}>
          <h2>Two-factor sign-in</h2>
          {mfa === 'none' && !enrol && (
            <>
              <p className="small">Opening a family needs a code from an authenticator app (Google Authenticator, 1Password, Authy).</p>
              <button className="btn primary" type="button" onClick={() => mfaEnroll().then(setEnrol, (e: Error) => toast(e.message))}>Set up an authenticator app</button>
            </>
          )}
          {enrol && <><p className="small">Scan this with your authenticator app, then enter the 6-digit code.</p><img src={enrol.qr} alt="QR code for the authenticator app" width={180} height={180} /></>}
          {(enrol || mfa === 'enrolled') && (
            <form className="row" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); const id = enrol?.factorId ?? (await mfaFactorId()); if (id) await verify(id); }}>
              <label className="field" htmlFor="mfa-code">Code<input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
              <button className="btn primary" type="submit" disabled={code.length !== 6}>Verify</button>
            </form>
          )}
        </section>
      )}
      {mfa === 'verified' && (
        <section className="stack">
          <h2>Beta invites</h2>
          <form className="row" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={async (e) => {
            e.preventDefault();
            try { await invitesAdd(inviteEmail, inviteNote); setInviteEmail(''); setInviteNote(''); setInvites(await invitesList()); }
            catch (err) { toast((err as Error).message); }
          }}>
            <label className="field" htmlFor="inv-email">Email<input id="inv-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label>
            <label className="field" htmlFor="inv-note">Note<input id="inv-note" value={inviteNote} maxLength={200} onChange={(e) => setInviteNote(e.target.value)} /></label>
            <button className="btn primary" type="submit" disabled={!inviteEmail.includes('@')}>Invite</button>
          </form>
          {invites == null ? <p className="muted">Loading…</p> : invites.length === 0 ? <p className="muted">No one is invited yet.</p> : (
            <div className="tablebox"><table>
              <thead><tr><th>Email</th><th>Note</th><th></th></tr></thead>
              <tbody>{invites.map((i) => (
                <tr key={i.email}>
                  <td>{i.email}</td><td>{i.note ?? ''}</td>
                  <td><button className="btn sm" type="button" onClick={async () => {
                    try { await invitesRemove(i.email); setInvites(await invitesList()); } catch (err) { toast((err as Error).message); }
                  }}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <h2>Families</h2>
          {list == null ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No families saved yet.</p> : (
            <div className="tablebox"><table>
              <thead><tr><th>Account</th><th>Saves</th><th>Last saved</th><th></th></tr></thead>
              <tbody>{list.map((f) => (
                <tr key={f.userId}>
                  <td>{f.email || f.userId}</td><td>{f.version}</td>
                  <td>{new Date(f.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</td>
                  <td><button className="btn sm" type="button" onClick={() => { setOpening(f); setReason(''); }}>Open</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {opening && (
            <form className="sheet pad stack" style={{ maxWidth: 480 }} onSubmit={async (e) => {
              e.preventDefault();
              try { onView(await adminRead(opening.userId, reason), opening.email || opening.userId); setOpening(null); }
              catch (err) { toast((err as Error).message); }
            }}>
              <p className="small">Why are you opening <strong>{opening.email}</strong>&rsquo;s family? They will see this reason and the time.</p>
              <label className="field" htmlFor="adm-reason">Reason<input id="adm-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. They reported a wrong tax figure on Plan" /></label>
              <div className="row"><button className="btn primary" type="submit" disabled={reason.trim().length < 3}>Open read-only</button><button className="btn" type="button" onClick={() => setOpening(null)}>Cancel</button></div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
