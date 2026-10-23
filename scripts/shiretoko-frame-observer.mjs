/** Wait for an explicitly requested view to reach the real renderer.
 * A fixed number of RAF ticks cannot acknowledge a GPU-backpressured draw.
 * This helper never requests extra frames or changes the scene/clock/input;
 * Playwright's existing default waitForFunction deadline is preserved.
 */
export async function selectRenderedTerrainView(page, index) {
  if (!Number.isInteger(index) || index < 0 || index > 4)
    throw new RangeError('invalid terrain review view');
  const before = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal);
  await page.evaluate(i => window.__SHIRETOKO_TERRAIN__.setView(i), index);
  await page.waitForFunction(n => window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal > n, before);
}
