import { useState } from 'react';
import { isElssFund } from '../../engine/categories';
import type { Term } from '../../engine/types';
import { setTermAnswer } from '../../store';
import { useApp } from '../app-context';
import { dateLabel } from '../format';
import { answeredSales, buyDateAnswer, unknownTermLine, needsConfirm, pnlCoverage, unknownTermSales, type UnknownTermSale } from '../warnings';

/** This year's open unknown-term sales the member can answer (uncovered by a Tax P&L, never ELSS). */
export function useOpenUnknownTerms(memberId: string): UnknownTermSale[] {
  const { fam, state } = useApp();
  const covered = pnlCoverage(state.brokerSummaries, fam.rules);
  const elss = (isin: string) => { const s = fam.securities.get(isin); return !!s && isElssFund(s); };
  return unknownTermSales(fam.ledger.realised, memberId, fam.rules, covered, elss);
}


export const TERM_LABEL: Record<Term, string> = { lt: 'long-term', st: 'short-term' };

/**
 * One sale whose buy date is unknown: the term the engine assumed and the family's answer. A term that differs from
 * any piece's can free room, so it asks first, and so does a buy date that gives such a term. `needsChecking` words it
 * for a "to check" list (spec §5).
 */
export function UnknownTermRow({ sale, needsChecking = false }: { sale: UnknownTermSale; needsChecking?: boolean }) {
  const { fam, update, asOf } = useApp();
  // The term waiting for a confirm, and the buy date that gave it (when it came from "Add buy date").
  const [confirm, setConfirm] = useState<{ term: Term; buyDate?: string } | null>(null);
  const [dating, setDating] = useState(false);
  const [date, setDate] = useState('');
  const name = fam.securities.get(sale.isin)?.name ?? sale.isin;
  const answer = (patch: { term?: Term; buyDate?: string }) =>
    update((s) => setTermAnswer(s, { memberId: sale.memberId, account: sale.account, isin: sale.isin, sellDate: sale.sellDate, ...patch }));
  const pick = (term: Term) => (needsConfirm(sale, term) ? setConfirm({ term }) : answer({ term }));
  const saveDate = () => {
    const { term, confirm: ask } = buyDateAnswer(sale, fam.securities.get(sale.isin), date, fam.rules);
    setDating(false);
    if (ask) setConfirm({ term, buyDate: date });
    else answer({ buyDate: date });
  };
  return (
    <div className="li" style={{ flexWrap: 'wrap', gap: 8 }}>
      <span className="grow small" style={{ minWidth: 220 }}>
        {unknownTermLine(name, sale, needsChecking)}{' '}
        <button className="btn sm" type="button" onClick={() => pick('lt')}>Long-term</button>{' '}
        <button className="btn sm" type="button" onClick={() => pick('st')}>Short-term</button>? Not sure?{' '}
        <button className="btn sm ghost" type="button" onClick={() => setDating(true)}>Add buy date</button>
      </span>
      {confirm && (
        <span className="stack small" style={{ gap: 6, width: '100%' }} role="group" aria-label="Confirm the term">
          <span>{confirm.term === 'st'
            ? "Only choose this if your contract note or broker P&L shows the shares were held under a year. If it's wrong, a move can create tax."
            : "Only choose this if your contract note or broker P&L shows the shares were held over a year. If it's wrong, a move can create tax."}</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn sm primary" type="button" onClick={() => { answer(confirm.buyDate ? { buyDate: confirm.buyDate } : { term: confirm.term }); setConfirm(null); }}>Yes, {TERM_LABEL[confirm.term]}</button>
            <button className="btn sm" type="button" onClick={() => setConfirm(null)}>Cancel</button>
          </span>
        </span>
      )}
      {dating && (
        <span className="row small" style={{ gap: 8, width: '100%' }}>
          <input type="date" aria-label={`Buy date of ${name} sold ${dateLabel(sale.sellDate)}`} value={date} max={sale.sellDate < asOf ? sale.sellDate : asOf} onChange={(e) => setDate(e.target.value)} />
          <button className="btn sm primary" type="button" disabled={!date || date > sale.sellDate} onClick={saveDate}>Save</button>
          <button className="btn sm" type="button" onClick={() => setDating(false)}>Cancel</button>
        </span>
      )}
    </div>
  );
}

/** Sales whose buy date is unknown, this year and not covered by a Tax P&L: answer them, or change an answer. */
export function UnknownTerms({ memberId }: { memberId: string }) {
  const { fam, state, update } = useApp();
  const covered = pnlCoverage(state.brokerSummaries, fam.rules);
  const open = useOpenUnknownTerms(memberId);
  const answered = answeredSales(fam.ledger.realised, state.termAnswers, memberId, fam.rules, covered);
  if (open.length === 0 && answered.length === 0) return null;
  return (
    <div className="sheet" aria-label="Sales with an unknown buy date">
      {open.map((s) => <UnknownTermRow key={`${s.account}|${s.isin}|${s.sellDate}`} sale={s} />)}
      {answered.map(({ answer, label }) => (
        <div className="li" key={`a|${answer.account}|${answer.isin}|${answer.sellDate}`}>
          <span className="grow small">{fam.securities.get(answer.isin)?.name ?? answer.isin}, sold {dateLabel(answer.sellDate)}: {label}
            {answer.buyDate ? ` (${dateLabel(answer.buyDate)})` : answer.term ? ` (${TERM_LABEL[answer.term]})` : ''}.</span>
          <button className="btn sm ghost" type="button" onClick={() => update((s) => setTermAnswer(s, { memberId, account: answer.account, isin: answer.isin, sellDate: answer.sellDate }))}>Change</button>
        </div>
      ))}
    </div>
  );
}
