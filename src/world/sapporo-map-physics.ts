import type {Collider} from './types.ts';
import {SAPPORO_MAP_META} from './sapporo-map-meta.ts';

export type SapporoTriangle=readonly [number,number,number,number,number,number,number,number,number];
export interface SapporoPhysicsData {version:string;sourceGlbSha256:string;colliders:readonly Collider[];floors:readonly SapporoTriangle[];water:readonly SapporoTriangle[];sourceGeometry?:{objects:number;vertices:number;polygons:number}}
export const SAPPORO_ARENA_COVERS=Object.values(SAPPORO_MAP_META.bossArenas).flatMap(arena=>[-1,1].flatMap(x=>[-1,1].map(z=>({id:`${arena.id}:cover:${x}:${z}`,x:arena.center.x+x*arena.radius*.64,z:arena.center.z+z*arena.radius*.36,width:3.4,depth:1.2,height:1.15}))));
const CELL=64;
const key=(x:number,z:number)=>`${x}:${z}`;
type TriangleBounds={triangle:SapporoTriangle;minX:number;maxX:number;minZ:number;maxZ:number};
function triangleHeight(t:SapporoTriangle,x:number,z:number):number|null{
 const denominator=(t[5]-t[8])*(t[0]-t[6])+(t[6]-t[3])*(t[2]-t[8]);
 if(Math.abs(denominator)<1e-8)return null;
 const a=((t[5]-t[8])*(x-t[6])+(t[6]-t[3])*(z-t[8]))/denominator,b=((t[8]-t[2])*(x-t[6])+(t[0]-t[6])*(z-t[8]))/denominator,c=1-a-b;
 if(a<-.00001||b<-.00001||c<-.00001)return null;
 return a*t[1]+b*t[4]+c*t[7];
}
function bounds(c:Collider){return c.type==='aabb'?c:{minX:c.x-c.radius,maxX:c.x+c.radius,minZ:c.z-c.radius,maxZ:c.z+c.radius};}
function index<T>(items:readonly T[],getBounds:(item:T)=>{minX:number;maxX:number;minZ:number;maxZ:number}){
 const cells=new Map<string,T[]>();
 for(const item of items){const b=getBounds(item);for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)for(let z=Math.floor(b.minZ/CELL);z<=Math.floor(b.maxZ/CELL);z++){const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k)!.push(item);}}
 return cells;
}

/** Authored road/paving triangles provide height; source AABBs stop walls/wrecks. */
export class SapporoMapPhysics {
 readonly bounds=SAPPORO_MAP_META.bounds;
 readonly spawn=SAPPORO_MAP_META.spawn;
 readonly allColliders:readonly Collider[];
 private readonly collisionCells;
 private readonly floors;
 private readonly water;
 constructor(data:SapporoPhysicsData){
  const triangles=(source:readonly SapporoTriangle[])=>source.map(triangle=>({triangle,minX:Math.min(triangle[0],triangle[3],triangle[6]),maxX:Math.max(triangle[0],triangle[3],triangle[6]),minZ:Math.min(triangle[2],triangle[5],triangle[8]),maxZ:Math.max(triangle[2],triangle[5],triangle[8])}));
  this.floors=index(triangles(data.floors),(t:TriangleBounds)=>t);this.water=index(triangles(data.water),(t:TriangleBounds)=>t);
  this.allColliders=[...data.colliders,...SAPPORO_ARENA_COVERS.map(c=>({type:'aabb' as const,minX:c.x-c.width/2,maxX:c.x+c.width/2,minZ:c.z-c.depth/2,maxZ:c.z+c.depth/2,minY:this.heightAt(c.x,c.z),maxY:this.heightAt(c.x,c.z)+c.height,tag:c.id}))];this.collisionCells=index(this.allColliders,bounds);
 }
 heightAt(x:number,z:number,referenceY?:number):number{
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  let result=0;
  for(const candidate of this.floors.get(key(Math.floor(x/CELL),Math.floor(z/CELL)))??[]){const h=triangleHeight(candidate.triangle,x,z);if(h!==null&&h>=result&&(referenceY===undefined||h<=referenceY+.65))result=h;}
  return result;
 }
 inWater(x:number,z:number,referenceY?:number):boolean{
  const height=this.heightAt(x,z,referenceY);
  for(const candidate of this.water.get(key(Math.floor(x/CELL),Math.floor(z/CELL)))??[]){const h=triangleHeight(candidate.triangle,x,z);if(h!==null&&height<h+.13)return true;}
  return false;
 }
 collidersNear(x:number,z:number,radius=28):readonly Collider[]{
  const result=new Set<Collider>();for(let cx=Math.floor((x-radius)/CELL);cx<=Math.floor((x+radius)/CELL);cx++)for(let cz=Math.floor((z-radius)/CELL);cz<=Math.floor((z+radius)/CELL);cz++)for(const collider of this.collisionCells.get(key(cx,cz))??[]){const b=bounds(collider);if(b.minX<=x+radius&&b.maxX>=x-radius&&b.minZ<=z+radius&&b.maxZ>=z-radius)result.add(collider);}
  return [...result];
 }
 blockedAt(x:number,z:number,y:number,radius:number,height:number):boolean{
  if(x<this.bounds.minX+radius||x>this.bounds.maxX-radius||z<this.bounds.minZ+radius||z>this.bounds.maxZ-radius)return true;
  return this.collidersNear(x,z,radius).some(c=>{
   if(y+height<=c.minY+.001||y>=c.maxY-.001)return false;
   if(c.type==='cylinder')return Math.hypot(x-c.x,z-c.z)<c.radius+radius;
   const nx=Math.max(c.minX,Math.min(c.maxX,x)),nz=Math.max(c.minZ,Math.min(c.maxZ,z));return Math.hypot(x-nx,z-nz)<radius;
  });
 }
}
