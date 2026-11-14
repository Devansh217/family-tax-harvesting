import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadFamily, loadProfile, saveFamily, signOut, supabase, type CloudFamily, type Profile, type Session } from '../cloud';
import { sampleState } from '../sample';
import { hasRealData, normalizeState, type AppState } from '../store';

export type SyncStatus = 'signed-out' | 'loading' | 'choose' | 'saving' | 'saved' | 'error';

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

  // Load profile and family when someone signs in.
  useEffect(() => {
    if (!uid) {
      loadedFor.current = null;
      version.current = null;
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
        const [p, cloud] = await Promise.all([loadProfile(uid), loadFamily(uid)]);
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
        // Greet the owner by name instead of "You".
        if (p?.first_name) {
          setState((s) => ({ ...s, members: s.members.map((m) => (m.relation === 'self' && m.name === 'You' ? { ...m, name: p.first_name } : m)) }));
        }
        setStatus('saved');
      } catch (e) {
        setStatus('error');
        toast((e as Error).message);
      }
    })();
  }, [uid, applyAccountCopy, setState, toast]);

  // Save changes to the account, a moment after the last edit.
  useEffect(() => {
    if (!uid || status === 'loading' || status === 'choose' || status === 'signed-out' || state.isSample) return;
    const json = JSON.stringify(state);
    if (json === lastSaved.current) return;
    setStatus('saving');
    const t = window.setTimeout(async () => {
      try {
        const r = await saveFamily(uid, state, version.current);
        if (r === 'conflict') {
          const cloud = await loadFamily(uid);
          if (cloud) {
            version.current = cloud.version;
            applyAccountCopy(cloud.state);
            toast('Loaded newer changes saved from another device');
          }
        } else {
          version.current = r;
          lastSaved.current = json;
        }
        setStatus('saved');
      } catch (e) {
        setStatus('error');
        toast((e as Error).message);
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [state, uid, status, applyAccountCopy, toast]);

  return {
    ready, session, profile, status, pending, recovering,
    doneRecovering: () => setRecovering(false),
    setProfile: setProfileState,
    keepAccountCopy: () => {
      if (!pending) return;
      applyAccountCopy(pending.state);
      setPending(null);
      setStatus('saved');
    },
    keepThisBrowser: () => {
      if (!pending) return;
      version.current = pending.version;
      lastSaved.current = '';
      setPending(null);
      setStatus('saved');
    },
    signOutAndClear: async () => {
      await signOut();
      lastSaved.current = '';
      setState(sampleState());
      toast('Signed out. This browser no longer holds your family; it is safe in your account.');
    },
  };
}
