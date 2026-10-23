/**
 * Experimental Shiretoko distant coast shape correction (review-only V5).
 * This is a symmetric world-height filter, NOT visual fog or real-world DEM.
 * Off by default; see ?coastRelief=v5 on independent terrain preview.
 */
export const RELIEF_V5 = Object.freeze({
  zStart: -1200, zFull: -1400, zFade: -5000, zEnd: -5600,
  coastSeaStart: -460, coastSeaFull: -220,
  coastLandFull: 300, coastLandEnd: 740,
  sampleOffset: 140, maxBaseSamplesPerVertex: 9,
});
const finite=Number.isFinite;
const smoothstep = (a:number,b:number,x:number):number => {
  if(a===b)throw new RangeError('invalid relief interval');
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
};
/**
 * Always sample the ORIGINAL height callback, including its coastal geometry.
 * Both mesh vertices, normals and ground samples must use the identical surface
 * query; never change the graphical mesh alone. Invalidation is fail-closed:
 * nonfinite neighbours return the unmodified source and must be audited.
 */
export function farCoastReliefV5(
  x:number,z:number,
  base:(x:number,z:number)=>number,
  coast:(x:number,z:number)=>number,
):number {
  const original=base(x,z);
  if(!finite(x)||!finite(z)||!finite(original))return original;
  if(z>=RELIEF_V5.zStart || z<=RELIEF_V5.zEnd)return original;
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
  const softened=total/9;
  return original + (softened-original)*blend;
}
