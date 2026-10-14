import type { Collider, WorldBounds } from '../world/types.ts';
export type Position = { x:number; y:number; z:number };
export type WalkingTerrain = { heightAt:(x:number,z:number)=>number; inWater?:(x:number,z:number)=>boolean };
export type MoveInput = { forward:number; right:number; sprint:boolean; jump:boolean };
export const PLAYER_TUNING = Object.freeze({ status:'PROVISIONAL', walkSpeed:3.1, sprintSpeed:5.8, gravity:20, jumpSpeed:6, radius:.32, height:1.76, eyeHeight:1.62, maximumSlope:1.0, stepHeight:.45 });
export class CharacterController {
  position:Position; yaw:number; pitch=0; verticalVelocity=0; grounded=true; distance=0; recoveries=0; jumpHeld=false;
  terrain:WalkingTerrain; colliders:()=>readonly Collider[]; bounds:WorldBounds; spawn:{x:number;z:number;yaw:number};
  constructor(terrain:WalkingTerrain,colliders:()=>readonly Collider[],bounds:WorldBounds,spawn:{x:number;z:number;yaw:number}) {
    this.terrain=terrain;this.colliders=colliders;this.bounds=bounds;this.spawn=spawn;
    this.position={x:spawn.x,y:terrain.heightAt(spawn.x,spawn.z),z:spawn.z};this.yaw=spawn.yaw;
  }
  look(dx:number,dy:number) { if(!Number.isFinite(dx)||!Number.isFinite(dy))return;this.yaw-=dx*.0022;this.yaw=((this.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;this.pitch=Math.max(-1.35,Math.min(1.35,this.pitch-dy*.0022)); }
  blocked(x:number,z:number,y=this.position.y):boolean {
    const p=PLAYER_TUNING;
    return this.colliders().some(c=>{
      if(y+p.height<=c.minY||y>=c.maxY)return false;
      if(c.type==='cylinder')return Math.hypot(x-c.x,z-c.z)<c.radius+p.radius;
      const nx=Math.max(c.minX,Math.min(c.maxX,x)),nz=Math.max(c.minZ,Math.min(c.maxZ,z));return Math.hypot(x-nx,z-nz)<p.radius;
    });
  }
  restore(value:Position&{yaw:number;pitch:number}):boolean {
    if(![value.x,value.y,value.z,value.yaw,value.pitch].every(Number.isFinite))return false;
    if(value.x<this.bounds.minX+1||value.x>this.bounds.maxX-1||value.z<this.bounds.minZ+1||value.z>this.bounds.maxZ-1)return false;
    const y=this.terrain.heightAt(value.x,value.z);
    const eps=.35,slope=Math.hypot((this.terrain.heightAt(value.x+eps,value.z)-this.terrain.heightAt(value.x-eps,value.z))/(eps*2),(this.terrain.heightAt(value.x,value.z+eps)-this.terrain.heightAt(value.x,value.z-eps))/(eps*2));
    if(this.terrain.inWater?.(value.x,value.z)||slope>PLAYER_TUNING.maximumSlope)return false;
    if(Math.abs(value.y-y)>3||this.blocked(value.x,value.z,y))return false;
    this.position={x:value.x,y,z:value.z};this.yaw=value.yaw;this.pitch=Math.max(-1.35,Math.min(1.35,value.pitch));this.verticalVelocity=0;this.grounded=true;return true;
  }
  recover() {this.position={x:this.spawn.x,y:this.terrain.heightAt(this.spawn.x,this.spawn.z),z:this.spawn.z};this.verticalVelocity=0;this.grounded=true;this.jumpHeld=false;this.recoveries++;}
  step(input:MoveInput,seconds:number) {
    const dt=Math.max(0,Math.min(.1,Number.isFinite(seconds)?seconds:0)),p=PLAYER_TUNING;
    if(!dt)return;
    let f=Math.max(-1,Math.min(1,input.forward)),r=Math.max(-1,Math.min(1,input.right));const length=Math.hypot(f,r);if(length>1){f/=length;r/=length;}
    const speed=input.sprint?p.sprintSpeed:p.walkSpeed;
    const dx=(-Math.sin(this.yaw)*f+Math.cos(this.yaw)*r)*speed*dt,dz=(-Math.cos(this.yaw)*f-Math.sin(this.yaw)*r)*speed*dt;
    if(input.jump&&!this.jumpHeld&&this.grounded){this.verticalVelocity=p.jumpSpeed;this.grounded=false;}this.jumpHeld=input.jump;
    const pieces=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let i=0;i<pieces;i++) {
      const old={...this.position};
      const move=(axis:'x'|'z',delta:number)=>{
        const x=axis==='x'?this.position.x+delta:this.position.x,z=axis==='z'?this.position.z+delta:this.position.z;
        const from=this.terrain.heightAt(this.position.x,this.position.z),to=this.terrain.heightAt(x,z);
        const eps=.35;const slope=Math.hypot((this.terrain.heightAt(x+eps,z)-this.terrain.heightAt(x-eps,z))/(eps*2),(this.terrain.heightAt(x,z+eps)-this.terrain.heightAt(x,z-eps))/(eps*2));
        if(this.terrain.inWater?.(x,z)||to-from>p.stepHeight||slope>p.maximumSlope||this.blocked(x,z,Math.max(to,this.position.y)))return;
        this.position[axis]+=delta;
      };
      move('x',dx/pieces);move('z',dz/pieces);this.distance+=Math.hypot(this.position.x-old.x,this.position.z-old.z);
    }
    this.verticalVelocity-=p.gravity*dt;this.position.y+=this.verticalVelocity*dt;
    const ground=this.terrain.heightAt(this.position.x,this.position.z);
    if(this.position.y<=ground){this.position.y=ground;this.verticalVelocity=0;this.grounded=true;}
    else if(this.position.y-ground<.4&&this.verticalVelocity<0){this.position.y=ground;this.verticalVelocity=0;this.grounded=true;}
    const b=this.bounds;
    if(!Number.isFinite(this.position.y)||this.position.y<ground-15||this.position.x<b.minX+1||this.position.x>b.maxX-1||this.position.z<b.minZ+1||this.position.z>b.maxZ-1)this.recover();
  }
}
