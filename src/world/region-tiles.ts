/**
 * Bounded, region-local tile planner for eventual Japan terrain streaming.
 * Coordinates are local metres; selecting a prefecture does not fabricate
 * height data, unlock the campaign, or allocate geometry. Producers may use
 * tiles only after installing licensed terrain material for that region.
 */
import {prefectureByCode} from './japan-catalog.ts';
export const REGION_TILE_RULES=Object.freeze({sizeMetres:256,lowRadius:1,balancedRadius:2,loadLimit:2,evictLimit:5,maxCoordinate:1_000_000});
export type TileDetail='low'|'balanced';
export type TileCoord=Readonly<{code:string;x:number;z:number;key:string}>;
export type TilePlan=Readonly<{desired:readonly TileCoord[];load:readonly TileCoord[];evict:readonly string[];retained:readonly string[]}>;
const key=(code:string,x:number,z:number)=>code+':'+x+':'+z;
// Focus bounds are not permission to create tiles beyond the configured domain.
const minTile=Math.floor(-REGION_TILE_RULES.maxCoordinate/REGION_TILE_RULES.sizeMetres);
const maxTile=Math.floor(REGION_TILE_RULES.maxCoordinate/REGION_TILE_RULES.sizeMetres);
const inTileBounds=(x:number,z:number)=>x>=minTile&&x<=maxTile&&z>=minTile&&z<=maxTile;
export function tileKey(code:string,x:number,z:number):string {
 if(!prefectureByCode(code)||!Number.isSafeInteger(x)||!Number.isSafeInteger(z)||!inTileBounds(x,z))throw new RangeError('invalid tile address');
 return key(code,x,z);
}
/**
 * No side effects: caller must perform evictions, create meshes, then persist
 * successful loads separately. A pending fetch cannot be reported as loaded.
 */
export function planRegionTiles(code:string,xMetres:number,zMetres:number,detail:TileDetail,loadedKeys:readonly string[]):TilePlan {
 if(!prefectureByCode(code))throw new RangeError('unknown prefecture');
 if(!Number.isFinite(xMetres)||!Number.isFinite(zMetres)||Math.abs(xMetres)>REGION_TILE_RULES.maxCoordinate||Math.abs(zMetres)>REGION_TILE_RULES.maxCoordinate)throw new RangeError('invalid local focus');
 if(detail!=='low'&&detail!=='balanced')throw new RangeError('unknown detail');
 const radius=detail==='low'?REGION_TILE_RULES.lowRadius:REGION_TILE_RULES.balancedRadius;
 const tx=Math.floor(xMetres/REGION_TILE_RULES.sizeMetres),tz=Math.floor(zMetres/REGION_TILE_RULES.sizeMetres);
 const desired:TileCoord[]=[];
 for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)if(inTileBounds(tx+dx,tz+dz))desired.push({code,x:tx+dx,z:tz+dz,key:key(code,tx+dx,tz+dz)});
 desired.sort((a,b)=>((a.x-tx)**2+(a.z-tz)**2)-((b.x-tx)**2+(b.z-tz)**2)||a.z-b.z||a.x-b.x);
 const expected=new Set(desired.map(t=>t.key));
 const unique=[...new Set(loadedKeys)];
 const missing=desired.filter(t=>!unique.includes(t.key));
 const obsolete=unique.filter(k=>!expected.has(k));
 // Evict oldest external-state entries first, never use invisible future tiles.
 const evict=obsolete.slice(0,REGION_TILE_RULES.evictLimit);
 const kept=unique.filter(k=>!evict.includes(k));
 const available=Math.max(0,desired.length-kept.length);
 const load=missing.slice(0,Math.min(REGION_TILE_RULES.loadLimit,available));
 return {desired:Object.freeze(desired),load:Object.freeze(load),evict:Object.freeze(evict),retained:Object.freeze(kept)};
}
