import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { addMonths } from '../../engine/dates';
import { parsePdfStatement, PdfPasswordError, previewTable, type ParseResult } from '../../parsers';
import { removeImport, type AppState, type ImportOptions } from '../../store';
import { importAndDetect } from '../importFlow';
import { useApp } from '../app-context';
import { dateLabel, inr, possessive } from '../format';
import {
  familyGuide, familyRow, fileNotes, guideSummary, memberGuide, readLine, successDiff, UNCHANGED,
  type AccountGuide, type GuideStep, type GuideSummary, type Success,
} from '../importGuide';
import { Icon, Svg } from '../parts';
import { importHref } from '../plan';
import { isPdf, readPdf as readPdfFile, readSpreadsheet } from '../readers';
import { SampleBanner } from './Home';
import { ItemCard, nextItemId, resultOf, type Item } from './ImportCard';

/**
 * `#import` shows the family table; `#import-<memberId>` (`importHref`, used by the Plan's gap links) that member's
 * checklist. Every step and tick is worked out from the saved family on each render (`ui/importGuide.ts`).
 */
export function Import({ memberId }: { memberId?: string } = {}) {
  const { state, go } = useApp();

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

  const member = memberId ? state.members.find((m) => m.id === memberId) : undefined;
  // A new member starts a fresh checklist: files read for one member are never added to another.
  return member ? <MemberChecklist key={member.id} memberId={member.id} /> : <FamilyTable />;
}

/** Possessive for running text: "your" for You, else "Asha's". */
const whose = (name: string) => (possessive(name) === 'Your' ? 'your' : possessive(name));

const STOP = 'Stop here, show my plan';

function FamilyTable() {
  const { state, update, toast, go, asOf, fam } = useApp();
  const guide = useMemo(() => familyGuide(state, fam, asOf), [state, fam, asOf]);
  const open = (id: string) => go(importHref(id).slice(1));

  return (
    <>
      <h1>Import statements</h1>
      <p className="muted">One file is enough for a first plan. Open a member to see which file comes next.</p>
      <div className="sheet">
        <table className="famtable" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Member</th>
              <th role="columnheader" scope="col">Holdings</th>
              <th role="columnheader" scope="col">Tax P&amp;L</th>
              <th role="columnheader" scope="col">Tradebooks</th>
              <th role="columnheader" scope="col">Moves use</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {guide.members.map((g) => {
              const row = familyRow(g);
              const stale = g.accounts.filter((a) => a.stale);
              return (
                <tr role="row" key={g.memberId} onClick={() => open(g.memberId)}>
                  <td role="cell" className="who"><div className="who-in">
                    <button type="button" className="famrow-btn" aria-label={`${g.name}: open checklist`} onClick={(e) => { e.stopPropagation(); open(g.memberId); }}>
                      <span>{g.name}</span><Svg size={16}>{Icon.arrow}</Svg>
                    </button>
                    {stale.map((a) => (
                      <span key={a.key} className="note amber tight">{stale.length > 1 || g.accounts.length > 1 ? `${accountTitle(a)}: ` : ''}Newest data from {dateLabel(a.newest!)}</span>
                    ))}
                  </div></td>
                  <Cell label="Holdings" text={row.holdings} />
                  <Cell label="Tax P&L" text={row.pnl} />
                  <Cell label="Tradebooks" text={row.tradebooks} />
                  <Cell label="Moves use" text={row.usable} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stack">
        {guide.pct != null && <p>Moves use <strong className="fig">{guide.pct}%</strong> of the family's holdings by value</p>}
        <div><button className="btn primary" type="button" onClick={() => go('plan')}>{STOP}</button></div>
      </div>

      <section className="stack" aria-labelledby="all-files-h">
        <h2 id="all-files-h">All files</h2>
        <FileList imports={[...state.imports].reverse()} nameOf={(id) => state.members.find((m) => m.id === id)?.name}
          onRemove={(id) => { update((s) => removeImport(s, id)); toast('Import removed'); }} />
      </section>
    </>
  );
}

/** A family table cell, labelled for the stacked phone layout; words that ask for something stand out. */
function Cell({ label, text }: { label: string; text: string }) {
  const cls = text === 'Next' || text === 'Start' ? 'chip plan' : text === 'Refresh' ? 'chip time' : text.startsWith('✓') ? 'good' : 'muted';
  return <td role="cell" data-label={label}><span className={cls}>{text}</span></td>;
}

function FileList({ imports, nameOf, onRemove }: { imports: AppState['imports']; nameOf?: (memberId: string) => string | undefined; onRemove: (id: string) => void }) {
  if (imports.length === 0) return <p className="small muted">Nothing yet.</p>;
  return (
    <div className="sheet">
      {imports.map((i) => (
        <div className="li" key={i.id}>
          <span className="grow stack" style={{ gap: 0 }}>
            <span style={{ overflowWrap: 'anywhere' }}>{i.fileName}{nameOf && <span className="muted"> · {nameOf(i.memberId)}</span>}</span>
            <span className="tiny muted">{i.format} · {i.txns} transactions · {i.prices} prices · {dateLabel(i.at.slice(0, 10))}</span>
          </span>
          <button className="btn sm ghost" type="button" style={{ color: 'var(--tax)' }} onClick={() => onRemove(i.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}

/** An added file waiting for the family to recompute, so its success card and notes can be worked out. */
interface Pending {
  itemId: string; fileName: string;
  /** The guide summary and the saved family before the file was added. */
  before: GuideSummary; beforeState: AppState;
  /** Import ids present before: the new one is the import present after but not before. */
  known: Set<string>;
  parsed: { result: ParseResult; opts: ImportOptions };
}

/** Notes that say the file changed nothing: with only these, no success card. */
const changedNothing = (note: string) => /Nothing new|changes nothing/.test(note);

const accountTitle = (a: Pick<AccountGuide, 'broker' | 'label'>) => {
  if (a.broker === 'Mutual funds') return 'Mutual funds';
  if (a.broker === 'Other') return a.label || 'Other broker';
  return a.label && a.label.toLowerCase() !== a.broker.toLowerCase() ? `${a.broker} · ${a.label}` : a.broker;
};

function MemberChecklist({ memberId }: { memberId: string }) {
  const { state, update, toast, go, asOf, fam } = useApp();
  const member = state.members.find((m) => m.id === memberId)!;
  const g = useMemo(() => memberGuide(state, fam, memberId, asOf), [state, fam, memberId, asOf]);
  const [items, setItems] = useState<Item[]>([]);
  const [paste, setPaste] = useState('');
  const [opening, setOpening] = useState(true);
  const [openingDate, setOpeningDate] = useState(addMonths(asOf, -13));
  const [pending, setPending] = useState<Pending[]>([]);
  const [success, setSuccess] = useState<Success | null>(null);

  const set = (id: string, next: Item) => setItems((xs) => xs.map((x) => (x.id === id ? next : x)));

  const readPdf = async (id: string, file: File, password?: string) => {
    try {
      const { lines, words } = await readPdfFile(file, password);
      set(id, { id, name: file.name, status: 'pdf', lines, result: parsePdfStatement(lines, words) });
    } catch (e) {
      if (e instanceof PdfPasswordError) set(id, { id, name: file.name, file, status: 'password', wrong: e.wrong });
      else set(id, { id, name: file.name, status: 'error', error: `Could not read this PDF: ${(e as Error).message}` });
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const id = nextItemId();
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

  const add = (item: Item, account: string, checkOnly = false) => {
    const r = resultOf(item);
    if (!r) return;
    // The moves as the family last saw them (before this import changes anything) are what a sale is matched against.
    const seen = fam.moves;
    const opts: ImportOptions = { openingDate: opening ? openingDate : undefined, account: account.trim() || undefined, checkOnly };
    setPending((ps) => [...ps, {
      itemId: item.id, fileName: item.name, before: guideSummary(state, fam, memberId, asOf), beforeState: state,
      known: new Set(state.imports.map((i) => i.id)), parsed: { result: r, opts },
    }]);
    setSuccess(null);
    update((s) => importAndDetect(s, { memberId, fileName: item.name, result: r, seen, rules: fam.rules, at: new Date().toISOString(), opts }));
    setItems((xs) => xs.map((x) => (x.id === item.id && (x.status === 'pdf' || x.status === 'table' || x.status === 'statement') ? { ...x, added: true } : x)));
    toast(`Read and added to ${member.name}`);
  };

  // Once the family has recomputed with the new import in it, compare before and after for the card and the notes.
  useEffect(() => {
    if (!pending.length) return;
    const done: string[] = [];
    for (const p of pending) {
      const imp = state.imports.find((i) => !p.known.has(i.id) && i.memberId === memberId && i.fileName === p.fileName);
      if (!imp) continue;
      done.push(p.itemId);
      const notes = fileNotes(p.beforeState, state, imp.id, fam, asOf, p.parsed);
      const s = successDiff(p.before, guideSummary(state, fam, memberId, asOf), readLine(p.parsed.result), p.parsed.result.brokerSummary?.broker);
      setItems((xs) => xs.map((x) => (x.id === p.itemId && (x.status === 'pdf' || x.status === 'table' || x.status === 'statement') ? { ...x, notes } : x)));
      setSuccess(notes.length > 0 && notes.every(changedNothing) ? null : s);
    }
    if (done.length) setPending((ps) => ps.filter((p) => !done.includes(p.itemId)));
  }, [fam, state, pending, memberId, asOf]);

  const hasTradebook = state.txns.some((t) => t.memberId === memberId && /Trade history/.test(t.source));
  const files = state.imports.filter((i) => i.memberId === memberId).reverse();
  const here = importHref(memberId);

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1>Import statements</h1>
        <a className="link-action small" href="#import" style={{ alignSelf: 'flex-start' }}>← Family</a>
      </div>
      <h2 className="member-h">{member.name}</h2>

      {/* Mounted empty, so screen readers announce the card when it lands in it. */}
      <div className="live" role="status" aria-label="File added">{success && <SuccessCard s={success} />}</div>

      {items.length > 0 && (
        <section className="stack" aria-label="Files">
          {items.map((it) => <ItemCard key={it.id} item={it} memberName={member.name} onChange={(n) => set(it.id, n)} onAdd={(acct, checkOnly) => add(it, acct, checkOnly)}
            hasTradebook={hasTradebook} onPassword={(pw) => { if (it.status === 'password') { set(it.id, { id: it.id, name: it.name, file: it.file, status: 'reading' }); void readPdf(it.id, it.file, pw); } }} onDismiss={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} />)}
        </section>
      )}

      {g.first ? <FirstStep onFiles={addFiles} /> : g.accounts.map((a) => <AccountSection key={a.key} a={a} onFiles={addFiles} />)}

      {/* Always somewhere to add a file, even with no step next: a second broker, a fund statement, a newer file. */}
      {!g.first && (
        <section className="sheet pad stack" aria-labelledby="add-more-h">
          <h3 id="add-more-h">Add another file</h3>
          <p className="small muted">Another broker&rsquo;s file, a mutual fund statement or a newer download. Whichever step it fills ticks.</p>
          <DropZone onFiles={addFiles} compact />
        </section>
      )}

      {(g.cushion.length > 0 || g.otherGaps.length > 0) && (
        <div className="stack" style={{ gap: 8 }}>
          {g.cushion.map((c) => (
            <p key={c.account} className="small muted">Optional: the {c.fy ?? 'older'} tradebook from {c.broker === 'Other' ? c.account || 'your broker' : c.broker} would free about {inr(c.rupees)} more room.</p>
          ))}
          {g.otherGaps.map((x, i) => (
            <p key={`${x.key}-${i}`} className="note">{x.text}{x.href !== here && <> <a href={x.href}>{x.action}</a></>}</p>
          ))}
        </div>
      )}

      <div className="stack">
        {g.pct != null && <p>Moves use <strong className="fig">{g.pct}%</strong> of {whose(member.name)} holdings by value</p>}
        <div><button className="btn primary" type="button" onClick={() => go('plan')}>{STOP}</button></div>
      </div>

      <details>
        <summary>More options</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <label className="field">Or paste rows from Excel
            <textarea id="paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the table including its header row, then paste here" />
          </label>
          <div>
            <button className="btn sm" type="button" disabled={!paste.trim()} onClick={() => {
              const id = nextItemId();
              const preview = previewTable(paste);
              setItems((xs) => [{ id, name: 'Pasted rows', status: 'table', preview, mapping: preview.mapping }, ...xs]);
              setPaste('');
            }}>Read pasted rows</button>
          </div>
          <label className="row small wrap" style={{ gap: 8 }}>
            <input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} />
            <span className="grow" style={{ minWidth: 200 }}>For holdings with no trade history and no long-term count, record them as bought on (estimated, never used for moves)</span>
            <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} style={{ width: 160 }} disabled={!opening} aria-label="Estimated buy date" />
          </label>
        </div>
      </details>

      <section className="stack" aria-labelledby="member-files-h">
        <h2 id="member-files-h">Files for {member.name}</h2>
        <FileList imports={files} onRemove={(id) => { update((s) => removeImport(s, id)); toast('Import removed'); }} />
        <p className="tiny muted">Files are read on this device and never uploaded.</p>
      </section>
    </>
  );
}

function SuccessCard({ s }: { s: Success }) {
  const bar = s.pctTo != null && s.pctFrom !== s.pctTo;
  // The bar starts at the old figure and fills to the new one on the next frame (no motion with reduced motion on).
  const [width, setWidth] = useState(s.pctFrom ?? 0);
  useEffect(() => {
    setWidth(s.pctFrom ?? 0);
    const f = requestAnimationFrame(() => setWidth(s.pctTo ?? 0));
    return () => cancelAnimationFrame(f);
  }, [s]);
  return (
    <section className="success stack">
      {s.unchanged ? (
        <>
          <p className="fig">{UNCHANGED}</p>
          <p className="small">Read: {s.read}</p>
        </>
      ) : (
        <>
          <p className="small">Read: {s.read}</p>
          <ul className="success-list">{s.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          {bar && <div className="fill-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>}
        </>
      )}
    </section>
  );
}

/** A drop zone: any file, added to this member. */
function DropZone({ onFiles, compact }: { onFiles: (files: FileList | File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };
  return (
    <div
      className={`drop ${compact ? 'compact' : ''} ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {!compact && <Svg size={28}>{Icon.upload}</Svg>}
      <p style={{ fontWeight: 600 }}>Drop files here</p>
      <label className="btn primary" style={{ cursor: 'pointer' }}>
        Choose files
        <input type="file" multiple hidden accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls,application/pdf,text/csv" onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}

function FirstStep({ onFiles }: { onFiles: (files: FileList | File[]) => void }) {
  return (
    <section className="sheet pad stack" aria-labelledby="first-h">
      <h3 id="first-h">Start with the holdings file</h3>
      <p className="small muted">What&rsquo;s held today. One file is enough for a first plan; the next steps follow from it.</p>
      <div className="brokers">
        <div className="stack" style={{ gap: 2 }}>
          <strong>Zerodha</strong>
          <span className="small muted">Console → Portfolio → Holdings → Download (.xlsx)</span>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <strong>Angel One</strong>
          <span className="small muted">Open &ldquo;Your Holding Details&rdquo; with its password, save a copy as .xlsx, import the copy. Its funds are read; shares come from Angel&rsquo;s trade history for now.</span>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <strong>Other brokers</strong>
          <span className="small muted">Your broker&rsquo;s holdings export, or the NSDL / CDSL CAS. Mutual funds: the detailed CAS from MF Central, CAMS or KFintech. A Tax P&amp;L reads too: Excel or CSV is best, PDF also works.</span>
        </div>
      </div>
      <DropZone onFiles={onFiles} />
    </section>
  );
}

function AccountSection({ a, onFiles }: { a: AccountGuide; onFiles: (files: FileList | File[]) => void }) {
  const id = `acct-${a.key.replace(/[^a-z0-9]+/gi, '-')}-h`;
  return (
    <section className="sheet pad stack" aria-labelledby={id}>
      <h3 id={id}>{accountTitle(a)}</h3>
      {a.notes.map((n, i) => <p key={i} className={`note ${n.startsWith('Newest data from') ? 'amber' : ''}`}>{n}</p>)}
      <ol className="steps">
        {a.steps.map((st, i) => <Step key={`${st.kind}-${i}`} st={st} onFiles={onFiles} />)}
      </ol>
    </section>
  );
}

function Step({ st, onFiles }: { st: GuideStep; onFiles: (files: FileList | File[]) => void }) {
  if (st.status === 'done') {
    return (
      <li className="step done">
        <span className="tick" aria-hidden="true">✓</span>
        <span className="grow"><span className="sr-only">Done: </span>{st.doneLine ?? st.title}</span>
      </li>
    );
  }
  if (st.status === 'next') {
    return (
      <li className="step next stack">
        <strong>{st.title}</strong>
        {st.where && <span className="small">{st.where}</span>}
        {st.unlocks && <span className="small muted">{st.unlocks}</span>}
        {st.password && <span className="tiny muted">{st.password}</span>}
        {st.doneLine && <span className="small good"><span aria-hidden="true">✓ </span>{st.doneLine}</span>}
        <DropZone onFiles={onFiles} compact />
      </li>
    );
  }
  if (st.status === 'later') {
    return (
      <li className="step later">
        <strong>{st.title}</strong>
        {st.unlocks && <span className="small"> · {st.unlocks}</span>}
      </li>
    );
  }
  // Can't be read yet, or a suggestion that never blocks: quiet lines. A suggested file takes its files here.
  const drop = st.status === 'suggestion';
  return (
    <li className={`step quiet small ${drop ? 'stack' : 'muted'}`}>
      <span className={drop ? 'muted' : undefined}>
        <strong>{st.title}</strong>
        {st.status === 'suggestion' && st.where && <> · {st.where}</>}
        {st.unlocks && <> · {st.unlocks}</>}
      </span>
      {drop && <DropZone onFiles={onFiles} compact />}
    </li>
  );
}
