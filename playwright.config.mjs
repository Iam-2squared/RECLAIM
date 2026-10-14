import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'*.spec.mjs',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1600,height:1000},launchOptions:{...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']},screenshot:'only-on-failure'},
  webServer:{command:'npm run preview',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
  reporter:[['list'],['html',{open:'never'}]],
});
