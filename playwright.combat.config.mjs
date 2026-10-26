import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'combat-motion.spec.mjs',workers:1,timeout:300000,
  use:{baseURL:process.env.RECLAIM_COMBAT_URL??'http://127.0.0.1:5182',viewport:{width:1280,height:800},screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:process.platform==='win32'?{channel:'chrome'}:{}),args:process.platform==='win32'?['--enable-unsafe-swiftshader']:['--enable-unsafe-swiftshader','--use-angle=swiftshader']}},
  webServer:process.env.RECLAIM_COMBAT_SERVER==='external'?undefined:{command:'npm run dev -- --host 127.0.0.1 --port 5182 --strictPort',url:'http://127.0.0.1:5182',reuseExistingServer:!process.env.CI},
  reporter:[['list']],
});
