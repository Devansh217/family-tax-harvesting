import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests against the built app (npm run build, then vite preview), as the live site serves it.
// Two projects, Chromium and WebKit; e2e/smoke.spec.ts runs every test at desktop (1280×860) and phone (375×812) size.
// CI runs one browser per job: npx playwright test --project=chromium
// SMOKE_PORT moves the server off 4173 when another preview already holds it.
const port = Number(process.env.SMOKE_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // CI builds in an earlier step and sets SMOKE_SKIP_BUILD, so the build is not repeated.
    command: process.env.SMOKE_SKIP_BUILD ? `npx vite preview --port ${port} --strictPort` : `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    // Never reuse a server already on the port: it may be another checkout's build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
