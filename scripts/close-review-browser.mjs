/**
 * Finalize the already-verified Shiretoko review fixture without injecting
 * a synthetic WebGL context-loss command after renderer.dispose().
 *
 * The game scene, GPU resource counters and user input have all been asserted
 * before this function runs. On headless SwiftShader the extra
 * WEBGL_lose_context extension call can block indefinitely after the scene has
 * disposed its canvas. Releasing the test's JSHandle and closing the owning
 * browser page (without beforeunload) lets Chromium free that graphics process.
 * The caller retains its existing 10-second total timeout. Every close error
 * is preserved, never turned into a successful test or silently retried.
 */
export async function closeReviewBrowser(browser, context, renderingContext) {
  const errors = [];
  const close = async (label, operation) => {
    console.log(`[review-close] ${label}: start`);
    try {
      await operation();
      console.log(`[review-close] ${label}: done`);
    } catch (error) {
      console.error(`[review-close] ${label}: failed`, error);
      errors.push(error);
    }
  };
  if (renderingContext) await close('webgl-handle', () => renderingContext.dispose());
  if (typeof context.pages === 'function') {
    let pages = [];
    try { pages = context.pages(); }
    catch (error) { errors.push(error); }
    for (const page of pages) await close('review-page', () => page.close({ runBeforeUnload: false }));
  }
  await close('browser-context', () => context.close());
  await close('browser-process', () => browser.close());
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Review fixture cleanup failed');
  if (browser.isConnected()) throw new Error('Review browser remained connected after close');
}
