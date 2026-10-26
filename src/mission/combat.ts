import type { Collider } from '../world/types.ts';
import type { Position,WalkingTerrain } from './controller.ts';
import type { GunId } from '../home-state.ts';
export const COMBAT_TUNING = Object.freeze({ status:'PROVISIONAL', playerHp:100, droneHp:24, scanRadius:23, attackRadius:8, leash:16, droneSpeed:1.1, attackDamage:4, attackInterval:2.4, aimRadius:.72 });
export const WEAPON_TUNING:Record<GunId,{status:'PROVISIONAL';damage:number;interval:number;range:number}>={assault:{status:'PROVISIONAL',damage:8,interval:.2,range:85},sniper:{status:'PROVISIONAL',damage:12,interval:.65,range:120},rifle:{status:'PROVISIONAL',damage:8,interval:.38,range:95}};
export type DroneState='idle'|'scanning'|'following'|'attacking'|'retreating'|'stopped';
export class ScoutDrone {
  id='shiretoko-scout-01';state:DroneState='idle';hp:number=COMBAT_TUNING.droneHp;hits=0;clock=0;attackClock=0;scanClock=0;position:Position;origin:{x:number;z:number};
  constructor(x:number,z:number,height:number,defeated=false){this.origin={x,z};this.position={x,y:height+2.1,z};if(defeated){this.hp=0;this.state='stopped';}}
  step(dt:number,player:Position,heightAt:(x:number,z:number)=>number,visible=true):number {
    dt=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;this.clock+=dt;const wasAttacking=this.state==='attacking';
    if(this.hp<=0){this.state='stopped';this.position.y=Math.max(heightAt(this.position.x,this.position.z)+.25,this.position.y-dt*2);return 0;}
    const distance=Math.hypot(player.x-this.position.x,player.z-this.position.z),home=Math.hypot(this.position.x-this.origin.x,this.position.z-this.origin.z);
    if(home>COMBAT_TUNING.leash||distance>COMBAT_TUNING.scanRadius+7||!visible&&this.state!=='idle')this.state='retreating';
    else if(distance<=COMBAT_TUNING.attackRadius&&visible)this.state='attacking';
    else if(distance<COMBAT_TUNING.scanRadius&&visible){if(this.state==='idle'||this.state==='retreating')this.scanClock=0;this.scanClock+=dt;this.state=this.scanClock<.7?'scanning':'following';}
    else this.state='idle';
    const target=this.state==='retreating'?this.origin:player;
    if(this.state==='following'||this.state==='retreating'){
      const dx=target.x-this.position.x,dz=target.z-this.position.z,len=Math.hypot(dx,dz);
      if(len>.4){this.position.x+=dx/len*COMBAT_TUNING.droneSpeed*dt;this.position.z+=dz/len*COMBAT_TUNING.droneSpeed*dt;}
      if(this.state==='retreating'&&len<.6)this.state='idle';
    }
    this.position.y=heightAt(this.position.x,this.position.z)+2.1+Math.sin(this.clock*2.2)*.14;
    // Attack energy never charges while patrolling, searching, occluded or retreating.
    // Entering range starts a full, dodgeable wind-up instead of an instant hit.
    if(this.state==='attacking'){
      if(!wasAttacking)this.attackClock=0;
      this.attackClock+=dt;
      if(this.attackClock>=COMBAT_TUNING.attackInterval){
        this.attackClock-=COMBAT_TUNING.attackInterval;
        return COMBAT_TUNING.attackDamage;
      }
    }else this.attackClock=0;
    return 0;
  }
  hit(damage:number):boolean {if(this.hp<=0||damage<=0||!Number.isFinite(damage))return false;this.hits++;this.hp=Math.max(0,this.hp-damage);if(this.hp===0)this.state='stopped';return true;}
}
export function raySphere(origin:Position,direction:Position,center:Position,radius:number):number|null {
  const x=center.x-origin.x,y=center.y-origin.y,z=center.z-origin.z,t=x*direction.x+y*direction.y+z*direction.z,d2=x*x+y*y+z*z-t*t;
  if(d2>radius*radius)return null;const offset=Math.sqrt(radius*radius-d2);return t-offset>=0?t-offset:t+offset>=0?t+offset:null;
}
/** Gameplay obstruction shares player colliders, plus samples the canonical terrain. */
export function obstructionDistance(origin:Position,direction:Position,range:number,colliders:readonly Collider[],terrain:WalkingTerrain):number {
  let result=range;
  const endX=origin.x+direction.x*range,endY=origin.y+direction.y*range,endZ=origin.z+direction.z*range;
  const rayMinX=Math.min(origin.x,endX)-1e-7,rayMaxX=Math.max(origin.x,endX)+1e-7,rayMinY=Math.min(origin.y,endY)-1e-7,rayMaxY=Math.max(origin.y,endY)+1e-7,rayMinZ=Math.min(origin.z,endZ)-1e-7,rayMaxZ=Math.max(origin.z,endZ)+1e-7;
  for(const c of colliders){
    // Conservatively enclose trunks/rocks in their collision box, matching capsule blockers.
    const minX=c.type==='aabb'?c.minX:c.x-c.radius,maxX=c.type==='aabb'?c.maxX:c.x+c.radius,minZ=c.type==='aabb'?c.minZ:c.z-c.radius,maxZ=c.type==='aabb'?c.maxZ:c.z+c.radius;
    if(maxX<rayMinX||minX>rayMaxX||c.maxY<rayMinY||c.minY>rayMaxY||maxZ<rayMinZ||minZ>rayMaxZ)continue;
    let lo=0,hi=result,a:number,b:number;
    if(Math.abs(direction.x)<1e-8){if(origin.x<minX||origin.x>maxX)continue;}
    else{a=(minX-origin.x)/direction.x;b=(maxX-origin.x)/direction.x;if(a>b){const swap=a;a=b;b=swap;}lo=Math.max(lo,a);hi=Math.min(hi,b);}if(hi<lo)continue;
    if(Math.abs(direction.y)<1e-8){if(origin.y<c.minY||origin.y>c.maxY)continue;}
    else{a=(c.minY-origin.y)/direction.y;b=(c.maxY-origin.y)/direction.y;if(a>b){const swap=a;a=b;b=swap;}lo=Math.max(lo,a);hi=Math.min(hi,b);}if(hi<lo)continue;
    if(Math.abs(direction.z)<1e-8){if(origin.z<minZ||origin.z>maxZ)continue;}
    else{a=(minZ-origin.z)/direction.z;b=(maxZ-origin.z)/direction.z;if(a>b){const swap=a;a=b;b=swap;}lo=Math.max(lo,a);hi=Math.min(hi,b);}
    if(hi>=lo&&lo>=0)result=Math.min(result,lo);
  }
  for(let t=.35;t<result;t+=.45)if(origin.y+direction.y*t<terrain.heightAt(origin.x+direction.x*t,origin.z+direction.z*t)+.03){result=t;break;}
  return result;
}
