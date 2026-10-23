/**
 * Shiretoko far-shore two-axis relief, experimental geometry improvement.
 * Changes the SAME height source read by scenery mesh, normal, and contact
 * sampling. Neither fog nor display-only offsets are used to mask the coast.
 * Real 5/20/80m mesh, 360-degree visuals and footprint still require review.
 */
export const RELIEF_V5=Object.freeze({
  zStart:-4240,zFull:-4480,zFade:-5000,zEnd:-5600,
  coastSeaStart:-460,coastSeaFull:-220,
  coastLandFull:300,coastLandEnd:740,
  sampleOffset:140,maxBaseSamplesPerVertex:9,
});
const finite=Number.isFinite;
const smoothstep=(a:number,b:number,x:number):number=>{
  if(a===b)throw new RangeError('invalid relief interval');
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
};
/**
 * A bounded symmetric 3x3 low-pass for near-shore cliffs in both axes.
 * Samples the raw source, NEVER itself. No smoothing within protected
 * walkable bounds, the entire preserved near mesh, or the 20/80m join row.
 */
export function farCoastReliefV5(
  x:number,z:number,base:(x:number,z:number)=>number,
  coast:(x:number,z:number)=>number,
):number {
  const original=base(x,z);
  if(!finite(x)||!finite(z)||!finite(original))return original;
  if(z>=RELIEF_V5.zStart||z<=RELIEF_V5.zEnd)return original;
  const along=smoothstep(RELIEF_V5.zStart,RELIEF_V5.zFull,z)*
    (1-smoothstep(RELIEF_V5.zFade,RELIEF_V5.zEnd,z));
  if(along<=0)return original;
  const d=coast(x,z);
  if(!finite(d))return original;
  const across=smoothstep(RELIEF_V5.coastSeaStart,RELIEF_V5.coastSeaFull,d)*
    (1-smoothstep(RELIEF_V5.coastLandFull,RELIEF_V5.coastLandEnd,d));
  const blend=along*across;
  if(blend<=0)return original;
  let total=original;
  const delta=RELIEF_V5.sampleOffset;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dz===0)continue;
    const h=base(x+dx*delta,z+dz*delta);
    if(!finite(h))return original;
    total+=h;
  }
  return original+(total/9-original)*blend;
}
