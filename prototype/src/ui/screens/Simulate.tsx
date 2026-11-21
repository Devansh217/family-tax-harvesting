import { useMemo, useState } from 'react';
import { simulateSale, unitStep } from '../../engine/family';
import { QTY_SCALE } from '../../engine/types';
import { useApp } from '../app-context';
import { dateLabel, inr, inrShort, units } from '../format';
import { longTermMonthsFor } from '../../engine/tax';
import { nextLongTerm, sharePicks } from '../simulate';
import { uid } from '../../store';
import { Avatar, Disclaimer } from '../parts';

export function Simulate() {
  const { fam, asOf, indexOf, state, update, toast, nameOf } = useApp();
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
  // What to sell: typed rupees, or an exact number of units from a quick pick. Starts at "All" of the largest holding.
  const [pick, setPick] = useState<{ isin: string; text?: string; qty?: number } | null>(null);
  const opt = options.find((o) => o.isin === isin) ?? options[0];
  if (!opt) {
    return <div className="sheet empty"><h1>Simulate a sale</h1><p>Import holdings with current prices to try a sale.</p><a className="btn" href="#import">Import statements</a></div>;
  }
  const sec = fam.securities.get(opt.isin)!;
  const step = unitStep(sec);
  const price = sec.price ?? 0;
  const holders = fam.members.filter((v) => v.holdings.some((h) => h.isin === opt.isin));
  const sellable = holders.map((v) => ({ v, qty: simulateSale(fam, v.member.id, opt.isin, 0, asOf, fam.rules).available }));
  const maxQty = Math.max(0, ...sellable.map((x) => x.qty));
  const valueOf = (qty: number) => Math.round((price * qty) / QTY_SCALE);
  const picks = sharePicks(maxQty, price, step);
  const mine = pick?.isin === opt.isin ? pick : { isin: opt.isin, qty: maxQty };
  const typed = mine.text != null ? Math.max(0, Math.round(Number(mine.text.replace(/[,₹\s]/g, '')) * 100) || 0) : null;
  const qtyWanted = mine.qty ?? (price ? Math.floor((typed! * QTY_SCALE) / price / step) * step : 0);
  const amount = typed ?? valueOf(qtyWanted);
  const tooBig = qtyWanted > maxQty && maxQty > 0;
  const choose = (qty: number) => setPick({ isin: opt.isin, qty });

  const rows = holders.map((v) => ({ v, r: simulateSale(fam, v.member.id, opt.isin, qtyWanted, asOf, fam.rules) }));
  const eligible = rows.filter((x) => x.r.available >= qtyWanted && qtyWanted > 0);
  const best = eligible.reduce<(typeof rows)[number] | null>((b, x) => (!b || x.r.extraTax < b.r.extraTax || (x.r.extraTax === b.r.extraTax && x.r.roomUsed < b.r.roomUsed) ? x : b), null);

  return (
    <>
      <h1>Simulate a sale</h1>
      <div className="grid-2">
        <section className="stack">
          <label className="field">Holding
            <select value={opt.isin} onChange={(e) => { setIsin(e.target.value); setPick(null); }}>
              {options.map((o) => <option key={o.isin} value={o.isin}>{o.name} · held by {o.holders} · {inrShort(o.value)}</option>)}
            </select>
          </label>
          <label className="field">Amount to sell (₹)
            <input inputMode="numeric" value={mine.text ?? String(Math.round(amount / 100))} onChange={(e) => setPick({ isin: opt.isin, text: e.target.value })} style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 700, padding: '8px 12px' }} />
          </label>
          <div className="seg-ctl" role="group" aria-label="Share of the largest holding">
            {picks.map((p) => (
              <button key={p.label} type="button" aria-pressed={mine.text == null && qtyWanted === p.qty} onClick={() => choose(p.qty)}>
                {p.label} <span className="tiny muted">· {inrShort(p.value)}</span>
              </button>
            ))}
          </div>
          {holders.length > 1 && <p className="tiny muted" style={{ margin: 0 }}>Shares of the largest holding one member has ({inr(valueOf(maxQty))}).</p>}
          <p className="small muted">At {inr(price)} per unit, that is about {(qtyWanted / QTY_SCALE).toLocaleString('en-IN')} units, sold oldest first.</p>
        </section>

        <section className="stack" aria-live="polite">
          <p className="note" style={{ background: 'var(--room-soft)', borderColor: 'transparent', color: 'var(--ink)', fontSize: 15, lineHeight: 1.5 }}>
            {best
              ? best.r.extraTax === 0
                ? <>Sell from <strong>{best.v.member.name}</strong>&rsquo;s units: no tax, using {inr(best.r.roomUsed)} of room.</>
                : <>Sell from <strong>{best.v.member.name}</strong>&rsquo;s units: {inr(best.r.extraTax)} tax, the lowest in the family.</>
              : qtyWanted === 0 ? 'Enter an amount to compare.'
              : tooBig ? <>The most one member holds is {inr(valueOf(maxQty))}. <button className="btn sm ghost" type="button" style={{ minHeight: 0, padding: 0 }} onClick={() => choose(maxQty)}>Use {inr(valueOf(maxQty))}</button></>
              : 'No single member holds this much.'}
          </p>
          <h2>Tax if sold from</h2>
          {rows.map(({ v, r }) => {
            const ok = r.available >= qtyWanted && qtyWanted > 0;
            const isBest = best?.v === v;
            const own = v.holdings.filter((h) => h.isin === opt.isin);
            // The ₹1.25 L room is for equity only; other types never get it, so the note would mislead there.
            const equity = own.some((h) => h.taxType === 'equity' && longTermMonthsFor(h.taxType, h.listed, fam.rules) != null);
            const turns = equity ? nextLongTerm(own.flatMap((h) => h.lots), asOf) : null;
            return (
              <div key={v.member.id} className="sheet li" style={{ border: isBest ? '2px solid var(--ink)' : undefined, opacity: ok ? 1 : 0.6 }}>
                <Avatar member={v.member} index={indexOf(v.member.id)} />
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="row" style={{ gap: 8 }}><strong>{v.member.name}</strong>{isBest && <span className="chip ink">Lowest tax</span>}</span>
                  <span className="tiny muted">
                    {ok ? `${inr(r.gain)} gain (${inr(r.ltGain)} long, ${inr(r.stGain)} short) · uses ${inr(r.roomUsed)} of room` : `Holds only ${inr(valueOf(r.available))}`}
                  </span>
                  {ok && equity && r.stGain > 0 && (
                    <span className="tiny muted">
                      {r.ltGain > 0 ? 'The short-term part gets' : 'Short-term gain gets'} no tax-free room: the ₹1.25 L covers long-term gains only.
                      {turns && ` ${units(turns.qty)} units turn long-term on ${dateLabel(turns.date)}.`}
                    </span>
                  )}
                  {r.available > 0 && qtyWanted !== r.available && (
                    <button className="btn sm ghost" type="button" style={{ minHeight: 24, padding: 0, alignSelf: 'flex-start' }} onClick={() => choose(r.available)}>
                      All of {v.member.name}&rsquo;s units ({inrShort(valueOf(r.available))})
                    </button>
                  )}
                </span>
                <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                  <span className={`fig ${!ok ? 'muted' : r.extraTax === 0 ? 'good' : 'bad'}`} style={{ fontSize: 18 }}>{ok ? inr(r.extraTax) : '—'}</span>
                  {ok && (
                    <button className="btn sm ghost" type="button" style={{ minHeight: 28, padding: 0 }} onClick={() => {
                      update((s) => ({ ...s, plannedSales: [...s.plannedSales, { id: uid('ps'), memberId: v.member.id, isin: opt.isin, qty: qtyWanted }] }));
                      toast(`Planned: ${v.member.name} sells ${inrShort(amount)} of ${opt.name}`);
                    }}>Plan this sale</button>
                  )}
                </span>
              </div>
            );
          })}
        </section>
      </div>
      {state.plannedSales.length > 0 && (
        <section className="stack">
          <h2>Planned sales this year</h2>
          <div className="sheet">
            {state.plannedSales.map((p) => (
              <div className="li" key={p.id}>
                <span className="grow">{nameOf(p.memberId)}: {units(p.qty)} units of {fam.securities.get(p.isin)?.name ?? p.isin}</span>
                <button className="btn sm ghost" type="button" style={{ color: 'var(--tax)' }} onClick={() => update((s) => ({ ...s, plannedSales: s.plannedSales.filter((x) => x.id !== p.id) }))}>Remove</button>
              </div>
            ))}
          </div>
          <p className="tiny muted">Planned sales use room first, so the plan and every member&rsquo;s free room already account for them.</p>
        </section>
      )}
      <p className="tiny muted">Includes 4% cess; surcharge not modelled. Tax is what this sale adds to gains already booked and planned this year.</p>
      <Disclaimer />
    </>
  );
}
