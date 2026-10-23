/** Close the explicit context before its browser; never hide a cleanup error.
 * The caller owns the unchanged wall-clock budget for the whole operation.
 */
export async function closeReviewBrowser(browser, context) {
  const errors = [];
  try { await context.close(); } catch (error) { errors.push(error); }
  try { await browser.close(); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Review context and browser cleanup failed');
  if (browser.isConnected()) throw new Error('Review browser remained connected after close');
}
