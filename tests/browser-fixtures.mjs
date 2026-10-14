import { test as base, expect } from '@playwright/test';

// CI's software-WebGL failure screenshots reached the correct state after
// short UI predicates had already failed. Isolate browser processes so GPU
// work cannot accumulate across unrelated cases, preserving all
// assertions, timeouts and the within-case reload/resource-reuse checks.
export const test = base.extend({
 isolatedBrowser: async ({ playwright, browserName, launchOptions, headless, channel }, use) => {
  const browser = await playwright[browserName].launch({ ...launchOptions, headless, ...(channel ? { channel } : {}) });
  try { await use(browser); } finally { await browser.close(); }
 },
 context: async ({ isolatedBrowser, contextOptions, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL, colorScheme, reducedMotion, storageState }, use, info) => {
  const context = await isolatedBrowser.newContext({ ...contextOptions, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL, colorScheme, reducedMotion, storageState });
  try { await use(context); } finally {
   if(info.status!==info.expectedStatus){
    const states=[];
    for(const page of context.pages())try{states.push(await page.evaluate(()=>({now:performance.now(),hidden:document.hidden,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},snapshot:window.__RECLAIM__?.snapshot(),stage:document.querySelector('#lobby-stage')?.getBoundingClientRect().toJSON()})));}catch{}
    await info.attach('failure-runtime',{body:Buffer.from(JSON.stringify(states,null,2)),contentType:'application/json'});
   }
   await context.close();
  }
 },
});
export { expect };
