import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Focused portable flows; the existing full Chromium suite (including CDP)
 * remains unchanged. Separate servers keep rate-limit state isolated. */
export default defineConfig({
  ...base,
  testMatch: ['compatibility.spec.ts', 'calculator-ownership.spec.ts'],
  retries: 0,
  workers: 2,
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
