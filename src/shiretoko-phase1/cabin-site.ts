/** Footprint shared by the visible Shiretoko cliff cabin and flora clearance.
 * Terrain and preview remain in metres, X/Z horizontal, Y up. No save state.
 */
export const CABIN_SITE=Object.freeze({x:-100,z:835,width:18,depth:14,stairsRun:9});
/** Horizontal metres to the actual 18x14m cabin AND its east-facing stair run. */
export function cabinSiteClearanceDistance(x:number,z:number):number {
  const left=CABIN_SITE.x-CABIN_SITE.width/2;
  const right=CABIN_SITE.x+CABIN_SITE.width/2+CABIN_SITE.stairsRun;
  const back=CABIN_SITE.z-CABIN_SITE.depth/2;
  const front=CABIN_SITE.z+CABIN_SITE.depth/2;
  return Math.hypot(Math.max(left-x,0,x-right),Math.max(back-z,0,z-front));
}
