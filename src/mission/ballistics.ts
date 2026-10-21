/**
 * PROVISIONAL game-only projectile clock. Scene coordinates are not a
 * real-world weapon calibration. No DOM/Three dependency.
 * The host sweeps every fixed-step segment through terrain and targets.
 */
export type Vector3 = Readonly<{ x: number; y: number; z: number }>;
export type ProjectileState = Readonly<{
  id: number; position: Vector3; velocity: Vector3; age: number; distance: number;
}>;
export type ProjectileEvent = Readonly<{
  id: number; from: Vector3; to: Vector3; hit: boolean; expired: boolean;
}>;
export type SweepHit = Readonly<{ fraction: number }>;
export type Sweep = (from: Vector3, to: Vector3, id: number) => SweepHit | null;
export const PROJECTILE_RULES = Object.freeze({
  gravity: 7.2, speed: 82, maxAge: 1.8, maxDistance: 140,
  maxActive: 24, fixedStep: 1 / 120,
});
const finite = (v: number) => Number.isFinite(v);
const fvec = (p: Vector3) => finite(p.x) && finite(p.y) && finite(p.z);
const add = (a: Vector3, b: Vector3, scale: number): Vector3 =>
  ({ x:a.x+b.x*scale, y:a.y+b.y*scale, z:a.z+b.z*scale });
const dist = (a: Vector3, b: Vector3) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function unitDirection(direction: Vector3): Vector3 {
  if (!fvec(direction)) throw new RangeError('non-finite projectile direction');
  const n = Math.hypot(direction.x,direction.y,direction.z);
  if (n < 1e-8) throw new RangeError('zero projectile direction');
  return { x:direction.x/n,y:direction.y/n,z:direction.z/n };
}
/** Swept segment against a sphere, not an infinite ray. */
export function sphereSweep(from: Vector3,to: Vector3,center: Vector3,radius: number): SweepHit|null {
  if(!fvec(from)||!fvec(to)||!fvec(center)||!finite(radius)||radius<=0)return null;
  const d={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};
  const o={x:from.x-center.x,y:from.y-center.y,z:from.z-center.z};
  const a=d.x*d.x+d.y*d.y+d.z*d.z;
  const c=o.x*o.x+o.y*o.y+o.z*o.z-radius*radius;
  if(c<=0)return {fraction:0};
  if(a<=1e-12)return null;
  const b=2*(d.x*o.x+d.y*o.y+d.z*o.z);
  const det=b*b-4*a*c;
  if(det<0)return null;
  const t=(-b-Math.sqrt(det))/(2*a);
  return t>=0&&t<=1?{fraction:t}:null;
}
export function boxSweep(from: Vector3,to: Vector3,box: Readonly<{
  minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number;
}>): SweepHit|null {
  if(!fvec(from)||!fvec(to)||![box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ].every(finite))return null;
  let enter=0,leave=1;
  for(const [start,end,lo,hi] of [
    [from.x,to.x,box.minX,box.maxX],[from.y,to.y,box.minY,box.maxY],[from.z,to.z,box.minZ,box.maxZ],
  ]){
    if(lo>hi)return null;
    const delta=end-start;
    if(Math.abs(delta)<1e-10){if(start<lo||start>hi)return null;continue;}
    const a=(lo-start)/delta,b=(hi-start)/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>leave)return null;
  }
  return {fraction:enter};
}
/** Finite-budget terrain collision with refinement at the first surface crossing. */
export function terrainSweep(from: Vector3,to: Vector3,heightAt:(x:number,z:number)=>number,clearance=0): SweepHit|null {
  if(!fvec(from)||!fvec(to)||!finite(clearance)||clearance<0)return null;
  const delta={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};
  const sample=(t:number)=>{
    const x=from.x+delta.x*t,z=from.z+delta.z*t,h=heightAt(x,z);
    if(!finite(h))throw new RangeError('invalid terrain height');
    return from.y+delta.y*t-h-clearance;
  };
  if(sample(0)<=0)return {fraction:0};
  const n=Math.max(1,Math.ceil(dist(from,to)/.25));
  if(n>64)throw new RangeError('terrain sweep exceeds collision budget');
  let old=0;
  for(let i=1;i<=n;i++){
    const t=i/n;
    if(sample(t)<=0){let lo=old,hi=t;
      for(let k=0;k<8;k++){const mid=(lo+hi)/2;if(sample(mid)<=0)hi=mid;else lo=mid;}
      return {fraction:hi};
    }
    old=t;
  }
  return null;
}
export function nearestSweep(from: Vector3,to: Vector3,id:number,sweeps:readonly Sweep[]): SweepHit|null {
  let t=Infinity;
  for(const sweep of sweeps){const hit=sweep(from,to,id);if(hit&&finite(hit.fraction)&&hit.fraction>=0&&hit.fraction<=1)t=Math.min(t,hit.fraction);}
  return finite(t)?{fraction:t}:null;
}
/** Exactly one terminal impact or expiry per projectile. */
export class ProjectilePool {
  private nextId=1;
  private active:ProjectileState[]=[];
  // External impact callbacks can close a session or trigger another tick.
  // Never resurrect cleared shots or count a nested hit twice.
  private inStep=false;
  private revision=0;
  get size():number{return this.active.length;}
  get states():readonly ProjectileState[]{return this.active;}
  spawn(position:Vector3,direction:Vector3,speed=PROJECTILE_RULES.speed):number|null {
    // Follow-up shots must be queued by the host for a later fixed tick.
    if(this.inStep)throw new Error('cannot spawn during projectile step');
    if(!fvec(position)||!finite(speed)||speed<=0||speed>300)throw new RangeError('invalid projectile launch');
    if(this.active.length>=PROJECTILE_RULES.maxActive)return null;
    const u=unitDirection(direction),id=this.nextId++;
    this.active.push({id,position:{...position},velocity:{x:u.x*speed,y:u.y*speed,z:u.z*speed},age:0,distance:0});
    return id;
  }
  step(dt:number,sweep:Sweep):readonly ProjectileEvent[] {
    if(this.inStep)throw new Error('reentrant projectile step');
    if(!finite(dt)||dt<=0||dt>PROJECTILE_RULES.fixedStep+1e-8)throw new RangeError('invalid fixed step');
    const next:ProjectileState[]=[],events:ProjectileEvent[]=[];
    const revision=this.revision;
    this.inStep=true;
    try {
    for(const s of this.active){
      // The final partial tick may not travel beyond the projectile lifespan.
      // Collision sweeps and visual tracer endpoints share this clipped path.
      const travelDt=Math.min(dt,Math.max(0,PROJECTILE_RULES.maxAge-s.age));
      const age=s.age+travelDt;
      const newVelocity={...s.velocity,y:s.velocity.y-PROJECTILE_RULES.gravity*travelDt};
      const target={x:s.position.x+s.velocity.x*travelDt,y:s.position.y+s.velocity.y*travelDt-PROJECTILE_RULES.gravity*travelDt*travelDt/2,z:s.position.z+s.velocity.z*travelDt};
      const length=dist(s.position,target);
      const allowed=Math.min(1,(PROJECTILE_RULES.maxDistance-s.distance)/Math.max(length,1e-12));
      const endpoint=add(s.position,{x:target.x-s.position.x,y:target.y-s.position.y,z:target.z-s.position.z},allowed);
      const contact=sweep(s.position,endpoint,s.id);
      if(revision!==this.revision)return []; // session cleared during callback
      if(contact&&(!finite(contact.fraction)||contact.fraction<0||contact.fraction>1))throw new RangeError('invalid collision fraction');
      const valid=contact?contact.fraction:null;
      const hit=valid!==null;
      const end=hit?add(s.position,{x:endpoint.x-s.position.x,y:endpoint.y-s.position.y,z:endpoint.z-s.position.z},valid):endpoint;
      const travelled=dist(s.position,end);
      const expired=!hit&&(age>=PROJECTILE_RULES.maxAge-1e-8||s.distance+travelled>=PROJECTILE_RULES.maxDistance-1e-8);
      events.push({id:s.id,from:s.position,to:end,hit,expired});
      if(!hit&&!expired)next.push({id:s.id,position:end,velocity:newVelocity,age,distance:s.distance+travelled});
    }
    this.active=next;
    return events;
    } finally {this.inStep=false;}
  }
  clear():void{this.revision++;this.active=[];}
}
