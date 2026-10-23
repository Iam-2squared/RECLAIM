/** Poll genuine in-page mission state independently of a busy software GPU's
 * requestAnimationFrame delivery. The original 5s segment timeout remains.
 */
export const WALK_OBSERVER_POLL_MS = 75;
export function walkObserverOptions(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) throw new RangeError('invalid remaining walk budget');
  return Object.freeze({polling:WALK_OBSERVER_POLL_MS,timeout:Math.min(5000,remainingMs)});
}
