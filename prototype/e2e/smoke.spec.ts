import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Smoke tests on the sample (Mehta) family: every new browser context starts with an empty IndexedDB, signed out,
// so the app opens the sample. Each screen must show its main heading, log no console errors and not scroll sideways.

const SIZES = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
  { name: 'phone', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
];

const SCREENS: Array<{ route: string; heading: string }> = [
  { route: 'home', heading: 'Mehta family' },
  { route: 'plan', heading: 'Plan' },
  { route: 'simulate', heading: 'Simulate a sale' },
  { route: 'compare', heading: 'What it brings home' },
  { route: 'family', heading: 'Family' },
  { route: 'import', heading: 'Import statements' },
  { route: 'about', heading: 'About and privacy' },
  { route: 'account', heading: 'Sign in to Harvesting' },
  { route: 'setup', heading: 'Family setup' },
  // The sample's members (src/sample.ts).
  { route: 'member-a', heading: 'Arjun' },
  { route: 'member-m', heading: 'Meera' },
  { route: 'member-r', heading: 'Ramesh' },
  { route: 'member-s', heading: 'Sunita' },
  { route: 'member-k', heading: 'Kabir' },
];

/** Collects console errors and uncaught page errors from the moment the page is created. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function open(page: Page, route: string) {
  await page.goto(`./#${route}`);
  // "Opening your family…" shows while the encrypted copy is read; the screen follows.
  await expect(page.getByRole('status').filter({ hasText: 'Opening your family' })).toHaveCount(0);
}

const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });

/** Plan's "Done this season" list. */
const doneSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Done this season' }) });

/** Plan's "Holding in another name" section. */
const placementSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Holding in another name' }) });

/** Restores a made-up family from a backup built in the test. */
async function restore(page: Page, state: unknown) {
  await open(page, 'family');
  await page.locator('input[type="file"]').setInputFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByText('Backup restored')).toBeVisible();
}

/** Leaves the sample for an own family and opens the Import screen's family table. */
async function startOwnFamilyImport(page: Page) {
  await open(page, 'home');
  await page.getByRole('button', { name: 'Start my own family' }).click();
  await expect(page).toHaveURL(/#family$/);
  await page.evaluate(() => { location.hash = 'import'; });
  await expect(h1(page, 'Import statements')).toBeVisible();
}

/** The family table's member rows. */
const memberRows = (page: Page) => page.getByRole('button', { name: /: open checklist$/ });

/**
 * A tiny PDF with the standard security handler and a user-password check that no password passes, so the reader asks
 * for one. It holds no content: it only needs to be locked.
 */
function lockedPdf(): Buffer {
  const hex = (b: number) => b.toString(16).padStart(2, '0').repeat(32);
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [] /Count 0 >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${hex(0x11)}> /U <${hex(0x22)}> /P -4 >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 3 0 R /ID [<${'ab'.repeat(16)}> <${'ab'.repeat(16)}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function expectNoSideScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, 'page scrolls sideways').toBeLessThanOrEqual(client);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use(size.use);
    let errors: string[] = [];
    test.beforeEach(({ page }) => { errors = watchErrors(page); });
    test.afterEach(() => { expect(errors, 'console errors').toEqual([]); });

    test.describe('screens', () => {
      for (const s of SCREENS) {
        test(`#${s.route}`, async ({ page }) => {
          await open(page, s.route);
          await expect(h1(page, s.heading)).toBeVisible();
          await expectNoSideScroll(page);
        });
      }
    });

    test.describe('flows', () => {
      test('tick a move on Home', async ({ page }) => {
        await open(page, 'home');
        const first = page.getByRole('button', { name: /^Mark done: / }).first();
        const title = (await first.getAttribute('aria-label'))!.replace(/^Mark done: /, '');
        await first.click();
        // Home lists only moves still to do, so the ticked one leaves the list and shows under "Done this season" on Plan.
        await expect(page.getByRole('button', { name: `Mark done: ${title}`, exact: true })).toHaveCount(0);
        await open(page, 'plan');
        await expect(doneSection(page).getByText(title, { exact: true })).toBeVisible();
      });

      test('tick and untick a move on Plan', async ({ page }) => {
        await open(page, 'plan');
        const first = page.getByRole('button', { name: /^Mark done: / }).first();
        const title = (await first.getAttribute('aria-label'))!.replace(/^Mark done: /, '');
        await first.click();
        const row = doneSection(page).locator('.move').filter({ hasText: title });
        await expect(row).toBeVisible();
        await row.getByRole('button', { name: 'Not done' }).click();
        await expect(page.getByRole('button', { name: `Mark done: ${title}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
        await expectNoSideScroll(page);
      });

      test('Simulate amount with the 25/50/75/All picks', async ({ page }) => {
        await open(page, 'simulate');
        const amount = page.getByLabel('Amount to sell (₹)');
        const picks = page.getByRole('group', { name: 'Share of the largest holding' });
        // Opens at All of the largest holding.
        await expect(picks.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
        const all = Number(await amount.inputValue());
        expect(all).toBeGreaterThan(0);
        const seen: number[] = [];
        for (const label of ['25%', '50%', '75%', 'All']) {
          const b = picks.getByRole('button', { name: new RegExp(`^${label}`) });
          await b.click();
          await expect(b).toHaveAttribute('aria-pressed', 'true');
          seen.push(Number(await amount.inputValue()));
        }
        // Each pick sells more, and All comes back to the full holding.
        expect(seen[0]).toBeLessThan(seen[1]!);
        expect(seen[1]).toBeLessThan(seen[2]!);
        expect(seen[2]).toBeLessThan(seen[3]!);
        expect(seen[3]).toBe(all);
        await expectNoSideScroll(page);
      });

      test('pick a fund category on Compare', async ({ page }) => {
        await open(page, 'compare');
        const what = page.getByRole('group', { name: 'What to compare' }).first();
        await what.getByRole('button', { name: 'Fund category' }).click();
        const cat = page.locator('#pa-cat');
        await expect(cat).toBeVisible();
        // Pick a different category from the one shown, by its option text.
        const options = await cat.locator('option').allTextContents();
        const current = await cat.locator('option:checked').textContent();
        const other = options.find((o) => o !== current)!;
        await cat.selectOption({ label: other });
        await expect(cat.locator('option:checked')).toHaveText(other);
        await expect(page.getByRole('region', { name: 'Result' })).toBeVisible();
        await expectNoSideScroll(page);
      });

      test('Before you start: Show details, then I understand', async ({ page }) => {
        await open(page, 'home');
        const card = page.getByRole('region', { name: 'Before you start' });
        await expect(card).toBeVisible();
        const body = card.getByText('It does not recommend buying', { exact: false });
        await expect(body).toBeHidden();
        await card.getByText('Show details').click();
        await expect(body).toBeVisible();
        await card.getByRole('button', { name: 'I understand' }).click();
        await expect(card).toHaveCount(0);
        // The choice is saved in this browser.
        await page.reload();
        await expect(h1(page, 'Mehta family')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Before you start' })).toHaveCount(0);
      });

      test('Start my own family through setup', async ({ page }) => {
        await open(page, 'home');
        await page.getByRole('button', { name: 'Start my own family' }).click();
        await expect(page).toHaveURL(/#family$/);
        await expect(h1(page, 'Family')).toBeVisible();
        await open(page, 'setup');
        await expect(h1(page, 'Family setup')).toBeVisible();
        const name = page.getByLabel('Name', { exact: true });
        await expect(name).toHaveValue('You');
        await name.fill('Priya');
        await page.getByRole('button', { name: 'Next' }).click();
        await expect(page.getByText('Step 2 of 3')).toBeVisible();
        await page.getByRole('button', { name: 'Next' }).click();
        await expect(page.getByText('Step 3 of 3')).toBeVisible();
        await expectNoSideScroll(page);
        await page.getByRole('button', { name: 'Done' }).click();
        await expect(page).toHaveURL(/#home$/);
        await expect(h1(page, 'Your family')).toBeVisible();
        await expect(page.getByText('sample family')).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Priya/ }).first()).toBeVisible();
      });

      test('member page: one quiet note, and an unknown-term sale answered short-term', async ({ page }) => {
        // A synthetic family (e2e/fixtures): a ₹10,000 gain from a lot with a guessed date, sold this year, and Test
        // Share B sold three times this year (and once last year) with no purchase history.
        await open(page, 'family');
        await page.locator('input[type="file"]').setInputFiles(new URL('./fixtures/unknown-term-family.json', import.meta.url).pathname);
        await expect(page.getByText('Backup restored')).toBeVisible();
        await open(page, 'member-p');
        await expect(h1(page, 'Priya')).toBeVisible();
        // One calm note, not a red list: this year's gaps grouped per share, older ones behind a closed toggle.
        const note = page.getByRole('note', { name: 'About the imported files' });
        await expect(note).toHaveCount(1);
        await expect(page.locator('.banner.warn')).toHaveCount(0);
        await expect(note.getByText('Test Share B: sold 12 more units than the history shows (Jul–Aug 2026).', { exact: false })).toBeVisible();
        await expect(note.locator('li', { hasText: 'Test Share B: sold' })).toHaveCount(1);
        await expect(note.locator('details')).not.toHaveAttribute('open', '');
        await expect(note.getByText('Older history gaps (no effect on this year\'s tax)')).toBeVisible();
        // The guessed-date gain counts long-term, so it uses room.
        await expect(page.getByText('Free ₹1,15,000', { exact: true })).toBeVisible();
        await expect(page.getByText(/Test Share A, sold 10 Jun 2026: buy date unknown, so we assumed long-term/)).toBeVisible();
        await page.getByRole('button', { name: 'Short-term', exact: true }).click();
        await expect(page.getByText('Only choose this if your contract note or broker P&L shows the shares were held under a year. If it\'s wrong, a move can create tax.')).toBeVisible();
        // Nothing changes until confirmed.
        await expect(page.getByText('Free ₹1,15,000', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Yes, short-term' }).click();
        await expect(page.getByText('Free ₹1,25,000', { exact: true })).toBeVisible();
        await expect(page.getByText(/Test Share A, sold 10 Jun 2026: Term set by you/)).toBeVisible();
        await expectNoSideScroll(page);
        // Change brings the question back and the room with it.
        await page.getByRole('button', { name: 'Change', exact: true }).click();
        await expect(page.getByText('Free ₹1,15,000', { exact: true })).toBeVisible();
        // A buy date under a year before the sale makes it short-term: it asks first, like the Short-term button.
        await page.getByRole('button', { name: 'Add buy date' }).click();
        await page.getByLabel(/Buy date of Test Share A sold 10 Jun 2026/).fill('2026-01-10');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText('Only choose this if your contract note or broker P&L shows the shares were held under a year. If it\'s wrong, a move can create tax.')).toBeVisible();
        await expect(page.getByText('Free ₹1,15,000', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Yes, short-term' }).click();
        await expect(page.getByText('Free ₹1,25,000', { exact: true })).toBeVisible();
        await expect(page.getByText(/Test Share A, sold 10 Jun 2026: Buy date entered by you/)).toBeVisible();
      });

      test('an old account\'s moves are marked and listed as a gap', async ({ page }) => {
        // Synthetic family: Olga's only account has data to 31 Mar 2026, so its harvest rests on old data.
        await open(page, 'family');
        await page.locator('input[type="file"]').setInputFiles(new URL('./fixtures/old-data-family.json', import.meta.url).pathname);
        await expect(page.getByText('Backup restored')).toBeVisible();
        await open(page, 'plan');
        await expect(page.getByText('Based on data from 31 Mar 2026. Check you still hold these before acting.').first()).toBeVisible();
        await expect(page.getByText(/the tax-free room may be smaller/).first()).toBeVisible();
        await expect(page.getByText(/Olga's Zerodha: newest data from 31 Mar 2026/)).toBeVisible();
        await expect(page.getByText("Olga's tax-free room: gains booked since 31 Mar 2026 aren't counted. Import this year's tax P&L.")).toBeVisible();
        await open(page, 'home');
        await expect(page.getByText('Based on data from 31 Mar 2026. Check you still hold these before acting.').first()).toBeVisible();
        await expect(page.getByText(/^Leaves out (1 move that rests|\d+ moves that rest) on old data\. See the plan\.$/)).toBeVisible();
      });

      test('placement section shows a gift to a parent', async ({ page }) => {
        // Synthetic family: Gita (high income) runs a confirmed SIP in a debt fund; Pushpa (parent) has a low income;
        // Hari is Gita's spouse, so money given to him is clubbed back.
        await open(page, 'family');
        await page.locator('input[type="file"]').setInputFiles(new URL('./fixtures/placement-family.json', import.meta.url).pathname);
        await expect(page.getByText('Backup restored')).toBeVisible();
        await open(page, 'plan');
        const section = placementSection(page);
        await expect(section).toBeVisible();
        await expect(section.locator('.move-title').filter({ hasText: 'Gift Pushpa ₹1.92 L once a year · Pushpa runs the ₹16,000 SIP in Test Bond Fund' })).toBeVisible();
        await expect(section.getByText(/^about ₹[\d,]+$/)).toBeVisible();
        await expect(section.getByText('less tax a year')).toBeVisible();
        await expect(section.getByText('Not suggested for Hari: money you give them is still taxed as yours.')).toBeVisible();
        await section.getByText('Why?').click();
        await expect(section.getByText(/over 10 years, at assumed average returns$/)).toBeVisible();
        await expectNoSideScroll(page);
      });

      test('placement on the sample: shares for a share, units for a fund, one clubbed name', async ({ page }) => {
        await open(page, 'plan');
        const section = placementSection(page);
        await expect(section.locator('.move-title').filter({ hasText: 'Gift Kabir 300 shares of ITC' })).toBeVisible();
        await expect(section.locator('.move-title').filter({ hasText: /^Gift Kabir [\d,.]+ units of Nifty 50 index fund \(sample\)$/ })).toBeVisible();
        await expect(section.getByText('Not suggested for Meera: money you give them is still taxed as yours.')).toBeVisible();
      });

      test('placement: confirm a guessed SIP, and sleep on a big gift', async ({ page }) => {
        // The same synthetic family, with no SIP confirmed: three monthly buys of ₹25,000 in the last three months, and
        // an older ₹12 L buy whose units are worth about ₹15 L, so gifting them asks first.
        const base = JSON.parse(readFileSync(new URL('./fixtures/placement-family.json', import.meta.url), 'utf8')) as Record<string, unknown>;
        const now = new Date();
        const sip = [3, 2, 1].map((k, i) => ({
          id: `sip${i}`, memberId: 'g', isin: 'INF0TESTD001', date: new Date(Date.UTC(now.getFullYear(), now.getMonth() - k, 5)).toISOString().slice(0, 10),
          side: 'buy', qty: 2_500_000, amount: 25_000_00, source: 'Fund statement', account: 'Folio A',
        }));
        const big = { id: 'big', memberId: 'g', isin: 'INF0TESTD001', date: '2024-01-10', side: 'buy', qty: 1_500_000_000, amount: 12_00_000_00, source: 'Fund statement', account: 'Folio A' };
        await restore(page, { ...base, confirmedSips: [], txns: [...sip, big] });
        await open(page, 'plan');
        const section = placementSection(page);
        await expect(section.getByText('You invest about ₹25,000 a month. Right?')).toBeVisible();
        await section.getByRole('button', { name: 'Yes', exact: true }).click();
        await expect(section.getByText(/^You invest about/)).toHaveCount(0);
        await expect(section.locator('.move-title').filter({ hasText: /^Gift Pushpa .* once a year · Pushpa runs the .* SIP in Test Bond Fund$/ })).toBeVisible();

        const gift = section.getByRole('button', { name: /^Mark done: Gift Pushpa [\d,.]+ units of Test Bond Fund$/ });
        await gift.click();
        await expect(section.getByText(/^This is ₹[\d,]+ that becomes Pushpa's for good\. Sleep on it\?$/)).toBeVisible();
        await section.getByRole('button', { name: 'Not yet' }).click();
        await expect(gift).toHaveAttribute('aria-pressed', 'false');
        await gift.click();
        await section.getByRole('button', { name: 'Mark as done', exact: true }).click();
        await expect(section.getByRole('button', { name: /^Mark not done: Gift Pushpa / })).toHaveAttribute('aria-pressed', 'true');
        // Placement moves stay out of the season's lists.
        await expect(doneSection(page)).toHaveCount(0);
        await expectNoSideScroll(page);
      });

      test('placement asks for a missing income', async ({ page }) => {
        // Pushpa with no income entered: no move to her, a link to add it instead.
        const base = JSON.parse(readFileSync(new URL('./fixtures/placement-family.json', import.meta.url), 'utf8')) as { members: Array<Record<string, unknown>> };
        await restore(page, { ...base, members: base.members.map((m) => (m.id === 'p' ? { ...m, income: undefined } : m)) });
        await open(page, 'plan');
        const section = placementSection(page);
        await expect(section.getByRole('link', { name: "Add Pushpa's income to see what moving money to them could save." })).toHaveAttribute('href', '#member-p');
        await expect(section.getByText('Your money is already in the lowest-tax names.')).toHaveCount(0);

        // Gita, who runs the SIP, with no income entered: she is asked for hers, and the money is not called placed.
        await restore(page, { ...base, members: base.members.map((m) => (m.id === 'g' ? { ...m, income: undefined } : m)) });
        await open(page, 'plan');
        await expect(section.getByRole('link', { name: "Add Gita's income to see what moving their money could save." })).toHaveAttribute('href', '#member-g');
        await expect(section.locator('.move-title')).toHaveCount(0);
        await expect(section.getByText('Your money is already in the lowest-tax names.')).toHaveCount(0);
      });

      test('placement: stop a confirmed SIP the files no longer show', async ({ page }) => {
        // The fixture's confirmed ₹20,000 SIP has no buys behind it, so no guess shows it; it can still be stopped.
        const base = JSON.parse(readFileSync(new URL('./fixtures/placement-family.json', import.meta.url), 'utf8')) as Record<string, unknown>;
        await restore(page, base);
        await open(page, 'plan');
        const section = placementSection(page);
        const sipMove = section.locator('.move-title').filter({ hasText: /SIP in Test Bond Fund$/ });
        await expect(sipMove).toBeVisible();
        await section.getByRole('button', { name: 'Change monthly investing' }).click();
        const row = section.getByRole('group', { name: 'Gita · Test Bond Fund' });
        await expect(row.getByRole('spinbutton')).toHaveValue('20000');
        await row.getByLabel('Stopped').check();
        await section.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(sipMove).toHaveCount(0);
        await expect(section.getByText('Your money is already in the lowest-tax names.')).toBeVisible();
      });

      test('placement: add a SIP the files don\'t show', async ({ page }) => {
        // Gita holds 1,000 units of the bond fund from an old buy and has no SIP confirmed or guessed.
        const base = JSON.parse(readFileSync(new URL('./fixtures/placement-family.json', import.meta.url), 'utf8')) as Record<string, unknown>;
        const held = { id: 'old', memberId: 'g', isin: 'INF0TESTD001', date: '2024-01-10', side: 'buy', qty: 1_000_000, amount: 9_000_00, source: 'Fund statement', account: 'Folio A' };
        await restore(page, { ...base, confirmedSips: [], txns: [held] });
        await open(page, 'plan');
        const section = placementSection(page);
        await section.getByRole('button', { name: 'Add monthly investing' }).click();
        await section.getByRole('button', { name: 'Add a SIP' }).click();
        const row = section.getByRole('group', { name: 'New SIP' });
        await expect(row.getByLabel('Who')).toHaveValue('g');
        await expect(row.getByLabel('Fund')).toHaveValue('INF0TESTD001');
        await row.getByLabel('₹ a month').fill('16000');
        await expectNoSideScroll(page);
        await section.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(section.locator('.move-title').filter({ hasText: /^Gift Pushpa .* once a year · Pushpa runs the .* SIP in Test Bond Fund$/ })).toBeVisible();
        await expect(section.getByRole('button', { name: 'Change monthly investing' })).toBeVisible();
      });

      test('importing the same tradebook twice names the earlier file the second time', async ({ page }) => {
        await startOwnFamilyImport(page);
        // The family table's first row opens that member's checklist.
        const row = memberRows(page).first();
        const name = (await row.getAttribute('aria-label'))!.replace(/: open checklist$/, '');
        await row.click();
        await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
        // Live regions are mounted empty, so what lands in them later is announced.
        const addedRegion = page.getByRole('status', { name: 'File added' });
        await expect(addedRegion).toHaveCount(1);
        await expect(addedRegion).toHaveText('');
        const csv = 'symbol,isin,trade_date,segment,trade_type,quantity,price\nINFY,INE009A01021,2024-03-12,EQ,buy,10,1500\nINFY,INE009A01021,2024-03-14,EQ,buy,5,1510\n';
        const addFile = async (file: string) => {
          // Every drop zone takes any file.
          await page.locator('input[type="file"]').first().setInputFiles({ name: file, mimeType: 'text/csv', buffer: Buffer.from(csv) });
          const card = page.getByRole('article', { name: file });
          await expect(card.getByRole('status', { name: 'Notes on this file' })).toHaveText('');
          await card.getByRole('button', { name: /^Add to / }).click();
          return card;
        };
        const first = await addFile('tradebook-a.csv');
        await expect(first.getByText('Added', { exact: true })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /Read: .*trades/ })).toBeVisible();
        await expect(addedRegion).toContainText(/Read: .*trades/);
        const second = await addFile('tradebook-b.csv');
        await expect(second.getByText(/^Same as tradebook-a.csv you added on /)).toBeVisible();
        await expect(second.getByRole('status', { name: 'Notes on this file' })).toContainText(/^Same as tradebook-a.csv/);
        // A file that changed nothing gets no success card.
        await expect(page.getByRole('status').filter({ hasText: /Read: / })).toHaveCount(0);
        await expectNoSideScroll(page);
      });

      test('a member with no next step can still add a file', async ({ page }) => {
        await startOwnFamilyImport(page);
        await memberRows(page).first().click();
        // A synthetic holdings export from another broker: holdings done, trade history a suggestion, no step next.
        const csv = 'symbol,isin,quantity,ltp\nTEST,INE009A01021,10,1500\n';
        await page.locator('input[type="file"]').first().setInputFiles({ name: 'groww-holdings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
        const card = page.getByRole('article', { name: 'groww-holdings.csv' });
        await card.getByRole('button', { name: /^Add to / }).click();
        await expect(card.getByText('Added', { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: 'Groww', exact: true })).toBeVisible();
        await expect(page.locator('.step.next')).toHaveCount(0);
        // The checklist always has a drop zone, and the trade-history suggestion has its own.
        await expect(page.getByRole('region', { name: 'Add another file' }).locator('input[type="file"]')).toHaveCount(1);
        await expect(page.locator('.step.quiet').filter({ hasText: 'Trade history' }).locator('input[type="file"]')).toHaveCount(1);
        await expectNoSideScroll(page);
      });

      test('a locked PDF asks for the password the statement was ordered with', async ({ page }) => {
        await startOwnFamilyImport(page);
        await memberRows(page).first().click();
        await page.locator('input[type="file"]').first().setInputFiles({ name: 'locked.pdf', mimeType: 'application/pdf', buffer: lockedPdf() });
        const card = page.getByRole('article', { name: 'locked.pdf' });
        await expect(card.getByLabel(/This PDF is locked/)).toBeVisible();
        await expect(card.getByText('From MF Central, CAMS or KFintech: the password you chose. NSDL / CDSL CAS: your PAN in capitals.')).toBeVisible();
        await expect(card.getByText(/usually your PAN/)).toHaveCount(0);
      });

      test('#import shows a row per member, and Stop here opens the plan', async ({ page }) => {
        await startOwnFamilyImport(page);
        const table = page.getByRole('table');
        await expect(table).toBeVisible();
        const rows = memberRows(page);
        expect(await rows.count()).toBeGreaterThan(0);
        await expect(table.locator('tbody tr')).toHaveCount(await rows.count());
        await expectNoSideScroll(page);
        await page.getByRole('button', { name: 'Stop here, show my plan' }).click();
        await expect(page).toHaveURL(/#plan$/);
        await expect(h1(page, 'Plan')).toBeVisible();
      });

      test('download a backup on Family', async ({ page }) => {
        await open(page, 'family');
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: /Download a backup/ }).click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/^harvesting-backup-\d{4}-\d{2}-\d{2}\.json$/);
        const path = await download.path();
        const { readFile } = await import('node:fs/promises');
        const backup = JSON.parse(await readFile(path, 'utf8'));
        expect(backup.members?.map((m: { name: string }) => m.name)).toEqual(['Arjun', 'Meera', 'Ramesh', 'Sunita', 'Kabir']);
      });
    });
  });
}
