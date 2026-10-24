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
  // A hidden/backgrounded tab may supply a multi-second elapsed interval.
  // Cosmetic recoil must be gone on return, not left stuck at the .25s cap.
  const safe=dt;
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
 private elapsed=0;
 private bank=0;
 private settled=false;
 private restingY=0;
 /** Last finite cosmetic position. Invalid terrain samples must never poison a mesh. */
 private lastSafeY=0;
 private groundAtStart=0;
 private contactGround=0;
 private startY=0;
 private started=false;
 private readonly acceleration=11;
 private readonly terminalSpeed=8;
 /** Analytic travel prevents fall speed/bank from depending on render FPS. */
 private fallDistance(t:number):number {
  const toTerminal=this.terminalSpeed/this.acceleration;
  if(t<=toTerminal)return .5*this.acceleration*t*t;
  return .5*this.acceleration*toTerminal*toTerminal+this.terminalSpeed*(t-toTerminal);
 }
 step(dt:number,currentY:number,groundY:number):DroneCrashPose {
  // Sleep is a terminal cosmetic pose. Do not re-query terrain after contact:
  // a moved/invalid sampling point must never teleport the disabled wreck.
  if(this.settled)return{y:this.restingY,bank:this.bank,stopped:true,settled:true};
  // The existing PR #8 contract leaves a non-advancing frame's authoritative
  // finite y untouched. Preserving this matters for retry, pause and callers
  // that use dt<=0 for sampling without committing a cosmetic movement.
  if(!finite(dt)||dt<=0)
   return{y:finite(currentY)?currentY:(this.started?this.lastSafeY:0),bank:this.bank,stopped:true,settled:false};
  // A valid elapsed frame with an invalid height probe must hold the last
  // *drawn* position; returning scene y would resurrect a falling wreck.
  if(!finite(currentY)||!finite(groundY))
   return{y:this.started?this.lastSafeY:(finite(currentY)?currentY:0),bank:this.bank,stopped:true,settled:false};
  if(!this.started){
   // A first terrain sample is credible only if the wreck has clearance.
   // A transient LOD/coordinate mismatch must not snap it upwards or
   // permanently freeze at a floor above its visible pre-crash position.
   if(groundY+.25>currentY+1e-7)
    return{y:currentY,bank:this.bank,stopped:true,settled:false};
   this.started=true;this.groundAtStart=groundY;this.contactGround=groundY;this.startY=currentY;this.lastSafeY=currentY;
  }
  // The drone stops moving in X/Z once disabled. Never accept a later
  // ground sample that sits ABOVE the already-rendered wreck: that sample
  // is inconsistent with a stationary world and would pop the wreck upward.
  // Ground uplift below the current visible height is still respected, so
  // genuine early contacts cannot sink through the floor. Track the highest
  // credible floor to avoid oscillation between successive LOD probes.
  if(groundY+.25<=Math.min(this.startY,this.lastSafeY)+1e-7)
   this.contactGround=Math.max(this.contactGround,groundY);
  const floor=this.contactGround+.25;
  this.elapsed+=dt;
  this.bank=Math.min(.95,1.5*this.elapsed);
  const y=Math.max(floor,this.startY-this.fallDistance(this.elapsed));
  if(y<=floor+1e-5){this.settled=true;this.restingY=y;}
  this.lastSafeY=y;
  return{y,bank:this.bank,stopped:true,settled:this.settled};
 }
 reset():void {this.elapsed=0;this.bank=0;this.settled=false;this.started=false;this.groundAtStart=0;this.contactGround=0;this.startY=0;this.restingY=0;this.lastSafeY=0;}
}
