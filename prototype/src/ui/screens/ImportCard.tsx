import { useState } from 'react';
import {
  detectKind, FIELD_LABELS, FIELDS, parseTablePreview,
  type Field, type Mapping, type ParseResult, type TablePreview,
} from '../../parsers';
import { guessAccount } from '../../store';
import { dateLabel, inr, units } from '../format';

/** A file being read or added. `notes` are the wrong-file notes (`fileNotes`) once it has been added. */
export type Item =
  | { id: string; name: string; file?: File; status: 'reading' }
  | { id: string; name: string; file: File; status: 'password'; wrong: boolean }
  | { id: string; name: string; status: 'error'; error: string }
  | { id: string; name: string; status: 'pdf'; lines: string[]; result: ParseResult; added?: boolean; notes?: string[] }
  | { id: string; name: string; status: 'statement'; result: ParseResult; added?: boolean; notes?: string[] }
  | { id: string; name: string; status: 'table'; preview: TablePreview; mapping: Mapping; added?: boolean; notes?: string[] };

let seq = 0;
/** A fresh id for an item. */
export const nextItemId = () => `f${++seq}`;

export function resultOf(item: Item): ParseResult | null {
  if (item.status === 'pdf' || item.status === 'statement') return item.result;
  if (item.status === 'table') return parseTablePreview(item.preview, item.mapping, item.name);
  return null;
}

/** One file's card: password unlock, column mapping, preview, account label, "Also import its exits", Add, and its notes. */
export function ItemCard({ item, memberName, onChange, onAdd, onPassword, onDismiss, hasTradebook }: {
  item: Item; memberName: string; onChange: (i: Item) => void; onAdd: (account: string, checkOnly: boolean) => void; onPassword: (pw: string) => void; onDismiss: () => void;
  hasTradebook: boolean;
}) {
  const [pw, setPw] = useState('');
  const r = resultOf(item);
  const [account, setAccount] = useState<string | null>(null);
  const acct = account ?? (r ? guessAccount(item.name, r.format) : '');
  const hasFolios = !!r?.txns.some((t) => t.account);
  const isPnl = !!r?.brokerSummary;
  const [importExits, setImportExits] = useState<boolean | null>(null);
  const exits = !hasTradebook && (importExits ?? true);
  const added = (item.status === 'pdf' || item.status === 'table' || item.status === 'statement') && item.added;

  return (
    <article className="sheet pad stack" aria-label={item.name}>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{item.name}</strong>
          {r && <span className="chip">{r.format.split(' · ')[0]}</span>}
          {added && <span className="chip room">Added</span>}
        </span>
        <button className="btn sm ghost" type="button" onClick={onDismiss}>Close</button>
      </div>

      {item.status === 'reading' && <p className="small muted">Reading…</p>}
      {item.status === 'error' && <p className="small bad">{item.error}</p>}
      {item.status === 'password' && (
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); onPassword(pw); }}>
          <label className="field grow" style={{ minWidth: 200 }}>
            {item.wrong ? 'That password did not work. Try again' : 'This PDF is locked. Password'}
            <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            <span className="tiny muted">From MF Central, CAMS or KFintech: the password you chose. NSDL / CDSL CAS: your PAN in capitals.</span>
          </label>
          <button className="btn primary" type="submit" style={{ alignSelf: 'flex-end' }}>Unlock</button>
        </form>
      )}

      {item.status === 'table' && (
        <details open={detectKind(item.mapping) === 'unknown'}>
          <summary>Columns ({detectKind(item.mapping) === 'trades' ? 'trade history' : detectKind(item.mapping) === 'holdings' ? 'holdings' : 'not recognised'}) · check or change</summary>
          <div className="form-grid" style={{ marginTop: 10 }}>
            {FIELDS.map((f: Field) => (
              <label key={f} className="field">{FIELD_LABELS[f]}
                <select value={item.mapping[f]} onChange={(e) => onChange({ ...item, mapping: { ...item.mapping, [f]: Number(e.target.value) } })}>
                  <option value={-1}>Not in file</option>
                  {item.preview.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="tablebox" style={{ marginTop: 10 }}>
            <table>
              <thead><tr>{item.preview.header.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
              <tbody>{item.preview.rows.slice(item.preview.headerIdx + 1, item.preview.headerIdx + 4).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      )}

      {r && (
        <>
          <p className="small">
            Found <strong>{r.txns.length}</strong> transactions{r.txns.length > 0 && <> from {dateLabel(r.txns.reduce((a, t) => (t.date < a ? t.date : a), r.txns[0]!.date))} to {dateLabel(r.txns.reduce((a, t) => (t.date > a ? t.date : a), r.txns[0]!.date))}</>}
            {' '}and <strong>{r.prices.length}</strong> prices across <strong>{new Set([...r.txns.map((t) => t.isin), ...r.prices.map((p) => p.isin)]).size}</strong> securities.
            {r.skipped > 0 && <span className="muted"> {r.skipped} rows skipped.</span>}
          </p>
          {r.warnings.length > 0 && <ul className="warnlist">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {r.txns.length > 0 && (
            <details>
              <summary>Preview transactions</summary>
              <div className="tablebox" style={{ marginTop: 8 }}>
                <table>
                  <thead><tr><th scope="col">Security</th><th scope="col">Date</th><th scope="col">Side</th><th scope="col">Units</th><th scope="col">Amount</th></tr></thead>
                  <tbody>{r.txns.slice(0, 12).map((t, i) => <tr key={i}><td>{t.name}</td><td>{dateLabel(t.date)}</td><td>{t.side}</td><td>{units(t.qty)}</td><td>{inr(t.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          )}
          {item.status === 'pdf' && (
            <details>
              <summary>Show text read from the PDF</summary>
              <p className="tiny muted" style={{ marginTop: 6 }}>Shown only to you. If transactions are missing, these lines show how the statement is laid out.</p>
              <pre className="lines">{item.lines.slice(0, 200).join('\n')}</pre>
            </details>
          )}
          {isPnl && hasTradebook && (
            <p className="small muted">Sales come from {memberName}&rsquo;s tradebooks, so this report is used to check the year&rsquo;s gains and for F&amp;O, not as trades.</p>
          )}
          {isPnl && !hasTradebook && (
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={exits} onChange={(e) => setImportExits(e.target.checked)} disabled={added} />
              <span>Also import its exits as trades. If you import tradebooks for this account later, they replace these exits.</span>
            </label>
          )}
          {added && item.notes && item.notes.length > 0 && (
            <div className="stack" style={{ gap: 6 }} aria-live="polite">
              {item.notes.map((n, i) => <p key={i} className="note amber">{n}</p>)}
            </div>
          )}
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ width: 220 }}>
              {hasFolios ? 'Account (folios are read from the CAS)' : 'Demat account or platform'}
              <input value={acct} placeholder="e.g. Zerodha" onChange={(e) => setAccount(e.target.value)} disabled={added} />
            </label>
            <button className="btn primary" type="button" disabled={added || (r.txns.length === 0 && r.prices.length === 0)} onClick={() => onAdd(acct, isPnl && !exits)}>
              {added ? `Added to ${memberName}` : `Add to ${memberName}`}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
