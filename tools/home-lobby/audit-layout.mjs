import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('release/layout-audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.RECLAIM_TEST_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const reports = [];
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
  await page.locator('body[data-ready="true"]').waitFor();
  if (await page.locator('#title-screen').isVisible()) await page.locator('#home-button').click();
  await page.waitForFunction(() => window.__RECLAIM__.snapshot().lobby.status === 'ready');
  await page.locator('#squad-button').click();
  for (const [width, height] of [[1600,900],[1366,768],[1280,720],[1024,768],[960,540],[844,390],[390,844],[320,640]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const report = await page.evaluate(() => {
      const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
      const selectors = ['.topbar','.side-nav','.lobby-sidebar','.lobby-heading','.squad-tools','.home-footnote','.lobby-news','.launch-area','.lobby-bottom-bar',...Array.from({length:4},(_,i)=>`.survivor-label:nth-child(${i+1})`)];
      const boxes = selectors.map(selector => { const node=document.querySelector(selector), r=node.getBoundingClientRect(); return {selector,visible:Boolean(visible(node)),text:node.innerText, x:r.x,y:r.y,width:r.width,height:r.height}; }).filter(r=>r.visible);
      const overlaps=[];
      for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) { const a=boxes[i],b=boxes[j];const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);if(w>1&&h>1)overlaps.push([a.selector,b.selector,Math.round(w*h)]); }
      return {viewport:[innerWidth,innerHeight],boxes,overlaps,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    reports.push(report);
    await page.screenshot({ path: resolve(output, `${width}x${height}.png`) });
  }
  await writeFile(resolve(output,'report.json'), JSON.stringify({errors,reports},null,2));
  console.log(JSON.stringify({errors,reports:reports.map(({viewport,overlaps,overflow})=>({viewport,overlaps,overflow}))},null,2));
  assert.deepEqual(errors,[]);
  for(const report of reports){assert.deepEqual(report.overlaps,[],`Overlapping HOME elements at ${report.viewport}`);assert.equal(report.overflow,false);}
  await context.close();
} finally { await browser.close(); }
