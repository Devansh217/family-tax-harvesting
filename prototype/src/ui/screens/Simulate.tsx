import { useMemo, useState } from 'react';
import { simulateSale } from '../../engine/family';
import { QTY_SCALE } from '../../engine/types';
import { useApp } from '../app-context';
import { inr, inrShort } from '../format';
import { Avatar, Disclaimer } from '../parts';

export function Simulate() {
  const { fam, asOf, indexOf } = useApp();
  const options = useMemo(() => {
    const by = new Map<string, { isin: string; name: string; holders: number; value: number }>();
    for (const v of fam.members) for (const h of v.holdings) {
      if (h.price == null || h.value == null) continue;
      const o = by.get(h.isin) ?? { isin: h.isin, name: h.name, holders: 0, value: 0 };
      o.holders++;
      o.value += h.value;
      by.set(h.isin, o);
    }
    return [...by.values()].sort((a, b) => b.holders - a.holders || b.value - a.value);
  }, [fam]);

  const [isin, setIsin] = useState(options[0]?.isin ?? '');
  const [amountText, setAmountText] = useState('300000');
  const opt = options.find((o) => o.isin === isin) ?? options[0];
  if (!opt) {
    return <div className="sheet empty"><h1>Simulate a sale</h1><p>Import holdings with current prices to try a sale.</p><a className="btn" href="#import">Import statements</a></div>;
  }
  const sec = fam.securities.get(opt.isin)!;
  const amount = Math.max(0, Math.round(Number(amountText.replace(/[,₹\s]/g, '')) * 100) || 0);
  const qtyWanted = sec.price ? Math.floor((amount / sec.price) * (sec.kind === 'equity_mf' ? 1000 : 1)) * (QTY_SCALE / (sec.kind === 'equity_mf' ? 1000 : 1)) : 0;

  const rows = fam.members
    .filter((v) => v.holdings.some((h) => h.isin === opt.isin))
    .map((v) => ({ v, r: simulateSale(fam, v.member.id, opt.isin, qtyWanted, asOf, fam.rules) }));
  const eligible = rows.filter((x) => x.r.available >= qtyWanted && qtyWanted > 0);
  const best = eligible.reduce<(typeof rows)[number] | null>((b, x) => (!b || x.r.extraTax < b.r.extraTax || (x.r.extraTax === b.r.extraTax && x.r.roomUsed < b.r.roomUsed) ? x : b), null);
  const presets = [100000, 300000, 500000, 1000000];

  return (
    <>
      <h1>Simulate a sale</h1>
      <div className="grid-2">
        <section className="stack">
          <label className="field">Holding
            <select value={opt.isin} onChange={(e) => setIsin(e.target.value)}>
              {options.map((o) => <option key={o.isin} value={o.isin}>{o.name} · held by {o.holders} · {inrShort(o.value)}</option>)}
            </select>
          </label>
          <label className="field">Amount to sell (₹)
            <input inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 700, padding: '8px 12px' }} />
          </label>
          <div className="seg-ctl" role="group" aria-label="Preset amounts">
            {presets.map((p) => <button key={p} type="button" aria-pressed={amount === p * 100} onClick={() => setAmountText(String(p))}>{inrShort(p * 100)}</button>)}
          </div>
          <p className="small muted">At {inr(sec.price ?? 0)} per unit, that is about {(qtyWanted / QTY_SCALE).toLocaleString('en-IN')} units, sold oldest first.</p>
        </section>

        <section className="stack" aria-live="polite">
          <p className="note" style={{ background: 'var(--room-soft)', borderColor: 'transparent', color: 'var(--ink)', fontSize: 15, lineHeight: 1.5 }}>
            {best
              ? best.r.extraTax === 0
                ? <>Sell from <strong>{best.v.member.name}</strong>&rsquo;s units: no tax, using {inr(best.r.roomUsed)} of room.</>
                : <>Sell from <strong>{best.v.member.name}</strong>&rsquo;s units: {inr(best.r.extraTax)} tax, the lowest in the family.</>
              : qtyWanted === 0 ? 'Enter an amount to compare.' : 'No single member holds this much.'}
          </p>
          <h2>Tax if sold from</h2>
          {rows.map(({ v, r }) => {
            const ok = r.available >= qtyWanted && qtyWanted > 0;
            const isBest = best?.v === v;
            return (
              <div key={v.member.id} className="sheet li" style={{ border: isBest ? '2px solid var(--ink)' : undefined, opacity: ok ? 1 : 0.6 }}>
                <Avatar member={v.member} index={indexOf(v.member.id)} />
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="row" style={{ gap: 8 }}><strong>{v.member.name}</strong>{isBest && <span className="chip ink">Lowest tax</span>}</span>
                  <span className="tiny muted">
                    {ok ? `${inr(r.gain)} gain (${inr(r.ltGain)} long, ${inr(r.stGain)} short) · uses ${inr(r.roomUsed)} of room` : `Holds only ${inr(Math.round(((sec.price ?? 0) * r.available) / QTY_SCALE))}`}
                  </span>
                </span>
                <span className={`fig ${!ok ? 'muted' : r.extraTax === 0 ? 'good' : 'bad'}`} style={{ fontSize: 18 }}>{ok ? inr(r.extraTax) : '—'}</span>
              </div>
            );
          })}
        </section>
      </div>
      <p className="tiny muted">Includes 4% cess; surcharge not modelled. Tax is what this sale adds to gains already booked this year.</p>
      <Disclaimer />
    </>
  );
}
