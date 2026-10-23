/** Close the review page before the explicit context and browser, without
 * masking a failed cleanup. The caller keeps the original 10-second wall-clock
 * budget for the entire operation. Actual Chromium+SwiftShader CI showed that
 * context.close() alone can leave browser.close() pending; explicit page.close()
 * released the GPU document first without changing any tested game resource.
 */
export async function closeReviewBrowser(browser, context) {
  const errors = [];
  if (typeof context.pages === 'function') {
    try {
      for (const page of context.pages()) {
        try { await page.close({ runBeforeUnload: false }); }
        catch (error) { errors.push(error); }
      }
    } catch (error) { errors.push(error); }
  }
  try { await context.close(); } catch (error) { errors.push(error); }
  try { await browser.close(); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Review page, context and browser cleanup failed');
  if (browser.isConnected()) throw new Error('Review browser remained connected after close');
}
