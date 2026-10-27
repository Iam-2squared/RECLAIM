import type { SegmentWorld } from './trajectory-effects.ts';

export type BossKind='boar'|'owl';
export type BossMotion='Idle'|'Walk'|'Chase'|'Attack'|'Hit'|'Death';
export type BossState='idle'|'patrol'|'chase'|'attack'|'recover'|'hit'|'return'|'dead';
export type BossPosition={x:number;y:number;z:number};
export type BossArena=Readonly<{center:Readonly<BossPosition>;radius:number}>;
export type BossTerrain={heightAt:(x:number,z:number,expectedY?:number)=>number;blockedAt?:(x:number,z:number,y:number,radius:number,height:number)=>boolean};
export type BossStepOptions={
  combatEnabled?:boolean;
  canSee?:(boss:BossUnit)=>boolean;
  canMove?:(from:Readonly<BossPosition>,to:Readonly<BossPosition>,radius:number,kind:BossKind)=>boolean;
};
type Target=NonNullable<SegmentWorld['targets']>[number];
type HitSphere=Readonly<{x:number;y:number;z:number;radius:number}>;
type BossRule=Readonly<{hp:number;bodyRadius:number;bodyHeight:number;barHeight:number;speed:number;reach:number;damage:number;strikeAt:number;recover:number;hitboxes:readonly HitSphere[]}>;

/** Foot-based dimensions from the supplied metre-scale animated exports. */
export const BOSS_RULES:Readonly<Record<BossKind,BossRule>>=Object.freeze({
  boar:Object.freeze({hp:2000,bodyRadius:1.35,bodyHeight:2.31,barHeight:3.05,speed:2.5,reach:3.1,damage:18,strikeAt:.68,recover:1.15,
    hitboxes:Object.freeze([{x:0,y:1.15,z:-.3,radius:1.12},{x:0,y:.85,z:-1.58,radius:.78},{x:0,y:1.05,z:1,radius:.85},{x:-.75,y:.8,z:0,radius:.62},{x:.75,y:.8,z:0,radius:.62}])}),
  owl:Object.freeze({hp:1500,bodyRadius:1.1,bodyHeight:3.93,barHeight:4.6,speed:1.9,reach:2.65,damage:14,strikeAt:.75,recover:1.35,
    hitboxes:Object.freeze([{x:0,y:.72,z:0,radius:.66},{x:0,y:1.75,z:0,radius:.72},{x:0,y:2.85,z:0,radius:.8},{x:-1.05,y:2.7,z:0,radius:.6},{x:1.05,y:2.7,z:0,radius:.6}])}),
});
const finite=Number.isFinite;
const valid=(p:Readonly<BossPosition>)=>finite(p.x)&&finite(p.y)&&finite(p.z);
const flat=(a:Readonly<BossPosition>,b:Readonly<BossPosition>)=>Math.hypot(a.x-b.x,a.z-b.z);
const STEP=1/30;
const ATTACK_SECONDS=1.5;
const HIT_SECONDS=7/12;

export class BossUnit {
  readonly id:string;
  readonly kind:BossKind;
  readonly name:string;
  readonly origin:Readonly<BossPosition>;
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
  readonly rule:BossRule;
  constructor(kind:BossKind,origin:BossPosition){
    this.kind=kind;this.id=`shiretoko-boss-${kind}`;this.name=kind==='boar'?'錆猪':'哨戒梟';
    this.rule=BOSS_RULES[kind];this.origin=Object.freeze({...origin});this.position={...origin};
    this.maxHp=this.rule.hp;this.hp=this.maxHp;this.bodyRadius=this.rule.bodyRadius;this.bodyHeight=this.rule.bodyHeight;this.barHeight=this.rule.barHeight;
  }
  get motion():BossMotion {
    return this.state==='dead'?'Death':this.state==='hit'?'Hit':this.state==='attack'?'Attack':this.state==='chase'?'Chase':this.state==='patrol'||this.state==='return'?'Walk':'Idle';
  }
  /** World-space spheres use the same -Z-forward yaw as the rendered model. */
  get hitboxes():readonly Target[]{
    if(this.hp<=0)return [];
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw),p=this.position;
    return this.rule.hitboxes.map(h=>({id:this.id,material:'drone' as const,center:{x:p.x+h.x*c+h.z*s,y:p.y+h.y,z:p.z-h.x*s+h.z*c},radius:h.radius}));
  }
  enter(state:BossState){this.state=state;this.stateTime=0;if(state==='attack')this.strikeSpent=false;}
  hit(damage:number):boolean {
    if(this.hp<=0||!finite(damage)||damage<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.hits++;
    if(this.hp===0)this.enter('dead');
    // Repeated automatic fire still deals damage, without restarting the flinch
    // every frame or permanently preventing the boss's authored attack.
    else if(this.staggerCooldown<=0){this.staggerCooldown=1.8;this.enter('hit');}
    return true;
  }
  reset(){this.position={...this.origin};this.yaw=0;this.hp=this.maxHp;this.hits=0;this.clock=0;this.staggerCooldown=0;this.strikeSpent=false;this.enter('idle');}
  snapshot(){return {id:this.id,kind:this.kind,name:this.name,position:{...this.position},yaw:this.yaw,state:this.state,motion:this.motion,hp:this.hp,maxHp:this.maxHp,hits:this.hits,bodyRadius:this.bodyRadius,bodyHeight:this.bodyHeight,barHeight:this.barHeight,telegraph:this.state==='attack'&&!this.strikeSpent?Math.min(1,this.stateTime/this.rule.strikeAt):0};}
}

/** Two local arena encounters. Time is supplied by the mission's active clock. */
export class BossDirector {
  readonly arena:BossArena;
  readonly bosses:readonly BossUnit[];
  elapsed=0;
  private accumulator=0;
  private readonly terrain:BossTerrain;
  constructor(arena:BossArena,terrain:BossTerrain){
    if(!valid(arena.center)||!finite(arena.radius)||arena.radius<6)throw new RangeError('Invalid boss arena');
    this.arena={center:Object.freeze({...arena.center}),radius:arena.radius};this.terrain=terrain;
    const offset=Math.min(5,arena.radius*.36);
    this.bosses=Object.freeze([this.spawn('boar',-offset,-2),this.spawn('owl',offset,2)]);
  }
  private spawn(kind:BossKind,dx:number,dz:number):BossUnit {
    const c=this.arena.center,x=c.x+dx,z=c.z+dz,h=this.terrain.heightAt(x,z,c.y);
    return new BossUnit(kind,{x,y:finite(h)?h:c.y,z});
  }
  get defeated():boolean{return this.bosses.every(b=>b.hp===0);}
  targets():NonNullable<SegmentWorld['targets']>{return this.bosses.flatMap(boss=>boss.hitboxes);}
  hit(id:string,damage:number):boolean{return this.bosses.find(b=>b.id===id)?.hit(damage)??false;}
  reset(){this.elapsed=0;this.accumulator=0;for(const boss of this.bosses)boss.reset();}
  private move(boss:BossUnit,target:Readonly<BossPosition>,speed:number,dt:number,options:BossStepOptions):boolean {
    const p=boss.position,dx=target.x-p.x,dz=target.z-p.z,len=Math.hypot(dx,dz);
    if(len<.025)return false;
    const distance=Math.min(len,speed*dt),next={x:p.x+dx/len*distance,y:p.y,z:p.z+dz/len*distance};
    const safe=(to:BossPosition)=>{
      if(flat(to,this.arena.center)>this.arena.radius-boss.bodyRadius-.4)return false;
      const height=this.terrain.heightAt(to.x,to.z,p.y);
      if(!finite(height)||Math.abs(height-p.y)>.45)return false;
      to.y=height;
      if(this.terrain.blockedAt?.(to.x,to.z,to.y,boss.bodyRadius,boss.bodyHeight))return false;
      if(options.canMove&&!options.canMove(p,to,boss.bodyRadius,boss.kind))return false;
      for(const other of this.bosses)if(other!==boss&&other.hp>0){
        const minimum=boss.bodyRadius+other.bodyRadius+.2;
        // If an external restore already placed units together, allow them out.
        if(flat(to,other.position)<minimum&&flat(to,other.position)<flat(p,other.position)-1e-6)return false;
      }
      return true;
    };
    let selected:BossPosition|null=null;
    if(safe(next))selected=next;
    else for(const axis of ['x','z'] as const){const side={...p,[axis]:next[axis]};if(safe(side)&&flat(side,p)>.0001){selected=side;break;}}
    if(!selected)return false;
    boss.yaw=Math.atan2(p.x-selected.x,p.z-selected.z);boss.position=selected;return true;
  }
  private tick(boss:BossUnit,dt:number,player:Readonly<BossPosition>,options:BossStepOptions):number {
    boss.clock+=dt;boss.stateTime+=dt;boss.staggerCooldown=Math.max(0,boss.staggerCooldown-dt);
    if(boss.hp<=0){boss.state='dead';return 0;}
    const playerInArena=flat(player,this.arena.center)<=this.arena.radius+2&&Math.abs(player.y-this.arena.center.y)<5;
    const visible=options.combatEnabled!==false&&playerInArena&&(options.canSee?.(boss)??true);
    const distance=flat(boss.position,player);
    if(boss.state==='hit'){
      if(boss.stateTime>=HIT_SECONDS)boss.enter(visible?'chase':'return');
      return 0;
    }
    if(!visible&&(boss.state==='chase'||boss.state==='attack'||boss.state==='recover'))boss.enter('return');
    if(boss.state==='return'){
      this.move(boss,boss.origin,boss.rule.speed*.7,dt,options);
      if(flat(boss.position,boss.origin)<.18)boss.enter('idle');
      return 0;
    }
    if(boss.state==='attack'){
      // Attack's first half is the visible warning; its sole impact occurs at
      // the supplied animation's front strike. Leaving range avoids damage.
      let damage=0;
      if(!boss.strikeSpent&&boss.stateTime>=boss.rule.strikeAt){
        boss.strikeSpent=true;
        if(visible&&distance<=boss.rule.reach+.2&&Math.abs(player.y-boss.position.y)<1.6)damage=boss.rule.damage;
      }
      if(boss.stateTime>=ATTACK_SECONDS)boss.enter('recover');
      return damage;
    }
    if(boss.state==='recover'){
      if(boss.stateTime>=boss.rule.recover)boss.enter(visible?'chase':'return');
      return 0;
    }
    if(visible){
      if(boss.state!=='chase')boss.enter('chase');
      boss.yaw=Math.atan2(boss.position.x-player.x,boss.position.z-player.z);
      if(distance<=boss.rule.reach)boss.enter('attack');
      else this.move(boss,player,boss.rule.speed,dt,options);
      return 0;
    }
    // Short patrols stay inside the dedicated clearing, including before the
    // player arrives. The resting interval also makes Idle visibly play.
    const phase=(boss.clock+(boss.kind==='owl'?2:0))%9;
    if(phase<3){if(boss.state!=='idle')boss.enter('idle');return 0;}
    if(boss.state!=='patrol')boss.enter('patrol');
    const angle=(boss.clock/9)*Math.PI*2+(boss.kind==='owl'?Math.PI:0),radius=1.25;
    this.move(boss,{x:boss.origin.x+Math.sin(angle)*radius,y:boss.origin.y,z:boss.origin.z+Math.cos(angle)*radius},boss.rule.speed*.3,dt,options);
    return 0;
  }
  step(seconds:number,player:Readonly<BossPosition>,options:BossStepOptions={}):{damage:number}{
    if(!finite(seconds)||seconds<=0||!valid(player))return {damage:0};
    this.accumulator+=seconds;let damage=0;
    while(this.accumulator+1e-9>=STEP){
      this.elapsed+=STEP;
      for(const boss of this.bosses)damage+=this.tick(boss,STEP,player,options);
      this.accumulator-=STEP;
    }
    return {damage};
  }
  snapshot(){return {elapsed:this.elapsed,defeated:this.defeated,bosses:this.bosses.map(boss=>boss.snapshot())};}
}
