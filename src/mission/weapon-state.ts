/** Shared weapon clock for the playable prototype. Tuning is game balance only. */
export type EquippedWeapon = 'assault' | 'sniper' | 'knife';
export type WeaponShot = Readonly<{
  id:number; kind:EquippedWeapon; damage:number; range:number; speed:number; spread:number; melee:boolean;
}>;
export const WEAPON_RULES = Object.freeze({
  assault:Object.freeze({magazine:24,reserve:120,reload:1.8,interval:.16,damage:8,range:110,speed:100,hipSpread:.018,aimSpread:.004,automatic:true}),
  sniper:Object.freeze({magazine:5,reserve:25,reload:2.4,interval:.85,damage:12,range:140,speed:145,hipSpread:.007,aimSpread:.0006,automatic:false}),
  knife:Object.freeze({magazine:0,reserve:0,reload:0,interval:.48,damage:12,range:1.65,speed:0,hipSpread:0,aimSpread:0,automatic:false}),
});
type Supply = {ammo:number;reserve:number;readyAt:number};
export type ShootingPose = Readonly<{
  rear:number;drop:number;rise:number;flash:number;cameraPitch:number;cameraYaw:number;reload:number;swing:number;aim:number;
}>;
export type WeaponSnapshot = Readonly<{
  kind:EquippedWeapon;aiming:boolean;ammo:number|null;reserve:number|null;unlimitedReserve:boolean;reloading:boolean;
  reloadProgress:number;cooldown:number;triggerHeld:boolean;shots:number;
}>;
export type WeaponSupplyOptions = Readonly<{unlimitedReserve?:boolean}>;
const finite=(n:number)=>Number.isFinite(n);
const approach=(value:number,target:number,dt:number,speed:number)=>target+(value-target)*Math.exp(-speed*dt);

/** Input edges and held automatic fire share one simulation clock and ammo authority. */
export class WeaponState {
  kind:EquippedWeapon;
  private elapsed=0;
  private supply:Record<EquippedWeapon,Supply>;
  private readonly unlimitedReserve:boolean;
  private held=false;
  private pending=false;
  private aiming=false;
  private moving=false;
  private reloadTime=0;
  private reloadDuration=0;
  private serial=0;
  private rear=0;private drop=0;private rise=0;private flash=0;
  private pitch=0;private yaw=0;private aim=0;private swingTime=0;
  constructor(kind:EquippedWeapon='assault',options:WeaponSupplyOptions={}) {
    this.kind=kind;
    this.unlimitedReserve=options.unlimitedReserve!==false;
    this.supply=this.freshSupply();
  }
  private freshSupply():Record<EquippedWeapon,Supply> {
    return Object.fromEntries((['assault','sniper','knife'] as const).map(kind=>[
      kind,{ammo:WEAPON_RULES[kind].magazine,reserve:WEAPON_RULES[kind].reserve,readyAt:0},
    ])) as Record<EquippedWeapon,Supply>;
  }
  select(kind:EquippedWeapon):void {
    if(!Object.hasOwn(WEAPON_RULES,kind)||kind===this.kind)return;
    this.clearInput();this.kind=kind;
  }
  setAiming(value:boolean):void {this.aiming=!!value&&this.kind!=='knife'&&!this.reloading;}
  setMoving(value:boolean):void {this.moving=!!value;}
  trigger(pressed:boolean):void {
    if(pressed&&!this.held&&!this.reloading)this.pending=true;
    this.held=!!pressed&&!this.reloading;
    // Keep a complete click that occurs between simulation ticks. Only an
    // explicit pause/switch clears this buffered edge; releasing stops autofire.
  }
  get reloading():boolean {return this.reloadDuration>0;}
  private hasUnlimitedReserve():boolean {return this.kind!=='knife'&&this.unlimitedReserve;}
  reload():boolean {
    const rule=WEAPON_RULES[this.kind],stock=this.supply[this.kind];
    if(this.kind==='knife'||this.reloading||stock.ammo>=rule.magazine||(!this.hasUnlimitedReserve()&&stock.reserve<=0))return false;
    this.held=false;this.pending=false;this.aiming=false;
    this.reloadTime=0;this.reloadDuration=rule.reload;this.swingTime=0;
    return true;
  }
  step(seconds:number):readonly WeaponShot[] {
    if(!finite(seconds)||seconds<0)return [];
    // The host runs fixed ticks. A resumed tab cannot empty a magazine in one tick.
    const dt=Math.min(.1,seconds);
    this.elapsed+=dt;
    this.rear=approach(this.rear,0,dt,18);this.drop=approach(this.drop,0,dt,15);
    this.rise=approach(this.rise,0,dt,13);this.pitch=approach(this.pitch,0,dt,14);
    this.yaw=approach(this.yaw,0,dt,17);this.flash=Math.max(0,this.flash-dt);
    this.aim=approach(this.aim,this.aiming?1:0,dt,14);
    this.swingTime=Math.max(0,this.swingTime-dt);
    if(this.reloading){
      this.reloadTime+=dt;
      if(this.reloadTime+1e-8>=this.reloadDuration){
        const stock=this.supply[this.kind],rule=WEAPON_RULES[this.kind];
        const transfer=this.hasUnlimitedReserve()?rule.magazine-stock.ammo:Math.min(rule.magazine-stock.ammo,stock.reserve);
        stock.ammo+=transfer;if(!this.hasUnlimitedReserve())stock.reserve-=transfer;
        this.reloadTime=0;this.reloadDuration=0;
      }
      return [];
    }
    const rule=WEAPON_RULES[this.kind],stock=this.supply[this.kind];
    if(!(this.pending||(rule.automatic&&this.held))||this.elapsed+1e-8<stock.readyAt)return [];
    this.pending=false;
    if(this.kind!=='knife'&&stock.ammo<=0)return [];
    if(this.kind!=='knife')stock.ammo--;
    // Preserve the fire cadence without accumulating idle time as a burst.
    stock.readyAt=Math.max(this.elapsed-dt,stock.readyAt)+rule.interval;
    this.serial++;
    if(this.kind==='knife')this.swingTime=.36;
    else {
      const sniper=this.kind==='sniper',aimScale=this.aiming?.65:1;
      this.rear=Math.min(.17,this.rear+(sniper?.12:.065));
      this.drop=Math.min(.08,this.drop+(sniper?.038:.022));
      this.rise=Math.min(.13,this.rise+(sniper?.085:.045));
      this.pitch=Math.min(.085,this.pitch+(sniper?.045:.024)*aimScale);
      this.yaw=Math.max(-.025,Math.min(.025,this.yaw+(this.serial%2?1:-1)*(sniper?.008:.004)*aimScale));
      this.flash=.045;
    }
    return [{id:this.serial,kind:this.kind,damage:rule.damage,range:rule.range,speed:rule.speed,
      spread:(this.aiming?rule.aimSpread:rule.hipSpread)*(this.moving?1.7:1),melee:this.kind==='knife'}];
  }
  get pose():ShootingPose {
    return {rear:this.rear,drop:this.drop,rise:this.rise,flash:this.flash,cameraPitch:this.pitch,cameraYaw:this.yaw,
      reload:this.reloading?Math.min(1,this.reloadTime/this.reloadDuration):0,
      swing:this.swingTime>0?Math.sin((1-this.swingTime/.36)*Math.PI):0,aim:this.aim};
  }
  snapshot():WeaponSnapshot {
    const stock=this.supply[this.kind],unlimitedReserve=this.hasUnlimitedReserve();
    // null plus an explicit flag remains unambiguous through JSON serialization.
    return {kind:this.kind,aiming:this.aiming,ammo:this.kind==='knife'?null:stock.ammo,
      reserve:this.kind==='knife'||unlimitedReserve?null:stock.reserve,unlimitedReserve,
      reloading:this.reloading,reloadProgress:this.pose.reload,cooldown:Math.max(0,stock.readyAt-this.elapsed),
      triggerHeld:this.held,shots:this.serial};
  }
  /** Pause, blur and switching cancel uncommitted reloads and all fire edges. */
  clearInput():void {
    this.held=false;this.pending=false;this.aiming=false;this.moving=false;
    this.reloadTime=this.reloadDuration=0;
    this.rear=this.drop=this.rise=this.flash=this.pitch=this.yaw=this.aim=this.swingTime=0;
  }
  reset(kind:EquippedWeapon=this.kind):void {
    this.clearInput();this.kind=kind;this.elapsed=0;this.serial=0;this.supply=this.freshSupply();
  }
}
