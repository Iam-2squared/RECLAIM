/** Small deterministic enemy state machines for the cooperative-game prototype. */
export type EnemyPosition={x:number;y:number;z:number};
export type EnemyState='patrol'|'alert'|'chase'|'windup'|'attack'|'recover'|'hit'|'dead';
export type MovePermission=(from:Readonly<EnemyPosition>,to:Readonly<EnemyPosition>,radius:number)=>boolean;
type EnemyKind='humanoid'|'drone';
type EnemyRule={hp:number;damage:number;scan:number;leash:number;speed:number;windup:number;attack:number;recover:number;reach:number;radius:number};
export const ENEMY_RULES:Readonly<Record<EnemyKind,Readonly<EnemyRule>>>=Object.freeze({
  humanoid:Object.freeze({hp:24,damage:5,scan:18,leash:14,speed:1.4,windup:.65,attack:.28,recover:1.1,reach:1.15,radius:.32}),
  drone:Object.freeze({hp:24,damage:4,scan:23,leash:16,speed:1.6,windup:.75,attack:.55,recover:1.4,reach:2.7,radius:.42}),
});
const finite=(n:number)=>Number.isFinite(n);
const valid=(p:Readonly<EnemyPosition>)=>finite(p.x)&&finite(p.y)&&finite(p.z);
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const flat=(a:Readonly<EnemyPosition>,b:Readonly<EnemyPosition>)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Exact segment distance to a vertical player capsule, including a fast ram crossing. */
function capsuleContact(from:EnemyPosition,to:EnemyPosition,player:Readonly<EnemyPosition>,radius:number):boolean {
  const lo=player.y+.28,hi=player.y+1.48;
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
  const breaks=[0,1];
  if(Math.abs(dy)>1e-9)for(const h of [lo,hi]){const t=(h-from.y)/dy;if(t>0&&t<1)breaks.push(t);}
  breaks.sort((a,b)=>a-b);
  const distance=(t:number)=>{
    const x=from.x+dx*t-player.x,z=from.z+dz*t-player.z,y=from.y+dy*t;
    const gap=y-clamp(y,lo,hi);return x*x+z*z+gap*gap;
  };
  let best=Infinity;
  for(let i=0;i<breaks.length-1;i++){
    const a=breaks[i],b=breaks[i+1],mid=(a+b)/2,y=from.y+dy*mid;
    const anchor=y<lo?lo:y>hi?hi:null;
    const vx=from.x-player.x,vz=from.z-player.z,vy=anchor===null?0:from.y-anchor;
    const dyTerm=anchor===null?0:dy,den=dx*dx+dz*dz+dyTerm*dyTerm;
    const t=den>1e-12?clamp(-(vx*dx+vz*dz+vy*dyTerm)/den,a,b):a;
    best=Math.min(best,distance(a),distance(b),distance(t));
  }
  return best<=radius*radius;
}

abstract class EnemyMachine {
  abstract readonly kind:EnemyKind;
  abstract readonly id:string;
  state:EnemyState='patrol';hp:number;hits=0;clock=0;yaw=0;
  position:EnemyPosition;
  readonly origin:EnemyPosition;
  readonly level:number;
  protected stateTime=0;
  protected lostTime=0;
  protected returnHome=false;
  protected damageSpent=false;
  protected dash={x:0,y:0,z:0};
  protected fallSpeed=0;
  protected readonly rule:EnemyRule;
  constructor(kind:EnemyKind,x:number,z:number,height:number,level:number,defeated:boolean){
    if(![x,z,height].every(finite))throw new RangeError('Invalid enemy spawn');
    this.level=level>=5?5:1;
    const source=ENEMY_RULES[kind];
    this.rule={...source,hp:source.hp*(this.level===5?3:1),damage:source.damage*(this.level===5?2:1),speed:source.speed*(this.level===5?1.2:1)};
    this.hp=defeated?0:this.rule.hp;
    this.origin={x,y:height,z};this.position={x,y:height+(kind==='drone'?1.85:0),z};
    if(defeated)this.state='dead';
  }
  get maxHp():number{return this.rule.hp;}
  protected enter(state:EnemyState):void {this.state=state;this.stateTime=0;}
  protected ground(heightAt:(x:number,z:number)=>number):number {
    const value=heightAt(this.position.x,this.position.z);
    return finite(value)?value:this.origin.y;
  }
  protected placeY(heightAt:(x:number,z:number)=>number,dt:number):void {
    const ground=this.ground(heightAt);
    if(this.kind==='humanoid'){this.position.y=ground;return;}
    const target=ground+1.85+Math.sin(this.clock*2.2)*.1;
    this.position.y+=(target-this.position.y)*(1-Math.exp(-dt*5));
  }
  protected move(to:Readonly<EnemyPosition>,speed:number,dt:number,heightAt:(x:number,z:number)=>number,canMove?:MovePermission,slide=true):boolean {
    const dx=to.x-this.position.x,dz=to.z-this.position.z,len=Math.hypot(dx,dz);
    if(len<1e-5)return true;
    const travel=Math.min(len,speed*dt),next={...this.position,x:this.position.x+dx/len*travel,z:this.position.z+dz/len*travel};
    const ground=heightAt(next.x,next.z);
    if(!finite(ground))return false;
    next.y=this.kind==='humanoid'?ground:this.position.y;
    this.yaw=Math.atan2(-dx,-dz);
    const safe=(p:EnemyPosition)=>flat(p,this.origin)<=this.rule.leash+.35&&(!canMove||canMove(this.position,p,this.rule.radius));
    if(safe(next)){this.position=next;return true;}
    if(slide){
      for(const axis of ['x','z'] as const){
        const side={...this.position,[axis]:next[axis]};
        if(safe(side)){side.y=this.kind==='humanoid'?heightAt(side.x,side.z):side.y;if(finite(side.y)){this.position=side;return true;}}
      }
    }
    return false;
  }
  step(seconds:number,player:Readonly<EnemyPosition>,heightAt:(x:number,z:number)=>number,visible=true,canMove?:MovePermission):number {
    if(!finite(seconds)||seconds<=0||!valid(player))return 0;
    const dt=Math.min(.1,seconds);
    this.clock+=dt;this.stateTime+=dt;
    if(this.hp<=0){
      this.state='dead';
      if(this.kind==='drone'){this.fallSpeed=Math.min(7,this.fallSpeed+dt*10);this.position.y=Math.max(this.ground(heightAt)+.24,this.position.y-this.fallSpeed*dt);}
      return 0;
    }
    const distance=flat(this.position,player);
    this.lostTime=visible?0:this.lostTime+dt;
    // A hit reaction always gets its short visible flinch, even if the shooter
    // is outside awareness range or this enemy was already walking home.
    if(this.state==='hit'){
      this.placeY(heightAt,dt);
      if(this.stateTime>=.2)this.enter(visible?'chase':'patrol');
      return 0;
    }
    const outsideHome=flat(this.position,this.origin)>this.rule.leash;
    const pursuing=this.state!=='patrol';
    const pursuitLost=pursuing&&(flat(player,this.origin)>this.rule.leash+4||this.lostTime>1.1);
    // An unaware patrol does not depend on where the player happens to be.
    if((outsideHome||pursuitLost)&&!this.returnHome){this.returnHome=true;this.enter('patrol');}
    if(this.returnHome){
      this.move(this.origin,this.rule.speed,dt,heightAt,canMove);
      this.placeY(heightAt,dt);
      if(flat(this.position,this.origin)<.4){this.returnHome=false;this.lostTime=0;}
      return 0;
    }
    if(this.state==='recover'){
      this.placeY(heightAt,dt);
      if(this.stateTime>=this.rule.recover)this.enter(visible?'chase':'patrol');
      return 0;
    }
    if(this.state==='attack')return this.attack(dt,player,heightAt,visible,canMove);
    if(this.state==='windup'){
      this.placeY(heightAt,dt);
      if(!visible||distance>this.rule.reach+1.1){this.enter('recover');return 0;}
      this.yaw=Math.atan2(this.position.x-player.x,this.position.z-player.z);
      if(this.stateTime>=this.rule.windup){
        this.damageSpent=false;
        const dx=player.x-this.position.x,dz=player.z-this.position.z,dy=player.y+1.02-this.position.y,len=Math.hypot(dx,dy,dz)||1;
        this.dash={x:dx/len,y:dy/len,z:dz/len};
        this.enter('attack');
      }
      return 0;
    }
    this.placeY(heightAt,dt);
    if(this.state==='alert'){
      if(!visible){this.enter('patrol');return 0;}
      this.yaw=Math.atan2(this.position.x-player.x,this.position.z-player.z);
      if(this.stateTime>=.6)this.enter('chase');
      return 0;
    }
    if(this.state==='chase'){
      if(!visible)return 0;
      if(distance<=this.rule.reach){this.enter('windup');return 0;}
      this.move(player,this.rule.speed,dt,heightAt,canMove);
      return 0;
    }
    if(visible&&distance<this.rule.scan){this.enter('alert');return 0;}
    const angle=this.clock*.22,target={x:this.origin.x+Math.sin(angle)*1.5,y:this.origin.y,z:this.origin.z+Math.cos(angle)*1.5};
    this.move(target,this.rule.speed*.35,dt,heightAt,canMove);
    return 0;
  }
  protected attack(dt:number,player:Readonly<EnemyPosition>,heightAt:(x:number,z:number)=>number,visible:boolean,canMove?:MovePermission):number {
    let contact=false;
    if(!visible){this.enter('recover');this.placeY(heightAt,dt);return 0;}
    if(this.kind==='drone'){
      const from={...this.position},speed=5.6*(this.level===5?1.15:1);
      const to={x:from.x+this.dash.x*speed*dt,y:from.y+this.dash.y*speed*dt,z:from.z+this.dash.z*speed*dt};
      if(flat(to,this.origin)>this.rule.leash||canMove&&!canMove(from,to,this.rule.radius)){
        this.enter('recover');return 0;
      }
      to.y=Math.max(this.ground(heightAt)+.3,to.y);
      this.position=to;
      contact=capsuleContact(from,to,player,this.rule.radius+.32);
    }else {
      this.placeY(heightAt,dt);
      contact=flat(this.position,player)<=this.rule.reach+.08&&Math.abs(this.position.y-player.y)<1.0;
    }
    let damage=0;
    if(contact&&!this.damageSpent){this.damageSpent=true;damage=this.rule.damage;}
    if(this.stateTime>=this.rule.attack||this.damageSpent)this.enter('recover');
    return damage;
  }
  hit(damage:number):boolean {
    if(this.hp<=0||!finite(damage)||damage<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.hits++;this.damageSpent=true;
    this.enter(this.hp===0?'dead':'hit');
    return true;
  }
  reset(defeated=false):void {
    this.hp=defeated?0:this.rule.hp;this.hits=0;this.clock=0;this.yaw=0;this.stateTime=0;
    this.lostTime=0;this.returnHome=false;this.damageSpent=false;this.fallSpeed=0;
    this.position={...this.origin,y:this.origin.y+(this.kind==='drone'?1.85:0)};
    this.enter(defeated?'dead':'patrol');
  }
  get motion():'Idle'|'Walk'|'Run'|'Attack'|'Hit'|'Death'|'Hover'|'Patrol'|'Chase'|'Ram' {
    if(this.state==='dead')return 'Death';if(this.state==='hit')return 'Hit';
    if(this.kind==='drone')return this.state==='attack'||this.state==='windup'?'Ram':this.state==='chase'?'Chase':this.state==='patrol'?'Patrol':'Hover';
    return this.state==='attack'||this.state==='windup'?'Attack':this.state==='chase'?'Run':this.state==='patrol'?'Walk':'Idle';
  }
  snapshot(){return {id:this.id,kind:this.kind,state:this.state,hp:this.hp,maxHp:this.maxHp,hits:this.hits,position:{...this.position},yaw:this.yaw,level:this.level,motion:this.motion,returning:this.returnHome,telegraph:this.state==='windup'?clamp(this.stateTime/this.rule.windup,0,1):0};}
}
export class HumanoidEnemy extends EnemyMachine {
  readonly kind='humanoid' as const;readonly id='shiretoko-humanoid-01';
  constructor(x:number,z:number,height:number,level=1,defeated=false){super('humanoid',x,z,height,level,defeated);}
}
export class RamDrone extends EnemyMachine {
  readonly kind='drone' as const;readonly id='shiretoko-scout-01';
  constructor(x:number,z:number,height:number,level=1,defeated=false){super('drone',x,z,height,level,defeated);}
}
