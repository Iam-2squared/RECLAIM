/**
 * During slow software-WebGL captures a read-only browser-state observer can
 * be delayed while the real W key remains held. Cap ONLY the test's precision
 * input pulse using Playwright's own native keyup from the Node event loop.
 * Arrival radius, physics, original observer and wall deadlines are unchanged.
 */
export async function withNativePrecisionInputGuard(releaseNativeKey, observeActualMotion, holdMs = 250) {
  if (typeof releaseNativeKey !== 'function' || typeof observeActualMotion !== 'function' ||
      !Number.isFinite(holdMs) || holdMs <= 0 || holdMs > 250)
    throw new RangeError('invalid precision key-release guard');
  let releasePromise = null;
  const timer = setTimeout(() => {
    releasePromise = Promise.resolve().then(releaseNativeKey);
    // The observer can legitimately outlast this native keyup. Keep any
    // rejection observed while preserving it for the final caller.
    releasePromise.catch(() => {});
  }, holdMs);
  let result, observationError;
  try { result = await observeActualMotion(); }
  catch (error) { observationError = error; }
  finally { clearTimeout(timer); }
  if (releasePromise) {
    try { await releasePromise; }
    catch (releaseError) {
      if (observationError) throw new AggregateError([observationError, releaseError], 'Observation and native keyup failed');
      throw releaseError;
    }
  }
  if (observationError) throw observationError;
  return result;
}
