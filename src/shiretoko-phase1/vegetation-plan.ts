/**
 * Deterministic, terrain-aware instance positions for the existing 2.4 km
 * Shiretoko study area. Terrain samplers are injected so rendering and
 * collision can continue sharing their canonical height surface.
 * No geometry, textures, land-use claims or external assets in this module.
 */
export const FLORA_RULES=Object.freeze({extent:1200,chunkMetres:300,cellMetres:10,seed:431071,maxSlope:.9,trailClearance:8});
export type FloraKind='spruce'|'birch'|'alpine-shrub'|'sedge'|'sasa'|'stone';
export type FloraInstance=Readonly<{kind:FloraKind;x:number;y:number;z:number;rotation:number;scale:number}>;
export type FloraSurface=Readonly<{
 height:(x:number,z:number)=>number;
 slope:(x:number,z:number)=>number;
 wetness:(x:number,z:number,y:number)=>number;
 routeDistance:(x:number,z:number)=>number;
 water:(x:number,z:number)=>boolean;
}>;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function random(x:number,z:number,salt:number):number {
 let h=(Math.imul(x,0x9e3779b1)^Math.imul(z,0x85ebca77)^Math.imul(salt,0xc2b2ae3d)^FLORA_RULES.seed)>>>0;
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
 return (h>>>0)/4294967296;
}
/** Chunk-local 30x30 lattice with coordinate-derived jitter: no seam duplicates. */
export function planFlora(chunkX:number,chunkZ:number,surface:FloraSurface,quality:'low'|'balanced'):readonly FloraInstance[] {
 if(!Number.isInteger(chunkX)||!Number.isInteger(chunkZ)||chunkX<0||chunkX>=8||chunkZ<0||chunkZ>=8)throw new RangeError('outside Shiretoko chunk grid');
 if(quality!=='low'&&quality!=='balanced')throw new RangeError('invalid foliage quality');
 const instances:FloraInstance[]=[],perSide=FLORA_RULES.chunkMetres/FLORA_RULES.cellMetres;
 const x0=-FLORA_RULES.extent+chunkX*FLORA_RULES.chunkMetres,z0=-FLORA_RULES.extent+chunkZ*FLORA_RULES.chunkMetres;
 for(let iz=0;iz<perSide;iz++)for(let ix=0;ix<perSide;ix++){
  const gx=chunkX*perSide+ix,gz=chunkZ*perSide+iz;
  // Balanced contains every low instance; lower LOD only drops details.
  const choose=random(gx,gz,1);
  if(choose> (quality==='low'?.23:.54))continue;
  const x=x0+(ix+.22+.56*random(gx,gz,2))*FLORA_RULES.cellMetres;
  const z=z0+(iz+.22+.56*random(gx,gz,3))*FLORA_RULES.cellMetres;
  if(surface.water(x,z)||surface.routeDistance(x,z)<FLORA_RULES.trailClearance)continue;
  const y=surface.height(x,z),slope=surface.slope(x,z),wet=clamp(surface.wetness(x,z,y));
  if(![y,slope,wet].every(Number.isFinite)||slope<0)continue;
  let kind:FloraKind;
  const species=random(gx,gz,4);
  if(slope>FLORA_RULES.maxSlope)kind='stone';
  else if(wet>.72)kind='sedge';
  else if(y>300)kind=species<.65?'alpine-shrub':'stone';
  else if(wet>.43)kind=species<.65?'sasa':'birch';
  else kind=species<.57?'spruce':species<.82?'birch':'sasa';
  const scale=.8+random(gx,gz,5)*.47;
  instances.push(Object.freeze({kind,x,y,z,rotation:random(gx,gz,6)*Math.PI*2,scale}));
 }
 return Object.freeze(instances);
}
