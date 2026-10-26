import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output=resolve('release');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
  const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1,reducedMotion:'no-preference'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.argv[2]??'http://127.0.0.1:5173/');
  await page.locator('body[data-ready="true"]').waitFor();
  if(await page.locator('#title-screen').isVisible())await page.locator('#home-button').click();
  await page.waitForFunction(()=>window.__RECLAIM__?.snapshot().lobby?.modelCount===4,{},{timeout:30000});
  await page.waitForFunction(()=>window.__RECLAIM__.snapshot().lobby.frames>2);
  await page.screenshot({path:resolve(output,'HOME-preview.png')});
  const full=await page.evaluate(()=>window.__RECLAIM__.snapshot());
  await page.locator('#solo-button').click();
  await page.waitForFunction(()=>window.__RECLAIM__.snapshot().lobby.modelCount===1);
  await page.screenshot({path:resolve(output,'HOME-solo-preview.png')});
  await page.locator('#home-character-select').selectOption('ramirez');
  await page.screenshot({path:resolve(output,'HOME-ramirez-preview.png')});
  await page.locator('#squad-button').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(output,'HOME-mobile-preview.png')});
  await writeFile(resolve(output,'HOME-preview-check.json'),JSON.stringify({errors,lobby:full.lobby,renderer:full.renderer,campaign:full.campaign},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Captured real four-player, solo, Ramirez and compact HOME views.');
  await context.close();
} finally { await browser.close(); }
