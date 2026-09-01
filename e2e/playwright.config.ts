import { defineConfig, devices } from '@playwright/test';

/**
 * Fake media for browser tests:
 * - fake device + fake UI: getUserMedia succeeds headless, no prompts.
 * - auto-select capture source: getDisplayMedia resolves without a picker.
 *   (Both spellings are passed; Chromium ignores flags it does not know.
 *   If screen capture still fails headless, the screen test skips itself
 *   with a reason instead of failing — see tests/browser/screen.spec.ts.)
 */
const FAKE_MEDIA_ARGS = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--auto-select-desktop-capture-source=Entire screen',
  '--auto-select-tab-capture-source-by-title=Freecord',
];

export default defineConfig({
  testDir: './tests',
  globalSetup: './setup/global-setup.ts',
  globalTeardown: './setup/global-teardown.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One worker: every test drives the same booted server; rooms isolate
  // state, but serial keeps timing (sweeps, slot churn) deterministic.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  projects: [
    {
      // Protocol-level tests: raw `ws` clients, no browser involved.
      name: 'protocol',
      testDir: './tests/protocol',
    },
    {
      name: 'browser',
      testDir: './tests/browser',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
        launchOptions: { args: FAKE_MEDIA_ARGS },
      },
    },
  ],
});
