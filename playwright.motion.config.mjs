import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'motion-preview.spec.mjs',workers:1,timeout:300000,
  outputDir:'../motion/reports/preview/artifacts',
  expect:{timeout:30000},
  use:{viewport:{width:1440,height:1000},reducedMotion:'no-preference',screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:process.platform==='win32'?{channel:'chrome'}:{}),args:['--enable-unsafe-swiftshader']}},
  reporter:[['list']],
});
