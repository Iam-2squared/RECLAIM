/**
 * End an actual WebGL review fixture after all scene / GPU resource assertions.
 * Explicit close of each page frees the compositor. In SwiftShader, an extra
 * context.close() command can hang even after page.close() has completed.
 * Browser.close() closes all of its owned contexts, and their actual 'close'
 * events must be observed; this is neither a skip nor a detached process kill.
 * The caller's existing 10-second total deadline applies without extension.
 */
export async function closeReviewBrowser(browser, context, renderingContext) {
  const errors = [];
  let contextClosed = false;
  if (typeof context.once === 'function') context.once('close', () => { contextClosed = true; });
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
    let pages=[];
    try { pages=context.pages(); }
    catch (error) { errors.push(error); }
    for (const page of pages) await close('review-page', () => page.close({runBeforeUnload:false}));
    try { if (context.pages().length) errors.push(new Error('Review pages remain open before browser shutdown')); }
    catch (error) { errors.push(error); }
  }
  // Browser.close owns shutdown of the isolated context. Do not call
  // context.close() separately while the GPU context is shutting down.
  await close('browser-process', () => browser.close());
  if (typeof context.once === 'function' && !contextClosed)
    errors.push(new Error('Review browser context did not emit close on shutdown'));
  if (browser.isConnected()) errors.push(new Error('Review browser remained connected after close'));
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Review fixture cleanup failed');
}
