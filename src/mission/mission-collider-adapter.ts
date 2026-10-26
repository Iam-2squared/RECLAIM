/**
 * Conservative collision snapshot for existing RECLAIM colliders.
 * Cylinder obstacles use their legacy broadphase AABB, so visible projectiles
 * never pass through cover that the original obstruction query considered solid.
 * Pure: no campaign writes, Three objects, or damage processing.
 */
import type { SegmentWorld, Solid, DroneTarget, ImpactMaterial } from './trajectory-effects.ts';
export type CollisionProxy =
  | Readonly<{ type:'cylinder';x:number;z:number;radius:number;minY:number;maxY:number;tag:string }>
  | Readonly<{ type:'aabb';minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number;tag:string }>;
export type MaterialChooser = (collider:CollisionProxy)=>Exclude<ImpactMaterial,'terrain'|'drone'|'humanoid'>;
const defaultMaterial:MaterialChooser=c=>{
  const tag=c.tag.toLowerCase();
  if(/wood|cabin|trunk|tree|timber/.test(tag))return 'wood';
  if(/metal|wreck|fence|steel/.test(tag))return 'metal';
  return 'stone';
};
export function missionSegmentWorld(colliders:readonly CollisionProxy[],
  heightAt:(x:number,z:number)=>number,
  drone:DroneTarget|null,materialFor:MaterialChooser=defaultMaterial):SegmentWorld {
  const solids:Solid[]=colliders.map((c,i)=>{
    if(typeof c.tag!=='string'||c.tag.length===0)throw new RangeError('invalid collider tag');
    if(c.type==='cylinder'&&(!Number.isFinite(c.radius)||c.radius<=0))throw new RangeError('invalid cylinder radius');
    const bounds=c.type==='aabb'
      ?{minX:c.minX,maxX:c.maxX,minY:c.minY,maxY:c.maxY,minZ:c.minZ,maxZ:c.maxZ}
      :{minX:c.x-c.radius,maxX:c.x+c.radius,minY:c.minY,maxY:c.maxY,minZ:c.z-c.radius,maxZ:c.z+c.radius};
    if(!Object.values(bounds).every(Number.isFinite)||bounds.minX>=bounds.maxX||bounds.minY>=bounds.maxY||bounds.minZ>=bounds.maxZ)
      throw new RangeError('invalid world collider bounds');
    const material=materialFor(c);
    if(!['stone','wood','metal'].includes(material))throw new RangeError('invalid obstacle material');
    return {id:`obstacle:${i}:${c.tag}`,material,bounds};
  });
  return {solids,drone,heightAt};
}
