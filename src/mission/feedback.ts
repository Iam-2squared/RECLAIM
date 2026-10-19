/**
 * Predictable cosmetic recoil and disabled-drone motion for fictional combat.
 * Not a firearm simulation. These rigs do not alter campaign events, hits,
 * player camera authority, save data or permanent object transforms.
 */
export type WeaponKind = 'assault' | 'sniper' | 'rifle';
export type WeaponPose = Readonly<{rear:number; drop:number; rise:number; flash:number}>;
export const FEEDBACK_LIMITS=Object.freeze({maxRear:.17,maxDrop:.08,maxRise:.12,maxFlash:.065});
const kick:Readonly<Record<WeaponKind,Readonly<{rear:number;drop:number;rise:number}>>>=Object.freeze({
 assault:{rear:.062,drop:.022,rise:.042},
 sniper:{rear:.115,drop:.037,rise:.081},
 rifle:{rear:.075,drop:.026,rise:.055},
});
const decay=(t:number,halflife:number)=>Math.exp(-Math.LN2*t/halflife);
const finite=(v:number)=>Number.isFinite(v);
/** Instant impulses with smoothly decaying gun-only offsets. */
export class WeaponFeedback {
 private rear=0;private drop=0;private rise=0;private flash=0;
 readonly reducedMotion:boolean;
 constructor(reducedMotion=false){this.reducedMotion=reducedMotion;}
 fire(kind:WeaponKind):void {
  const p=kick[kind];if(!p)return;
  const motion=this.reducedMotion?.27:1;
  this.rear=Math.min(FEEDBACK_LIMITS.maxRear,this.rear+p.rear*motion);
  this.drop=Math.min(FEEDBACK_LIMITS.maxDrop,this.drop+p.drop*motion);
  this.rise=Math.min(FEEDBACK_LIMITS.maxRise,this.rise+p.rise*motion);
  this.flash=FEEDBACK_LIMITS.maxFlash;
 }
 step(dt:number):void {
  if(!finite(dt)||dt<=0)return;
  const safe=Math.min(dt,.25);
  this.rear*=decay(safe,.09);this.drop*=decay(safe,.11);this.rise*=decay(safe,.135);
  this.flash=Math.max(0,this.flash-safe);
  for(const key of ['rear','drop','rise'] as const)if(this[key]<1e-5)this[key]=0;
 }
 get pose():WeaponPose{return {rear:this.rear,drop:this.drop,rise:this.rise,flash:this.flash};}
 clear():void{this.rear=this.drop=this.rise=this.flash=0;}
}
export type DroneCrashPose=Readonly<{y:number;bank:number;stopped:boolean;settled:boolean}>;
/** Ground-aware damped fall: used only after the authoritative HP==0 transition. */
export class DroneCrashRig {
 private verticalSpeed=0;private bank=0;private bankSpeed=1.5;
 private settled=false;
 private constGround=0;
 private started=false;
 private visualY:number|null=null;
 step(dt:number,currentY:number,groundY:number):DroneCrashPose {
  if(!finite(dt)||dt<=0||!finite(currentY)||!finite(groundY))return{y:currentY,bank:this.bank,stopped:true,settled:this.settled};
  if(!this.started){this.started=true;this.constGround=groundY;this.visualY=currentY;}
  const floor=Math.max(this.constGround,groundY)+.25;
  if(this.settled)return{y:floor,bank:this.bank,stopped:true,settled:true};
  const step=Math.min(.1,dt);
  this.verticalSpeed=Math.min(8,this.verticalSpeed+11*step);
  const y=Math.max(floor,(this.visualY??currentY)-this.verticalSpeed*step);
  this.visualY=y;
  this.bank=Math.min(.95,this.bank+this.bankSpeed*step);
  if(y<=floor+1e-5){this.verticalSpeed=0;this.bankSpeed=0;this.settled=true;}
  return{y,bank:this.bank,stopped:true,settled:this.settled};
 }
 reset():void {this.verticalSpeed=0;this.bank=0;this.bankSpeed=1.5;this.settled=false;this.started=false;this.visualY=null;}
}
