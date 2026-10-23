/**
 * Read-only measurement of a genuinely held forward key. On slow SwiftShader
 * runners the game may deliver fewer than 24 simulation frames within a 5s
 * polling segment, even while advancing correctly. For non-precision legs,
 * permit a new native-input observation segment after measurable progress
 * TOWARD the target. This neither declares arrival nor changes its radius,
 * the per-segment 5s timeout, or the overall 50s walk deadline.
 * Serialized by Playwright into the page; no gameplay state is modified.
 */
export function observeActualWalkSegment(observation, sampledMission) {
  const {target,radius,stopRange,simSeconds,initialTargetDistance,progressMetres}=observation;
  const m=sampledMission===undefined?window.__RECLAIM__.snapshot().mission:sampledMission;
  if(!m||m.paused)return 'paused';
  const distance=Math.hypot(target.x-m.player.x,target.z-m.player.z);
  if(distance<=radius)return 'reached';
  if(stopRange!==null&&distance<=stopRange)return 'near';
  if(observation.firstElapsed===null)observation.firstElapsed=m.elapsed;
  if(progressMetres!==null&&initialTargetDistance-distance>=progressMetres)return 'progress';
  return m.elapsed-observation.firstElapsed>=simSeconds?'elapsed':false;
}
