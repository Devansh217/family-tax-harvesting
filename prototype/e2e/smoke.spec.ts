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
