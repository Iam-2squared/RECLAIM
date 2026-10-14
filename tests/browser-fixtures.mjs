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
 context: async ({ isolatedBrowser, contextOptions, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL, colorScheme, reducedMotion, storageState }, use) => {
  const context = await isolatedBrowser.newContext({ ...contextOptions, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL, colorScheme, reducedMotion, storageState });
  try { await use(context); } finally { await context.close(); }
 },
});
export { expect };
