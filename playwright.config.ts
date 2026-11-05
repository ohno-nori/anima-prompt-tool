import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 45000,
  expect: { timeout: 10000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173/anima-prompt-tool/', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: process.platform === 'win32' ? 'msedge' : undefined },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined } },
  ],
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173/anima-prompt-tool/', reuseExistingServer: !process.env.CI },
});
