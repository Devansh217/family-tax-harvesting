/**
 * Turns the files fetched by fetch-prices.sh into the site's price files:
 *   <site>/prices/latest.json    closing prices of the latest trading day
 *   <site>/prices/previous.json  the trading day before, for "since yesterday"
 * Usage: vite-node scripts/build-prices.ts <download dir> <site dir>
 * The download dir may hold prev-latest.json / prev-previous.json copied from the live site; when no new prices could
 * be fetched, those are published again so the site never loses prices.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergePriceFiles, parseAmfiFunds, parseAmfiNav, parseBhavcopy, parseShareNames, type FundsFile, type PriceFile, type SharesFile } from '../src/prices/parse';

const [inDir, siteDir] = process.argv.slice(2);
if (!inDir || !siteDir) throw new Error('usage: build-prices.ts <download dir> <site dir>');

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const json = (p: string): PriceFile | null => {
  try { return JSON.parse(read(p) ?? 'null'); } catch { return null; }
};

const nseDir = join(inDir, 'nse');
const nseCsv = existsSync(nseDir) ? readdirSync(nseDir).find((f) => f.toLowerCase().endsWith('.csv')) : undefined;
const nse = nseCsv ? parseBhavcopy(readFileSync(join(nseDir, nseCsv), 'utf8')) : null;
const bseText = read(join(inDir, 'bse.csv'));
const navText = read(join(inDir, 'nav.txt'));
const fresh = mergePriceFiles([nse, bseText ? parseBhavcopy(bseText) : null, navText ? parseAmfiNav(navText) : null]);

const prevLatest = json(join(inDir, 'prev-latest.json'));
const prevPrevious = json(join(inDir, 'prev-previous.json'));

let latest: PriceFile | null, previous: PriceFile | null;
if (fresh && (!prevLatest || fresh.date > prevLatest.date)) {
  latest = fresh;
  previous = prevLatest;
} else if (fresh && prevLatest && fresh.date === prevLatest.date) {
  latest = fresh;
  previous = prevPrevious;
} else {
  latest = prevLatest;
  previous = prevPrevious;
}

const out = join(siteDir, 'prices');
mkdirSync(out, { recursive: true });
/** Publishes the live site's copy (fetched as prev-<name>) again, so a failed source never removes a file. */
function carryOver(name: string) {
  const prev = read(join(inDir!, `prev-${name}`));
  if (prev && prev.trim().startsWith('{')) { writeFileSync(join(out, name), prev); console.log(`${name}: kept the live copy`); }
  else console.log(`${name}: none today and no live copy`);
}
if (latest) writeFileSync(join(out, 'latest.json'), JSON.stringify(latest));
if (previous) writeFileSync(join(out, 'previous.json'), JSON.stringify(previous));
// Fund categories decide each fund's tax type in the app. Only written when today's NAV file parsed.
const nav = navText ? parseAmfiNav(navText) : null;
const funds: FundsFile | null = navText && nav?.date ? { date: nav.date, funds: parseAmfiFunds(navText) } : null;
if (funds && Object.keys(funds.funds).length) {
  writeFileSync(join(out, 'funds.json'), JSON.stringify(funds));
  console.log(`funds: ${Object.keys(funds.funds).length} with categories`);
} else carryOver('funds.json');
// Share names and symbols for statements without ISINs. Written fresh only when both exchanges' bhavcopies and the
// name changes came in, so a partial day never publishes a thinner list; otherwise yesterday's is published again.
const nseText = nseCsv ? readFileSync(join(nseDir, nseCsv), 'utf8') : null;
const changes = read(join(inDir, 'namechange.csv'));
if (nseText && bseText && changes && nse?.date) {
  const shares: SharesFile = { date: nse.date, ...parseShareNames([nseText, bseText], changes) };
  writeFileSync(join(out, 'shares.json'), JSON.stringify(shares));
  console.log(`shares: ${Object.keys(shares.byName).length} names, ${Object.keys(shares.bySymbol).length} symbols`);
} else carryOver('shares.json');
console.log(latest ? `prices: ${latest.date} from ${latest.source}, ${Object.keys(latest.prices).length} securities; previous ${previous?.date ?? 'none'}` : 'prices: none available');
