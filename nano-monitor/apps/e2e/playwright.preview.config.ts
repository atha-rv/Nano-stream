import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './preview-tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
    { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND ?? 'pnpm preview',
    cwd: '../..',
    url: 'http://localhost:3000/preview',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
