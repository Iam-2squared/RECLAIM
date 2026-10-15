import { defineConfig, devices } from '@playwright/test';

// Separate ports keep this review isolated from the terrain worktree and any
// already-running PC preview. CI can run this config with the same built tree.
export default defineConfig({
  testDir: '../tests',
  testMatch: 'mobile-reference.spec.mjs',
  workers: 1,
  timeout: 30000,
  outputDir: '../test-results/mobile-reference',
  use: { baseURL: 'http://127.0.0.1:4175', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'mobile-chromium',
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
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        launchOptions: { env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' } },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
  reporter: [['list'], ['json', { outputFile: '../test-results/mobile-reference-results.json' }]],
});
