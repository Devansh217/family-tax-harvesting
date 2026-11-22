import { useState, type DragEvent } from 'react';
import { addMonths } from '../../engine/dates';
import {
  detectKind, FIELD_LABELS, FIELDS, parseStatementLines, parseTablePreview, PdfPasswordError, previewTable,
  type Field, type Mapping, type ParseResult, type TablePreview,
} from '../../parsers';
import { guessAccount, removeImport } from '../../store';
import { importAndDetect } from '../importFlow';
import { useApp } from '../app-context';
import { dateLabel, inr, units } from '../format';
import { Icon, Svg } from '../parts';
import { isPdf, readPdfLines, readSpreadsheet } from '../readers';
import { SampleBanner } from './Home';

type Item =
  | { id: string; name: string; file?: File; status: 'reading' }
  | { id: string; name: string; file: File; status: 'password'; wrong: boolean }
  | { id: string; name: string; status: 'error'; error: string }
  | { id: string; name: string; status: 'pdf'; lines: string[]; result: ParseResult; added?: boolean }
  | { id: string; name: string; status: 'statement'; result: ParseResult; added?: boolean }
  | { id: string; name: string; status: 'table'; preview: TablePreview; mapping: Mapping; added?: boolean };

let seq = 0;

function resultOf(item: Item): ParseResult | null {
  if (item.status === 'pdf' || item.status === 'statement') return item.result;
  if (item.status === 'table') return parseTablePreview(item.preview, item.mapping, item.name);
  return null;
}

/** Which statements to download, best first, with why and where. Shown beside the drop zone. */
const GUIDE: Array<{ title: string; files: Array<{ name: string; level: 'Start here' | 'More exact' | 'Checks the numbers'; why: string; where: string }> }> = [
  {
    title: 'Shares',
    files: [
      { name: 'Holdings file', level: 'Start here', why: 'Every share you hold, with long-term units and average cost: enough for a first plan.', where: 'Zerodha: Console → Portfolio → Holdings → Download (.xlsx). Other brokers: holdings export, or the NSDL / CDSL CAS.' },
      { name: 'Tradebook, every year', level: 'More exact', why: 'The exact date and price of each purchase, so moves use the full room instead of keeping 10% spare.', where: 'Zerodha: Console → Reports → Tradebook, one download per tax year back to your first purchase. Groww, Angel One: trade history.' },
      { name: 'Tax P&L', level: 'Checks the numbers', why: 'Your broker’s own gains booked this year: the app matches its room to them, and reads F&O profit or loss. Use Tax P&L, not the plain P&L report.', where: 'Zerodha: Console → Reports → Tax P&L → this tax year → Download (.xlsx).' },
    ],
  },
  {
    title: 'Mutual funds',
    files: [
      { name: 'Detailed CAS', level: 'Start here', why: 'Every purchase in every fund, on any platform (Zerodha Coin, Groww, ET Money, direct). Without it, funds get no moves.', where: 'MF Central, CAMS or KFintech: ask for the detailed statement from the first purchase till today. It comes by email as a PDF.' },
    ],
  },
];

/** `memberId` picks whose statements these are, when opened from a member's page or a Plan link. */
export function Import({ memberId: picked }: { memberId?: string } = {}) {
  const { state, update, toast, go, asOf, fam } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [memberId, setMemberId] = useState(state.members.some((m) => m.id === picked) ? picked! : state.members[0]?.id ?? '');
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState('');
  const [opening, setOpening] = useState(true);
  const [openingDate, setOpeningDate] = useState(addMonths(asOf, -13));
  const member = state.members.find((m) => m.id === memberId) ?? state.members[0];

  const set = (id: string, next: Item) => setItems((xs) => xs.map((x) => (x.id === id ? next : x)));

  const readPdf = async (id: string, file: File, password?: string) => {
    try {
      const lines = await readPdfLines(file, password);
      set(id, { id, name: file.name, status: 'pdf', lines, result: parseStatementLines(lines) });
    } catch (e) {
      if (e instanceof PdfPasswordError) set(id, { id, name: file.name, file, status: 'password', wrong: e.wrong });
      else set(id, { id, name: file.name, status: 'error', error: `Could not read this PDF: ${(e as Error).message}` });
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const id = `f${++seq}`;
      setItems((xs) => [{ id, name: file.name, file, status: 'reading' }, ...xs]);
      if (isPdf(file)) { void readPdf(id, file); continue; }
      try {
        const read = await readSpreadsheet(file);
        if (read.kind === 'statement') set(id, { id, name: file.name, status: 'statement', result: read.result });
        else set(id, { id, name: file.name, status: 'table', preview: read.preview, mapping: read.preview.mapping });
      } catch (e) {
        set(id, { id, name: file.name, status: 'error', error: (e as Error).message });
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const add = (item: Item, account: string, checkOnly = false) => {
    const r = resultOf(item);
    if (!r || !member) return;
    // The moves as the family last saw them (before this import changes anything) are what a sale is matched against.
    const seen = fam.moves;
    update((s) => importAndDetect(s, {
      memberId: member.id, fileName: item.name, result: r, seen, rules: fam.rules, at: new Date().toISOString(),
      opts: { openingDate: opening ? openingDate : undefined, account: account.trim() || undefined, checkOnly },
    }));
    setItems((xs) => xs.map((x) => (x.id === item.id && (x.status === 'pdf' || x.status === 'table' || x.status === 'statement') ? { ...x, added: true } : x)));
    toast(`Added to ${member.name}`);
  };

  if (state.isSample || state.members.length === 0) {
    return (
      <>
        <SampleBanner />
        <h1>Import statements</h1>
        <div className="sheet empty">
          <p>{state.isSample ? 'Start your own family first, so your files are not mixed with the sample.' : 'Add a family member first.'}</p>
          {!state.isSample && <button className="btn primary" type="button" onClick={() => go('family')}>Add a member</button>}
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Import statements</h1>
      <div className="grid-2">
        <section className="stack">
          <label className="field">Whose statements are these?
            <select value={member?.id} onChange={(e) => setMemberId(e.target.value)}>
              {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <Svg size={28}>{Icon.upload}</Svg>
            <p style={{ fontWeight: 600 }}>Drop files here</p>
            <p className="small muted">CAS PDF, broker trade history or holdings (CSV or .xlsx)</p>
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              Choose files
              <input type="file" multiple hidden accept=".pdf,.csv,.tsv,.txt,.xlsx,application/pdf,text/csv" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          <details>
            <summary>Or paste rows from Excel</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <textarea id="paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the table including its header row, then paste here" />
              <button className="btn sm" type="button" disabled={!paste.trim()} onClick={() => {
                const id = `f${++seq}`;
                const preview = previewTable(paste);
                setItems((xs) => [{ id, name: 'Pasted rows', status: 'table', preview, mapping: preview.mapping }, ...xs]);
                setPaste('');
              }}>Read pasted rows</button>
            </div>
          </details>
        </section>

        <aside className="stack" aria-labelledby="what-h">
          <h2 id="what-h">What to import</h2>
          <p className="small muted">One file is enough for a first plan. Each extra file makes the figures more exact.</p>
          {GUIDE.map((g) => (
            <div key={g.title} className="stack" style={{ gap: 6 }}>
              <h3 style={{ fontSize: 15, margin: 0 }}>{g.title}</h3>
              <div className="sheet">
                {g.files.map((f) => (
                  <div className="li" key={f.name}>
                    <span className="grow stack" style={{ gap: 0 }}>
                      <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><strong>{f.name}</strong><span className={`chip ${f.level === 'Start here' ? 'room' : ''}`} style={{ fontSize: 12, padding: '1px 8px' }}>{f.level}</span></span>
                      <span className="small muted">{f.why}</span>
                      <span className="tiny muted">{f.where}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="tiny muted">CAS PDFs are usually locked with your PAN in capitals. Files are read on this device and never uploaded.</p>
        </aside>
      </div>

      {items.length > 0 && (
        <section className="stack" aria-label="Files">
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} />
            <span>For holdings with no trade history and no long-term count, record them as bought on (estimated, never used for moves)</span>
            <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} style={{ width: 160 }} disabled={!opening} />
          </label>
          {items.map((it) => <ItemCard key={it.id} item={it} memberName={member?.name ?? ''} onChange={(n) => set(it.id, n)} onAdd={(acct, checkOnly) => add(it, acct, checkOnly)}
            hasTradebook={!!member && state.txns.some((t) => t.memberId === member.id && /Trade history/.test(t.source))} onPassword={(pw) => { if (it.status === 'password') { set(it.id, { id: it.id, name: it.name, file: it.file, status: 'reading' }); void readPdf(it.id, it.file, pw); } }} onDismiss={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} />)}
        </section>
      )}

      <section className="stack">
        <h2>Imported so far</h2>
        {state.imports.length === 0 ? <p className="small muted">Nothing yet.</p> : (
          <div className="sheet">
            {[...state.imports].reverse().map((i) => (
              <div className="li" key={i.id}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span>{i.fileName} <span className="muted">· {state.members.find((m) => m.id === i.memberId)?.name}</span></span>
                  <span className="tiny muted">{i.format} · {i.txns} transactions · {i.prices} prices · {dateLabel(i.at.slice(0, 10))}</span>
                </span>
                <button className="btn sm ghost" type="button" style={{ color: 'var(--tax)' }} onClick={() => { update((s) => removeImport(s, i.id)); toast('Import removed'); }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ItemCard({ item, memberName, onChange, onAdd, onPassword, onDismiss, hasTradebook }: {
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
            {item.wrong ? 'That password did not work. Try again' : 'This PDF is locked. Password (usually your PAN in capitals)'}
            <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
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
