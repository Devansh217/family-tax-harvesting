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
import { mergePriceFiles, parseAmfiNav, parseBhavcopy, type PriceFile } from '../src/prices/parse';

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
if (latest) writeFileSync(join(out, 'latest.json'), JSON.stringify(latest));
if (previous) writeFileSync(join(out, 'previous.json'), JSON.stringify(previous));
console.log(latest ? `prices: ${latest.date} from ${latest.source}, ${Object.keys(latest.prices).length} securities; previous ${previous?.date ?? 'none'}` : 'prices: none available');
