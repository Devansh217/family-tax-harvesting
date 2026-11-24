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

      test('importing the same tradebook twice names the earlier file the second time', async ({ page }) => {
        await startOwnFamilyImport(page);
        // The family table's first row opens that member's checklist.
        const row = memberRows(page).first();
        const name = (await row.getAttribute('aria-label'))!.replace(/: open checklist$/, '');
        await row.click();
        await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
        const csv = 'symbol,isin,trade_date,segment,trade_type,quantity,price\nINFY,INE009A01021,2024-03-12,EQ,buy,10,1500\nINFY,INE009A01021,2024-03-14,EQ,buy,5,1510\n';
        const addFile = async (file: string) => {
          // Every drop zone takes any file.
          await page.locator('input[type="file"]').first().setInputFiles({ name: file, mimeType: 'text/csv', buffer: Buffer.from(csv) });
          const card = page.getByRole('article', { name: file });
          await card.getByRole('button', { name: /^Add to / }).click();
          return card;
        };
        const first = await addFile('tradebook-a.csv');
        await expect(first.getByText('Added', { exact: true })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /Read: .*trades/ })).toBeVisible();
        const second = await addFile('tradebook-b.csv');
        await expect(second.getByText(/^Same as tradebook-a.csv you added on /)).toBeVisible();
        // A file that changed nothing gets no success card.
        await expect(page.getByRole('status').filter({ hasText: /Read: / })).toHaveCount(0);
        await expectNoSideScroll(page);
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
