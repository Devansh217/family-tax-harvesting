import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { daysBetween, todayISO } from '../engine/dates';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import { sampleState } from '../sample';
import { loadState, saveState, type AppState } from '../store';
import { AppCtx, type Ctx } from './app-context';
import { addSnapshot, loadMarket, snapshotOf, withPrices, type Market } from './market';
import { Svg, Icon } from './parts';
import { Home } from './screens/Home';
import { MemberScreen } from './screens/Member';
import { Plan } from './screens/Plan';
import { Simulate } from './screens/Simulate';
import { Family } from './screens/Family';
import { Import } from './screens/Import';
import { About, Footer } from './screens/About';

const TABS = [
  { route: 'home', label: 'Home', icon: Icon.home },
  { route: 'plan', label: 'Plan', icon: Icon.plan },
  { route: 'simulate', label: 'Simulate', icon: Icon.sim },
  { route: 'family', label: 'Family', icon: Icon.family },
  { route: 'import', label: 'Import', icon: Icon.upload },
];

const readRoute = () => (location.hash.replace(/^#/, '') || 'home');

export function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? sampleState());
  const [route, setRoute] = useState(readRoute);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const timer = useRef<number>();
  const asOf = todayISO();

  useEffect(() => setSaveFailed(!saveState(state)), [state]);
  useEffect(() => {
    const on = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const [market, setMarket] = useState<Market>({ latest: null, previous: null });
  useEffect(() => { void loadMarket().then(setMarket); }, []);

  // The sample family keeps its own made-up prices; real families are re-priced at the latest close.
  const live = !state.isSample;
  const fam = useMemo(
    () => computeFamily(live ? { ...state, securities: withPrices(state.securities, market.latest) } : state, asOf, FY_2026_27),
    [state, asOf, market, live],
  );
  const famPrev = useMemo(
    () => (live && market.previous ? computeFamily({ ...state, securities: withPrices(state.securities, market.previous) }, asOf, FY_2026_27) : null),
    [state, asOf, market, live],
  );

  useEffect(() => {
    if (!live || !market.latest || state.members.length === 0) return;
    const snap = snapshotOf(fam, market.latest.date);
    const prev = state.history.find((h) => h.date === snap.date);
    if (prev && JSON.stringify(prev) === JSON.stringify(snap)) return;
    setState((s) => ({ ...s, history: addSnapshot(s.history, snap) }));
  }, [fam, market.latest, live, state.history, state.members.length]);
  const toast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const ctx: Ctx = {
    state, fam, famPrev, market, asOf, toast,
    update: (fn) => setState((s) => fn(s)),
    go: (r) => { location.hash = r; },
    indexOf: (id) => Math.max(0, state.members.findIndex((m) => m.id === id)),
    nameOf: (id) => state.members.find((m) => m.id === id)?.name ?? 'Unknown',
  };

  const tab = route.startsWith('member-') ? 'home' : route;
  const days = daysBetween(asOf, FY_2026_27.end);
  let screen;
  if (route.startsWith('member-')) screen = <MemberScreen id={route.slice(7)} />;
  else if (route === 'plan') screen = <Plan />;
  else if (route === 'simulate') screen = <Simulate />;
  else if (route === 'family') screen = <Family />;
  else if (route === 'import') screen = <Import />;
  else if (route === 'about') screen = <About />;
  else screen = <Home days={days} />;

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
            </nav>
            <span className="spacer" />
            <a className="privacy-note" href="#about" style={{ textDecoration: 'none' }}><Svg size={14}>{Icon.lock}</Svg>Your files stay in this browser</a>
          </div>
        </header>
        <main>
          {saveFailed && (
            <div className="banner warn" role="status">This browser is not saving data (private window or storage blocked). Changes will be lost when you close the tab.</div>
          )}
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

