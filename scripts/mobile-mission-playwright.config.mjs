import { defineConfig, devices } from '@playwright/test';

process.env.LIBGL_ALWAYS_SOFTWARE ??= '1';
const remoteURL = process.env.RECLAIM_PREVIEW_URL;
if (remoteURL && new URL(remoteURL).protocol !== 'https:') throw new Error('RECLAIM_PREVIEW_URL must use HTTPS');

export default defineConfig({
  testDir: '../tests',
  testMatch: 'mobile-mission.spec.mjs',
  workers: 1,
  timeout: 120000,
  outputDir: '../test-results/mobile-mission',
  use: {
    baseURL: remoteURL ?? 'http://127.0.0.1:4176',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-mission-chromium',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        launchOptions: {
          ...(process.env.RECLAIM_TEST_BROWSER ? { executablePath: process.env.RECLAIM_TEST_BROWSER } : {}),
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
        },
      },
    },
    {
      name: 'mobile-mission-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
      },
    },
  ],
  webServer: remoteURL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
  },
  reporter: [['list'], ['json', { outputFile: '../test-results/mobile-mission-results.json' }]],
});
