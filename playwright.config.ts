import { defineConfig } from '@playwright/test';

const port = Number.parseInt(process.env.PW_PORT ?? '3107', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PW_PORT must be an integer between 1 and 65535');
}
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60000,
      },
});
