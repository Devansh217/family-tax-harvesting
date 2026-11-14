/**
 * Loads every Zerodha file in ../data/private as one member, the way the app does: holdings and tradebooks as data,
 * the Tax P&L as check-only. Prints counts and match / no-match only, never amounts or names.
 *   npx vite-node scripts/demo-private.ts
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { computeFamily } from '../src/engine/family';
import { FY_2026_27 } from '../src/engine/rules';
import { isZerodhaHoldings, isZerodhaTaxPnl, parseTablePreview, parseZerodhaHoldings, parseZerodhaTaxPnl, previewRows } from '../src/parsers';
import { reconcile } from '../src/reconcile';
import { applyImport, emptyState, type AppState } from '../src/store';

const dir = join(import.meta.dirname, '../../data/private');
let s: AppState = { ...emptyState(), members: [{ id: 'm', name: 'Member', relation: 'self', age: 40, regime: 'new', otherIncome: 20_00_000_00 }] };
const order = (f: string) => (/holdings/i.test(f) ? 2 : /taxpnl/i.test(f) ? 3 : 1);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xlsx')).sort((a, b) => order(a) - order(b))) {
  const sheets = (await readXlsxFile(join(dir, f))).map((x) => ({ sheet: x.sheet, data: x.data as unknown[][] }));
  const r = isZerodhaTaxPnl(sheets) ? parseZerodhaTaxPnl(sheets)
    : isZerodhaHoldings(sheets) ? parseZerodhaHoldings(sheets)
    : (() => { const p = sheets.map((x) => previewRows(x.data)).find((x) => x.kind !== 'unknown')!; return parseTablePreview(p, p.mapping, f); })();
  s = applyImport(s, 'm', f, r, { account: 'Zerodha', checkOnly: isZerodhaTaxPnl(sheets) });
  console.log(`loaded ${f.replace(/RZ\d+/, 'XX')}: ${r.format.split(' · ')[0]}, ${r.txns.length} trades, ${r.prices.length} holdings`);
}
const fam = computeFamily(s, '2026-11-14', FY_2026_27);
const v = fam.members[0]!;
console.log(`\nholdings: ${v.holdings.length}, priced ${v.holdings.filter((h) => h.price != null).length}, lots with guessed data ${v.holdings.reduce((a, h) => a + h.uncertainLots, 0)}`);
console.log(`unmatched sells (older buys missing): ${fam.ledger.warnings.length} across ${new Set(fam.ledger.warnings.map((w) => w.isin)).size} securities`);
const pos = s.positions.filter((p) => p.memberId === 'm');
const qtyOff = pos.filter((p) => Math.abs((v.holdings.find((h) => h.isin === p.isin)?.qty ?? 0) - p.qty) > 10).length;
const ltOff = pos.filter((p) => p.ltQty != null && Math.abs((v.holdings.find((h) => h.isin === p.isin)?.lots.filter((l) => l.term === 'lt').reduce((a, l) => a + l.qty, 0) ?? 0) - p.ltQty) > 10).length;
console.log(`holdings file vs trade history: ${pos.length - qtyOff}/${pos.length} unit counts match; long-term units off for ${ltOff}`);
for (const l of reconcile(fam, s.brokerSummaries[0]!)) console.log(`${l.ok ? 'MATCH   ' : 'MISMATCH'} ${l.label}`);
const kinds = fam.moves.reduce<Record<string, number>>((a, m) => ({ ...a, [m.kind]: (a[m.kind] ?? 0) + 1 }), {});
console.log(`moves: ${JSON.stringify(kinds)}`);
