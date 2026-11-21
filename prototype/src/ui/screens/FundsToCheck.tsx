import type { TaxType } from '../../engine/types';
import { useApp } from '../app-context';

const LABEL: Record<TaxType, string> = { equity: 'Equity', slab: 'Slab rate', other_lt: 'Long-term 12.5%', interest: 'Interest', exempt: 'Tax-free', check: 'Check' };

/** A small label for how a holding's gains are taxed. */
export function TaxTypeChip({ taxType }: { taxType: TaxType }) {
  return <span className={`chip ${taxType === 'check' ? 'time' : ''}`} style={{ fontSize: 12, padding: '1px 8px' }}>{LABEL[taxType]}</span>;
}

const CHOICES: Array<[TaxType, string, string]> = [
  ['equity', 'Equity', 'At least 65% in Indian shares (incl. hedged): 20% short-term, 12.5% long-term above ₹1.25 L.'],
  ['other_lt', 'Long-term 12.5%', 'Between 35% and 65% in Indian shares, gold or overseas: slab rate under the holding period, 12.5% after, no ₹1.25 L exemption.'],
  ['slab', 'Slab rate', 'Mostly debt: taxed at your slab rate however long you hold.'],
];

/**
 * Funds whose tax type could not be worked out from AMFI's category (e.g. balanced advantage, multi-asset, fund of
 * funds). The person checks the fund's factsheet and picks; the choice is kept as their override.
 */
export function FundsToCheck({ memberId }: { memberId: string }) {
  const { fam, update } = useApp();
  const v = fam.members.find((x) => x.member.id === memberId);
  const list = (v?.holdings ?? []).filter((h) => h.taxType === 'check');
  if (!list.length) return null;
  return (
    <section className="sheet pad stack" aria-labelledby="check-h" style={{ borderColor: 'var(--time)' }}>
      <h2 id="check-h">Funds to check</h2>
      <p className="small muted">How these funds are taxed depends on what they hold. Until you pick, their gains are taxed at slab rate here and they get no moves. The fund&rsquo;s factsheet shows its equity share.</p>
      {list.map((h) => {
        const sec = fam.securities.get(h.isin);
        return (
          <div key={h.isin} className="stack" style={{ gap: 6 }}>
            <strong>{h.name}</strong>
            <span className="tiny muted">{sec?.category ?? 'Category not known'}</span>
            <div className="seg-ctl" role="group" aria-label={`How ${h.name} is taxed`}>
              {CHOICES.map(([t, label, help]) => (
                <button key={t} type="button" title={help} aria-pressed={false}
                  onClick={() => update((s) => ({ ...s, taxTypeOverrides: { ...s.taxTypeOverrides, [h.isin]: t } }))}>{label}</button>
              ))}
            </div>
            <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>{CHOICES.map(([t, label, help]) => <li key={t}><strong>{label}:</strong> {help}</li>)}</ul>
          </div>
        );
      })}
    </section>
  );
}
