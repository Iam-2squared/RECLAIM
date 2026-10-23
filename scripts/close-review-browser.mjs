/** Dispose the fixture's retained GL handle before closing its explicit context.
 * Scene resource assertions run BEFORE this fixture cleanup; errors still fail.
 * The caller owns the unchanged wall-clock budget for the whole operation.
 */
export async function closeReviewBrowser(browser, context, renderingContext) {
  const errors = [];
  async function close(label, operation) {
    console.log(`[review-close] ${label}: start`);
    try {
      await operation();
      console.log(`[review-close] ${label}: done`);
    } catch (error) {
      console.error(`[review-close] ${label}: failed`, error);
      errors.push(error);
    }
  }
  if (renderingContext) {
    await close('webgl-context', () => renderingContext.evaluate(gl => {
      if (!gl || gl.isContextLost()) return;
      const extension = gl.getExtension('WEBGL_lose_context');
      if (extension) extension.loseContext();
    }));
    await close('webgl-handle', () => renderingContext.dispose());
  }
  await close('browser-context', () => context.close());
  await close('browser-process', () => browser.close());
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Review fixture cleanup failed');
  if (browser.isConnected()) throw new Error('Review browser remained connected after close');
}
