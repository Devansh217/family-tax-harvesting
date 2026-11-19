import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { namesFromLogin, signOut, supabase, type Session } from '../cloud';
import { familyStore, loadProfile, saveProfile, type CloudFamily, type Profile } from '../storage';
import { sampleState } from '../sample';
import { hasRealData, normalizeState, type AppState } from '../store';

import { afterConflict, failureKind, shouldSave, signOutPlan, type SyncStatus } from './syncPolicy';

export type { SyncStatus };

export interface Cloud {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  setProfile: (p: Profile) => void;
  status: SyncStatus;
  /** The account already holds a different family than this browser: the person picks which to keep. */
  pending: CloudFamily | null;
  keepAccountCopy: () => void;
  keepThisBrowser: () => void;
  signOutAndClear: () => Promise<void>;
  /** Arrived from a password-reset email: show the new-password form. */
  recovering: boolean;
  doneRecovering: () => void;
}

const sameFamily = (a: AppState, b: AppState) =>
  JSON.stringify([a.members, a.txns.length, a.securities.length]) === JSON.stringify([b.members, b.txns.length, b.securities.length]);

/**
 * Signed out, the app is browser-only as before. Signed in, the family is loaded from the account and every change
 * is saved back a moment later. Saves carry the version last seen, so a save from another device is never
 * overwritten: on a clash the newer account copy is loaded instead.
 */
export function useCloud(state: AppState, setState: Dispatch<SetStateAction<AppState>>, toast: (m: string) => void): Cloud {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  const [pending, setPending] = useState<CloudFamily | null>(null);
  const [recovering, setRecovering] = useState(false);
  const version = useRef<number | null>(null);
  const loadedFor = useRef<string | null>(null);
  const lastSaved = useRef('');
  // The account copy loaded (or was found empty) for this sign-in; until then nothing is saved.
  const loaded = useRef(false);
  // The family whose save just failed: not retried until it changes (no retry loop).
  const failedJson = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const uid = session?.user.id ?? null;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') { setRecovering(true); location.hash = 'account'; }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const applyAccountCopy = useCallback((raw: AppState) => {
    const s = normalizeState(raw);
    if (!s) return;
    lastSaved.current = JSON.stringify(s);
    setState(s);
  }, [setState]);

  /** An ended sign-in: stop, sign out on this device only (the family stays in this browser), ask to sign in again. */
  const onFailure = useCallback(async (e: unknown) => {
    if (failureKind(e) === 'signin') {
      setStatus('signin');
      toast((e as Error).message);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return;
    }
    if (failureKind(e) === 'not_invited') { setStatus('not_invited'); return; }
    setStatus('error');
    toast((e as Error).message);
  }, [toast]);

  // Load profile and family when someone signs in.
  useEffect(() => {
    if (!uid) {
      loadedFor.current = null;
      version.current = null;
      loaded.current = false;
      setProfileState(null);
      setPending(null);
      setStatus('signed-out');
      return;
    }
    if (loadedFor.current === uid) return;
    loadedFor.current = uid;
    setStatus('loading');
    void (async () => {
      try {
        const [profileRow, cloud] = await Promise.all([loadProfile(uid), familyStore.load(uid)]);
        let p = profileRow;
        // Fill a missing name from the login (Google shares it) and keep it on the profile.
        if (p && (!p.first_name || !p.last_name) && session?.user) {
          const fromLogin = namesFromLogin(session.user.user_metadata);
          const merged = { first_name: p.first_name || fromLogin.first_name, last_name: p.last_name || fromLogin.last_name };
          if (merged.first_name !== p.first_name || merged.last_name !== p.last_name) {
            await saveProfile(uid, merged).catch(() => undefined);
            p = merged;
          }
        }
        setProfileState(p);
        const local = stateRef.current;
        if (cloud) {
          version.current = cloud.version;
          if (hasRealData(local) && !sameFamily(local, cloud.state)) {
            setPending(cloud);
            setStatus('choose');
            return;
          }
          applyAccountCopy(cloud.state);
        } else {
          version.current = null;
        }
        loaded.current = true;
        // Greet the owner by name instead of "You".
        if (p?.first_name) {
          setState((s) => ({ ...s, members: s.members.map((m) => (m.relation === 'self' && m.name === 'You' ? { ...m, name: p.first_name } : m)) }));
        }
        setStatus('saved');
      } catch (e) {
        await onFailure(e);
      }
    })();
  }, [uid, applyAccountCopy, setState, toast, onFailure]);

  // Save changes to the account, a moment after the last edit.
  useEffect(() => {
    const json = JSON.stringify(state);
    if (!shouldSave({ uid, status, isSample: state.isSample, loaded: loaded.current, json, lastSaved: lastSaved.current, failedJson: failedJson.current })) return;
    setStatus('saving');
    const t = window.setTimeout(async () => {
      try {
        const r = await familyStore.save(uid!, state, version.current);
        if (r === 'conflict') {
          const cloud = await familyStore.load(uid!);
          if (cloud) {
            if (afterConflict(version.current, stateRef.current, cloud.state) === 'choose') {
              version.current = cloud.version;
              setPending(cloud);
              setStatus('choose');
              return;
            }
            version.current = cloud.version;
            applyAccountCopy(cloud.state);
            toast('Loaded newer changes saved from another device');
          }
        } else {
          version.current = r;
          lastSaved.current = json;
        }
        failedJson.current = null;
        setStatus('saved');
      } catch (e) {
        failedJson.current = json;
        await onFailure(e);
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [state, uid, status, applyAccountCopy, toast, onFailure]);

  return {
    ready, session, profile, status, pending, recovering,
    doneRecovering: () => setRecovering(false),
    setProfile: setProfileState,
    keepAccountCopy: () => {
      if (!pending) return;
      applyAccountCopy(pending.state);
      setPending(null);
      loaded.current = true;
      setStatus('saved');
    },
    keepThisBrowser: () => {
      if (!pending) return;
      version.current = pending.version;
      lastSaved.current = '';
      setPending(null);
      loaded.current = true;
      failedJson.current = null;
      setStatus('saved');
    },
    signOutAndClear: async () => {
      const plan = signOutPlan(status);
      if (plan.clearLocal) await signOut();
      else await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      lastSaved.current = '';
      if (plan.clearLocal) setState(sampleState());
      toast(plan.message);
    },
  };
}
