import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const url=process.argv[2]??'http://127.0.0.1:4177/';
const output='release/menu-navigation';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const report={url,passed:false,errors:[],consoleErrors:[]};let page,release;
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.addInitScript(()=>localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:true})));
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 if(!url.startsWith('file:')){
  const held=new Promise(resolve=>release=resolve);let requested;const scriptRequest=new Promise(resolve=>requested=resolve);
  await page.route('**/assets/index-*.js',async route=>{requested();await held;await route.continue();});
  const navigation=page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});await scriptRequest;
  await page.locator('body').waitFor({state:'attached'});
  report.beforeReady=await page.evaluate(()=>({ready:document.body.dataset.ready,presentation:document.body.dataset.menuPresentation,titleHidden:getComputedStyle(document.getElementById('title-screen')).visibility,headerHidden:getComputedStyle(document.querySelector('.topbar')).visibility}));
  assert.equal(report.beforeReady.ready,'false');assert.equal(report.beforeReady.presentation,'atmospheric-title-2d');assert.equal(report.beforeReady.titleHidden,'hidden');assert.equal(report.beforeReady.headerHidden,'hidden');
  await page.screenshot({path:output+'/before-initialization.png'});release();await navigation;
 }else await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('body[data-ready="true"]').waitFor();
 assert.equal(await page.evaluate(()=>window.__RECLAIM__.snapshot().screen),'title');assert.ok(await page.locator('.title-atmosphere').isVisible());assert.ok(await page.locator('#home-button').isVisible());
 await page.screenshot({path:output+'/new-start.png'});await page.locator('#home-button').click();
 await page.locator('.nav-button[data-panel="map"]').click();await page.locator('body[data-home-view="map"]').waitFor();
 report.map=await page.evaluate(()=>({panel:document.getElementById('home-panel').getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,home:window.__RECLAIM__.snapshot().home,lobby:window.__RECLAIM__.snapshot().lobby}));
 assert.ok(report.map.panel.width>report.map.width*.85);assert.equal(report.map.lobby.active,false);assert.ok(await page.locator('#campaign-map').isVisible());assert.ok(await page.locator('#sapporo-map-deploy').isVisible());assert.ok(await page.locator('.authored-map-deploy').isVisible());
 assert.equal(await page.locator('#lobby-stage').isVisible(),false);await page.screenshot({path:output+'/map-desktop.png'});
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.body.dataset.homeView),'lobby');assert.ok(await page.locator('#start-button').isVisible());
 await page.locator('#reference-destination').click();assert.equal(await page.evaluate(()=>document.body.dataset.homeView),'map');await page.locator('#home-lobby-tab').click();assert.equal(await page.evaluate(()=>document.body.dataset.homeView),'lobby');
 await page.setViewportSize({width:390,height:844});if(await page.locator('#menu-toggle').isVisible())await page.locator('#menu-toggle').click();await page.locator('.nav-button[data-panel="map"]').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('#campaign-map').isVisible());await page.screenshot({path:output+'/map-mobile.png'});
 await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:800});await page.locator('#back-title').click();assert.equal(await page.evaluate(()=>window.__RECLAIM__.snapshot().screen),'title');assert.ok(await page.locator('.title-atmosphere').isVisible());
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('body[data-ready="true"]').waitFor();assert.equal(await page.evaluate(()=>window.__RECLAIM__.snapshot().screen),'title');assert.ok(await page.locator('.title-atmosphere').isVisible());
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;console.log('PASS: startup hides retired layout, current start retained; dedicated map desktop/mobile, lobby rendering paused, Escape/HOME and title/reload work.');
}catch(error){release?.();report.failure=String(error.stack??error);if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await writeFile(output+'/check.json',JSON.stringify(report,null,2));await browser.close();}
