import { snapshotOf } from '../market';
import { useApp } from '../app-context';
import { dateLabel, inr } from '../format';

function Delta({ label, now, before }: { label: string; now: number; before: number | null }) {
  const d = before == null ? null : now - before;
  return (
    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
      <span className="tiny muted">{label}</span>
      <span className="fig" style={{ fontSize: 17 }}>{inr(now)}</span>
      {d != null && <span className={`tiny fig ${d > 0 ? 'good' : d < 0 ? 'bad' : 'muted'}`}>{d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${inr(Math.abs(d))}`}</span>}
    </div>
  );
}

/** What moved between the previous close and the latest close, plus the daily history kept in this browser. */
export function SinceClose() {
  const { state, fam, famPrev, market } = useApp();
  if (state.members.length === 0) return null;
  if (state.isSample) {
    return <p className="tiny muted">The sample family uses fixed prices. Your own family is re-priced every weekday evening at the market close.</p>;
  }
  if (!market.latest) {
    return <p className="tiny muted">Closing prices are not available right now, so holdings use the prices from your statements.</p>;
  }
  const now = snapshotOf(fam, market.latest.date);
  const before = famPrev && market.previous ? snapshotOf(famPrev, market.previous.date) : null;
  const history = [...state.history].reverse().slice(0, 10);
  return (
    <section className="sheet pad stack" aria-labelledby="close-h">
      <div className="row-between">
        <h2 id="close-h">{before ? `Since the close on ${dateLabel(before.date, false)}` : `At the close on ${dateLabel(now.date, false)}`}</h2>
        <span className="tiny muted">Prices: close of {dateLabel(now.date)} · {market.latest.source}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <Delta label="Family holdings" now={now.value} before={before?.value ?? null} />
        <Delta label="Long-term gains" now={now.ltGain} before={before?.ltGain ?? null} />
        <Delta label="Gains the plan can make tax-free" now={now.taxFreePossible} before={before?.taxFreePossible ?? null} />
      </div>
      {!before && <p className="tiny muted">Changes show from the next trading day, once there are two closes to compare.</p>}
      {history.length > 1 && (
        <details>
          <summary>Daily history ({history.length} closes)</summary>
          <div className="tablebox" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th scope="col">Close</th><th scope="col">Holdings</th><th scope="col">Long-term gains</th><th scope="col">Free room</th><th scope="col">Plan makes tax-free</th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.date}><td>{dateLabel(h.date)}</td><td>{inr(h.value)}</td><td>{inr(h.ltGain)}</td><td>{inr(h.freeRoom)}</td><td>{inr(h.taxFreePossible)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
