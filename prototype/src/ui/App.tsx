import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { daysBetween, todayISO } from '../engine/dates';
import { computeFamily } from '../engine/family';
import { newShownRecords } from '../engine/records';
import { FY_2026_27 } from '../engine/rules';
import type { AppState } from '../store';
import { initialFamily, loadLocal, saveLocal } from '../storage/device';
import { supabase } from '../cloud';
import { AppCtx, useApp, type Ctx } from './app-context';
import { addSnapshot, loadMarket, snapshotOf, withFunds, withPrices, type Market } from './market';
import { Svg, Icon } from './parts';
import { Home } from './screens/Home';
import { MemberScreen } from './screens/Member';
import { Plan } from './screens/Plan';
import { Admin } from './screens/Admin';
import { Compare } from './screens/Compare';
import { isAdmin } from '../storage/admin';
import { viewedContext } from './viewing';
import { Setup } from './screens/Setup';
import { Simulate } from './screens/Simulate';
import { Family } from './screens/Family';
import { Import } from './screens/Import';
import { About, Footer } from './screens/About';
import { Account, ChooseCopy } from './screens/Account';
import { useCloud } from './useCloud';

const TABS = [
  { route: 'home', label: 'Home', icon: Icon.home },
  { route: 'plan', label: 'Plan', icon: Icon.plan },
  { route: 'simulate', label: 'Simulate', icon: Icon.sim },
  { route: 'compare', label: 'Compare', icon: Icon.gift },
  { route: 'family', label: 'Family', icon: Icon.family },
  { route: 'import', label: 'Import', icon: Icon.upload },
];

const readRoute = () => (location.hash.replace(/^#/, '') || 'home');

/** Opens the family saved in this browser (it is encrypted, so this is asynchronous), then shows the app. */
export function App() {
  const [initial, setInitial] = useState<AppState | null>(null);
  useEffect(() => {
    void Promise.all([loadLocal(), supabase.auth.getSession()]).then(([local, { data }]) => setInitial(initialFamily(local, !!data.session)));
  }, []);
  if (!initial) {
    return (
      <div className="shell"><main><p className="muted" role="status" style={{ marginTop: 48, textAlign: 'center' }}>Opening your family…</p></main></div>
    );
  }
  return <Main initial={initial} />;
}

function InviteOnly() {
  const { cloud } = useApp();
  return (
    <section className="sheet pad stack" style={{ maxWidth: 480, margin: '48px auto' }}>
      <h1>Invite-only beta</h1>
      <p>This beta is invite-only. Ask the person who invited you.</p>
      <div className="row"><button className="btn" type="button" onClick={() => void cloud.signOutAndClear()}>Sign out</button></div>
    </section>
  );
}

function Main({ initial }: { initial: AppState }) {
  const [state, setState] = useState<AppState>(initial);
  const [route, setRoute] = useState(readRoute);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const timer = useRef<number>();
  const asOf = todayISO();

  useEffect(() => { void saveLocal(state).then((ok) => setSaveFailed(!ok)); }, [state]);
  useEffect(() => {
    const on = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const toast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  const cloud = useCloud(state, setState, toast);
  const [market, setMarket] = useState<Market>({ latest: null, previous: null, funds: null });
  // Settled once funds.json has arrived or failed for good (loadMarket never throws; a failure gives nulls).
  const [marketSettled, setMarketSettled] = useState(false);
  useEffect(() => { void loadMarket().then((m) => { setMarket(m); setMarketSettled(true); }); }, []);

  // The sample family keeps its own made-up prices; real families are re-priced at the latest close.
  const live = !state.isSample;
  const securities = useMemo(() => withFunds(state.securities, market.funds, state.taxTypeOverrides), [state.securities, market.funds, state.taxTypeOverrides]);
  const fam = useMemo(
    () => computeFamily(live ? { ...state, securities: withPrices(securities, market.latest), funds: market.funds?.funds } : state, asOf, FY_2026_27),
    [state, securities, asOf, market, live],
  );
  const famPrev = useMemo(
    () => (live && market.previous ? computeFamily({ ...state, securities: withPrices(securities, market.previous), funds: market.funds?.funds }, asOf, FY_2026_27) : null),
    [state, securities, asOf, market, live],
  );

  // Record each move the first time it is shown (append-only), for real families only. Not before the funds file has
  // settled: until then a fund's category (ELSS lock, direct twin) is unknown and the moves may be wrong.
  useEffect(() => {
    if (!live || !marketSettled) return;
    const fresh = newShownRecords(fam.moves, state.recommendations, new Date().toISOString());
    if (fresh.length) setState((s) => ({ ...s, recommendations: [...s.recommendations, ...newShownRecords(fam.moves, s.recommendations, fresh[0]!.at)] }));
  }, [fam.moves, live, marketSettled, state.recommendations]);

  useEffect(() => {
    if (!live || !market.latest || state.members.length === 0) return;
    const snap = snapshotOf(fam, market.latest.date);
    const prev = state.history.find((h) => h.date === snap.date);
    if (prev && JSON.stringify(prev) === JSON.stringify(snap)) return;
    setState((s) => ({ ...s, history: addSnapshot(s.history, snap) }));
  }, [fam, market.latest, live, state.history, state.members.length]);

  const [viewed, setViewed] = useState<{ state: AppState; name: string } | null>(null);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { if (cloud.session) void isAdmin().then(setAdmin); else { setAdmin(false); setViewed(null); } }, [cloud.session]);

  const own: Ctx = {
    state, fam, famPrev, market, cloud, asOf, toast, viewing: null,
    update: (fn) => setState((s) => fn(s)),
    go: (r) => { location.hash = r; },
    indexOf: (id) => Math.max(0, state.members.findIndex((m) => m.id === id)),
    nameOf: (id) => state.members.find((m) => m.id === id)?.name ?? 'Unknown',
  };
  // While viewing another family, every screen shows theirs read-only; sync above keeps using the founder's own state.
  const ctx = viewed ? viewedContext(own, viewed.state, viewed.name) : own;

  const tab = route.startsWith('member-') ? 'home' : route;
  const days = daysBetween(asOf, FY_2026_27.end);
  let screen;
  if (route.startsWith('member-')) screen = <MemberScreen id={route.slice(7)} />;
  else if (route === 'plan') screen = <Plan />;
  else if (route === 'simulate') screen = <Simulate />;
  else if (route === 'compare') screen = <Compare />;
  else if (route === 'setup') screen = <Setup />;
  else if (route === 'admin') screen = <Admin onView={(s, name) => { setViewed({ state: s, name }); location.hash = 'home'; }} />;
  else if (route === 'family') screen = <Family />;
  else if (route === 'import') screen = <Import />;
  else if (route === 'about') screen = <About />;
  else if (route === 'account') screen = <Account />;
  else screen = <Home days={days} />;
  // Signed in but not on the beta list: nothing else loads. The Account page stays reachable (sign out, delete).
  if (cloud.status === 'not_invited' && route !== 'account') screen = <InviteOnly />;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <header className="topbar">
          <div className="topbar-in">
            <a href="#home" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="brand-mark"><Svg size={14} stroke={2.6}>{Icon.check}</Svg></span>Harvesting
            </a>
            <nav className="topnav" aria-label="Main">
              {TABS.map((t) => (
                <a key={t.route} href={`#${t.route}`} aria-current={tab === t.route ? 'page' : undefined}>{t.label}</a>
              ))}
              {admin && <a href="#admin" aria-current={tab === 'admin' ? 'page' : undefined}>Admin</a>}
            </nav>
            <span className="spacer" />
            <a className="privacy-note" href="#about" style={{ textDecoration: 'none' }}><Svg size={14}>{Icon.lock}</Svg>{cloud.session ? 'Saved to your account' : 'Your files stay in this browser'}</a>
            <a className="btn sm" href="#account" aria-current={route === 'account' ? 'page' : undefined}>
              {cloud.session ? (cloud.profile?.first_name || 'Account') : 'Sign in'}
            </a>
          </div>
        </header>
        <main>
          {saveFailed && (
            <div className="banner warn" role="status">This browser is not saving data (private window or storage blocked). Changes will be lost when you close the tab.</div>
          )}
          {viewed && (
            <div className="banner warn" role="status">
              <span className="grow">Viewing {viewed.name}&rsquo;s family, read-only. Nothing you do here is saved.</span>
              <button className="btn sm" type="button" onClick={() => { setViewed(null); location.hash = 'admin'; }}>Close</button>
            </div>
          )}
          <ChooseCopy />
          {screen}
          <Footer />
        </main>
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.route} href={`#${t.route}`} aria-current={tab === t.route ? 'page' : undefined}>
              <Svg size={22} stroke={1.8}>{t.icon}</Svg>{t.label}
            </a>
          ))}
        </nav>
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </AppCtx.Provider>
  );
}

