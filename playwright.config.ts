import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4300',
    colorScheme: 'light',
    locale: 'es-PE',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run start -- --host 127.0.0.1 --port 4300',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1366', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'wide-1920', use: { viewport: { width: 1920, height: 1080 } } }
  ]
});
