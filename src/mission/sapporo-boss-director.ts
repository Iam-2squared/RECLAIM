import type { SegmentWorld } from './trajectory-effects.ts';
import type { BossArena, BossMotion, BossPosition, BossState, BossTerrain } from './boss-director.ts';

export type SapporoBossKind='spider'|'snowblower';
export type SapporoBossArenas=Readonly<{tower:BossArena;station:BossArena}>;
export type SapporoBossStepOptions={
  combatEnabled?:boolean;
  canSee?:(boss:SapporoBossUnit)=>boolean;
  canMove?:(from:Readonly<BossPosition>,to:Readonly<BossPosition>,radius:number,kind:SapporoBossKind)=>boolean;
};
type Target=NonNullable<SegmentWorld['targets']>[number];
type Sphere=Readonly<{x:number;y:number;z:number;radius:number}>;
type Rule=Readonly<{hp:number;bodyRadius:number;bodyHeight:number;barHeight:number;speed:number;reach:number;damage:number;strikeAt:number;attackSeconds:number;recover:number;hitSeconds:number;hitboxes:readonly Sphere[]}>;

/** Metre-scale dimensions and clip durations from the supplied animated GLBs. */
export const SAPPORO_BOSS_RULES:Readonly<Record<SapporoBossKind,Rule>>=Object.freeze({
  spider:Object.freeze({hp:1000,bodyRadius:1.25,bodyHeight:3.35,barHeight:4.05,speed:3,reach:3.2,damage:14,strikeAt:.82,attackSeconds:2,recover:1.2,hitSeconds:.5,
    hitboxes:Object.freeze([{x:0,y:2.25,z:0,radius:.88},{x:0,y:1.25,z:-.5,radius:.85},{x:-.8,y:.75,z:0,radius:.64},{x:.8,y:.75,z:0,radius:.64},{x:0,y:2.85,z:.25,radius:.62}])}),
  snowblower:Object.freeze({hp:1000,bodyRadius:1.8,bodyHeight:3.66,barHeight:4.4,speed:2.1,reach:3.85,damage:22,strikeAt:1.02,attackSeconds:2,recover:1.55,hitSeconds:.5,
    hitboxes:Object.freeze([{x:0,y:1.5,z:0,radius:1.35},{x:0,y:1.1,z:-1.35,radius:1.15},{x:0,y:2.75,z:.65,radius:.9},{x:-1.1,y:.7,z:.4,radius:.65},{x:1.1,y:.7,z:.4,radius:.65}])}),
});
const finite=Number.isFinite;
const valid=(p:Readonly<BossPosition>)=>finite(p.x)&&finite(p.y)&&finite(p.z);
const flat=(a:Readonly<BossPosition>,b:Readonly<BossPosition>)=>Math.hypot(a.x-b.x,a.z-b.z);
const STEP=1/30;

export class SapporoBossUnit {
  readonly id:string;
  readonly kind:SapporoBossKind;
  readonly name:string;
  readonly rank:'小ボス'|'中ボス';
  readonly phase:3|4;
  readonly arena:BossArena;
  private spawnOrigin:Readonly<BossPosition>;
  readonly rule:Rule;
  readonly maxHp:number;
  readonly bodyRadius:number;
  readonly bodyHeight:number;
  readonly barHeight:number;
  position:BossPosition;
  yaw=0;
  hp:number;
  hits=0;
  state:BossState='idle';
  stateTime=0;
  clock=0;
  staggerCooldown=0;
  strikeSpent=false;
  constructor(kind:SapporoBossKind,arena:BossArena,origin:BossPosition){
    this.kind=kind;this.id=`sapporo-boss-${kind}`;this.name=kind==='spider'?'電纏蜘蛛':'氷路開拓機';this.rank=kind==='spider'?'小ボス':'中ボス';this.phase=kind==='spider'?3:4;
    this.arena=arena;this.spawnOrigin=Object.freeze({...origin});this.position={...origin};this.rule=SAPPORO_BOSS_RULES[kind];
    this.maxHp=this.rule.hp;this.hp=this.maxHp;this.bodyRadius=this.rule.bodyRadius;this.bodyHeight=this.rule.bodyHeight;this.barHeight=this.rule.barHeight;
  }
  get origin():Readonly<BossPosition>{return this.spawnOrigin;}
  /** Only used before activation, after the director validates a clear landing. */
  placeAt(origin:BossPosition):void{this.spawnOrigin=Object.freeze({...origin});this.reset();}
  get motion():BossMotion{return this.state==='dead'?'Death':this.state==='hit'?'Hit':this.state==='attack'?'Attack':this.state==='chase'?'Chase':this.state==='patrol'||this.state==='return'?'Walk':'Idle';}
  get hitboxes():readonly Target[]{
    if(this.hp<=0)return [];
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw),p=this.position;
    return this.rule.hitboxes.map(h=>({id:this.id,material:'drone' as const,center:{x:p.x+h.x*c+h.z*s,y:p.y+h.y,z:p.z-h.x*s+h.z*c},radius:h.radius}));
  }
  enter(state:BossState){this.state=state;this.stateTime=0;if(state==='attack')this.strikeSpent=false;}
  hit(damage:number):boolean{
    if(this.hp<=0||!finite(damage)||damage<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.hits++;
    if(this.hp===0)this.enter('dead');else if(this.staggerCooldown<=0){this.staggerCooldown=1.8;this.enter('hit');}
    return true;
  }
  reset(){this.position={...this.origin};this.yaw=0;this.hp=this.maxHp;this.hits=0;this.clock=0;this.staggerCooldown=0;this.strikeSpent=false;this.enter('idle');}
  snapshot(){return{id:this.id,kind:this.kind,name:this.name,rank:this.rank,phase:this.phase,arena:{center:{...this.arena.center},radius:this.arena.radius},position:{...this.position},yaw:this.yaw,state:this.state,motion:this.motion,hp:this.hp,maxHp:this.maxHp,hits:this.hits,bodyRadius:this.bodyRadius,bodyHeight:this.bodyHeight,barHeight:this.barHeight,telegraph:this.state==='attack'&&!this.strikeSpent?Math.min(1,this.stateTime/this.rule.strikeAt):0};}
}

/** Phase 3 tower encounter and phase 4 station finale. Dormant units have no targets or HUD rows. */
export class SapporoBossDirector {
  readonly arenas:SapporoBossArenas;
  elapsed=0;
  phase=1;
  private accumulator=0;
  private readonly terrain:BossTerrain;
  private readonly scheduled:readonly SapporoBossUnit[];
  private readonly active:SapporoBossUnit[]=[];
  constructor(arenas:SapporoBossArenas,terrain:BossTerrain){
    for(const arena of [arenas.tower,arenas.station])if(!valid(arena.center)||!finite(arena.radius)||arena.radius<8)throw new RangeError('Invalid Sapporo boss arena');
    const copy=(arena:BossArena):BossArena=>({center:Object.freeze({...arena.center}),radius:arena.radius});
    this.arenas={tower:copy(arenas.tower),station:copy(arenas.station)};this.terrain=terrain;
    this.scheduled=Object.freeze([this.spawn('spider',this.arenas.tower),this.spawn('snowblower',this.arenas.station)]);
  }
  private spawn(kind:SapporoBossKind,arena:BossArena){
    const c=arena.center,h=this.terrain.heightAt(c.x,c.z,c.y);
    return new SapporoBossUnit(kind,arena,{x:c.x,y:finite(h)?h:c.y,z:c.z});
  }
  get bosses():readonly SapporoBossUnit[]{return this.active;}
  /** Activations are monotonic and idempotent. A mission reset is the only rewind. */
  activatePhase(phase:number,player?:Readonly<BossPosition>):void{
    if(!finite(phase)||phase<1)return;
    this.phase=Math.max(this.phase,Math.min(4,Math.floor(phase)));
    for(const boss of this.scheduled)if(this.phase>=boss.phase&&!this.active.includes(boss)){
      const landing=this.landing(boss,player&&valid(player)?player:undefined);
      // A completely obstructed plaza is retried on the next activation call.
      // Never trap the player in a newly materialised collider.
      if(landing){boss.placeAt(landing);this.active.push(boss);}
    }
  }
  private landing(boss:SapporoBossUnit,player?:Readonly<BossPosition>):BossPosition|null{
    const c=boss.arena.center,limit=boss.arena.radius-boss.bodyRadius-.5,clearance=boss.bodyRadius+.55+1;
    const safe=(x:number,z:number):BossPosition|null=>{
      if(Math.hypot(x-c.x,z-c.z)>limit)return null;
      if(player&&Math.hypot(x-player.x,z-player.z)<clearance)return null;
      const y=this.terrain.heightAt(x,z,c.y);
      if(!finite(y)||Math.abs(y-c.y)>.75||this.terrain.blockedAt?.(x,z,y,boss.bodyRadius,boss.bodyHeight))return null;
      return{x,y,z};
    };
    const center=safe(c.x,c.z);if(center)return center;
    const away=player?Math.atan2(c.x-player.x,c.z-player.z):0;
    for(const radius of [clearance+.5,7,12,18,24,limit]){
      if(radius>limit)continue;
      for(let i=0;i<16;i++){const angle=away+i*Math.PI/8,point=safe(c.x+Math.sin(angle)*radius,c.z+Math.cos(angle)*radius);if(point)return point;}
    }
    return null;
  }
  get defeated():boolean{return this.phase===4&&this.active.length===2&&this.active.every(b=>b.hp===0);}
  targets():NonNullable<SegmentWorld['targets']>{return this.active.flatMap(b=>b.hitboxes);}
  hit(id:string,damage:number):boolean{return this.active.find(b=>b.id===id)?.hit(damage)??false;}
  reset():void{this.elapsed=0;this.phase=1;this.accumulator=0;this.active.length=0;for(const boss of this.scheduled)boss.reset();}
  private move(boss:SapporoBossUnit,target:Readonly<BossPosition>,speed:number,dt:number,options:SapporoBossStepOptions):boolean{
    const p=boss.position,dx=target.x-p.x,dz=target.z-p.z,length=Math.hypot(dx,dz);if(length<.025)return false;
    const distance=Math.min(length,speed*dt),next={x:p.x+dx/length*distance,y:p.y,z:p.z+dz/length*distance};
    const safe=(to:BossPosition)=>{
      if(flat(to,boss.arena.center)>boss.arena.radius-boss.bodyRadius-.4)return false;
      const height=this.terrain.heightAt(to.x,to.z,p.y);if(!finite(height)||Math.abs(height-p.y)>.45)return false;to.y=height;
      if(this.terrain.blockedAt?.(to.x,to.z,to.y,boss.bodyRadius,boss.bodyHeight))return false;
      if(options.canMove&&!options.canMove(p,to,boss.bodyRadius,boss.kind))return false;
      for(const other of this.active)if(other!==boss&&other.hp>0){const minimum=boss.bodyRadius+other.bodyRadius+.2;if(flat(to,other.position)<minimum&&flat(to,other.position)<flat(p,other.position)-1e-6)return false;}
      return true;
    };
    let selected:BossPosition|null=null;if(safe(next))selected=next;
    else for(const axis of ['x','z'] as const){const side={...p,[axis]:next[axis]};if(safe(side)&&flat(side,p)>.0001){selected=side;break;}}
    if(!selected)return false;boss.yaw=Math.atan2(p.x-selected.x,p.z-selected.z);boss.position=selected;return true;
  }
  private tick(boss:SapporoBossUnit,dt:number,player:Readonly<BossPosition>,options:SapporoBossStepOptions):number{
    boss.clock+=dt;boss.stateTime+=dt;boss.staggerCooldown=Math.max(0,boss.staggerCooldown-dt);if(boss.hp<=0){boss.state='dead';return 0;}
    const inArena=flat(player,boss.arena.center)<=boss.arena.radius+2&&Math.abs(player.y-boss.arena.center.y)<5;
    const visible=options.combatEnabled!==false&&inArena&&(options.canSee?.(boss)??true),distance=flat(boss.position,player);
    if(boss.state==='hit'){if(boss.stateTime>=boss.rule.hitSeconds)boss.enter(visible?'chase':'return');return 0;}
    if(!visible&&(boss.state==='chase'||boss.state==='attack'||boss.state==='recover'))boss.enter('return');
    if(boss.state==='return'){this.move(boss,boss.origin,boss.rule.speed*.7,dt,options);if(flat(boss.position,boss.origin)<.18)boss.enter('idle');return 0;}
    if(boss.state==='attack'){
      let damage=0;
      if(!boss.strikeSpent&&boss.stateTime>=boss.rule.strikeAt){boss.strikeSpent=true;if(visible&&distance<=boss.rule.reach+.2&&Math.abs(player.y-boss.position.y)<1.6)damage=boss.rule.damage;}
      if(boss.stateTime>=boss.rule.attackSeconds)boss.enter('recover');return damage;
    }
    if(boss.state==='recover'){if(boss.stateTime>=boss.rule.recover)boss.enter(visible?'chase':'return');return 0;}
    if(visible){if(boss.state!=='chase')boss.enter('chase');boss.yaw=Math.atan2(boss.position.x-player.x,boss.position.z-player.z);if(distance<=boss.rule.reach)boss.enter('attack');else this.move(boss,player,boss.rule.speed,dt,options);return 0;}
    const phase=boss.clock%10;if(phase<3){if(boss.state!=='idle')boss.enter('idle');return 0;}
    if(boss.state!=='patrol')boss.enter('patrol');const angle=boss.clock/10*Math.PI*2,radius=boss.kind==='spider'?2.4:3;
    this.move(boss,{x:boss.origin.x+Math.sin(angle)*radius,y:boss.origin.y,z:boss.origin.z+Math.cos(angle)*radius},boss.rule.speed*.3,dt,options);return 0;
  }
  step(seconds:number,player:Readonly<BossPosition>,options:SapporoBossStepOptions={}):{damage:number}{
    if(!finite(seconds)||seconds<=0||!valid(player))return{damage:0};
    this.accumulator+=seconds;let damage=0;
    while(this.accumulator+1e-9>=STEP){this.elapsed+=STEP;for(const boss of this.active)damage+=this.tick(boss,STEP,player,options);this.accumulator-=STEP;}
    return{damage};
  }
  snapshot(){return{elapsed:this.elapsed,phase:this.phase,defeated:this.defeated,bosses:this.active.map(b=>b.snapshot()),scheduled:this.scheduled.map(b=>({id:b.id,kind:b.kind,name:b.name,rank:b.rank,phase:b.phase,active:this.active.includes(b),arena:{center:{...b.arena.center},radius:b.arena.radius}}))};}
}
