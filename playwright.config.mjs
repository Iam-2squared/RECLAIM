import { defineConfig, devices } from '@playwright/test';
const previewURL=process.env.RECLAIM_PREVIEW_URL;
if(previewURL&&new URL(previewURL).protocol!=='https:')throw new Error('RECLAIM_PREVIEW_URL must use HTTPS');
export default defineConfig({
  testDir:'./tests',testMatch:'*.spec.mjs',workers:1,timeout:30000,
  use:{baseURL:previewURL??'http://127.0.0.1:4173',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium',testIgnore:['ios.spec.mjs','mobile-reference.spec.mjs'],use:{browserName:'chromium',viewport:{width:1600,height:1000},launchOptions:{...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']}}},
    {name:'iphone-webkit',testMatch:'ios.spec.mjs',use:{...devices['iPhone 13'],browserName:'webkit',launchOptions:{env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}}},
  ],
  webServer:previewURL?undefined:[{command:'npm run preview',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI}],
  reporter:[['list'],['html',{open:'never'}]],
});
