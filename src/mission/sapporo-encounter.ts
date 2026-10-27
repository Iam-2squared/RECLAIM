import {HordeUnit,type HordeDevice,type HordeEvent,type HordeStepContext,type HordeTerrain} from './horde-director.ts';
import {ENEMY_RULES,type EnemyPosition} from './enemy-ai.ts';

export type SapporoEncounterRoad=Readonly<{id?:string;width?:number;points:readonly Readonly<EnemyPosition>[]} >;
export type SapporoExclusion=Readonly<{position:Readonly<EnemyPosition>;radius:number}>;
export type SapporoEncounterConfig={initialCount:number;reinforcementCount:number;phaseSeconds:number;fixedStep:number;level:1|5;activeDistance:number;candidateStep:number};
export const SAPPORO_ENCOUNTER_DEFAULTS:Readonly<SapporoEncounterConfig>=Object.freeze({initialCount:50,reinforcementCount:50,phaseSeconds:300,fixedStep:1/30,level:1,activeDistance:80,candidateStep:14});
export type SapporoEncounterOptions=Readonly<{roads:readonly SapporoEncounterRoad[];terrain:HordeTerrain;exclusions?:readonly SapporoExclusion[];phaseSeconds?:number;config?:Partial<SapporoEncounterConfig>}>;
export type SapporoEncounterEvent=HordeEvent|{type:'phase';phase:1|2|3|4;at:number};
export type SapporoStepContext=HordeStepContext&{paused?:boolean};
type StreetSegment={a:EnemyPosition;b:EnemyPosition;dx:number;dz:number;den:number;length:number;halfWidth:number};
type SourceSummary={id:string;target:number;scheduled:number;spawned:number;killed:number;alive:number;skipped:number;finished:boolean;nextSpawnIn:number|null};
const finitePoint=(p:Readonly<EnemyPosition>)=>[p.x,p.y,p.z].every(Number.isFinite);
const distance2=(a:Readonly<EnemyPosition>,b:Readonly<EnemyPosition>)=>(a.x-b.x)**2+(a.z-b.z)**2;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** Actual street centrelines, indexed once; guards cannot walk through city blocks. */
class CityStreets {
  readonly segments:StreetSegment[]=[];
  private readonly cells=new Map<string,number[]>();
  constructor(roads:readonly SapporoEncounterRoad[]){
    for(const road of roads){
      const halfWidth=Number.isFinite(road.width)&&road.width!>0?road.width!/2:8;
      for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1],b=road.points[i];if(!finitePoint(a)||!finitePoint(b))continue;
        const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;if(den<.01)continue;
        const index=this.segments.length;this.segments.push({a:{...a},b:{...b},dx,dz,den,length:Math.sqrt(den),halfWidth});
        for(let x=Math.floor((Math.min(a.x,b.x)-halfWidth)/64);x<=Math.floor((Math.max(a.x,b.x)+halfWidth)/64);x++)for(let z=Math.floor((Math.min(a.z,b.z)-halfWidth)/64);z<=Math.floor((Math.max(a.z,b.z)+halfWidth)/64);z++){
          const key=x+','+z,cell=this.cells.get(key);if(cell)cell.push(index);else this.cells.set(key,[index]);
        }
      }
    }
    if(!this.segments.length)throw new RangeError('Sapporo encounter requires finite street centrelines');
  }
  contains(point:Readonly<EnemyPosition>,radius:number):boolean {
    for(const index of this.cells.get(Math.floor(point.x/64)+','+Math.floor(point.z/64))??[]){
      const segment=this.segments[index],t=clamp(((point.x-segment.a.x)*segment.dx+(point.z-segment.a.z)*segment.dz)/segment.den,0,1),dx=point.x-segment.a.x-t*segment.dx,dz=point.z-segment.a.z-t*segment.dz;
      if(dx*dx+dz*dz<=Math.max(0,segment.halfWidth-radius)**2)return true;
    }
    return false;
  }
}

/** Four active-play phases. Street guards stay scattered until the player approaches. */
export class SapporoEncounterDirector {
  readonly config:SapporoEncounterConfig;
  readonly terrain:HordeTerrain;
  readonly units:HordeUnit[]=[];
  readonly devices:readonly HordeDevice[]=Object.freeze([]);
  readonly sources:readonly SourceSummary[]=Object.freeze([]);
  readonly spawnPoints:readonly Readonly<EnemyPosition>[];
  private readonly streets:CityStreets;
  private accumulator=0;
  private ticks=0;
  private pending:SapporoEncounterEvent[]=[];
  private readonly corpseSeconds=new Map<string,number>();
  private activeLastTick=0;
  private announcedPhase:1|2|3|4=1;
  elapsed=0;scheduled=0;spawned=0;killed=0;skipped=0;
  constructor(options:SapporoEncounterOptions){
    this.config={...SAPPORO_ENCOUNTER_DEFAULTS,...options.config,...(options.phaseSeconds===undefined?{}:{phaseSeconds:options.phaseSeconds})};
    const c=this.config;
    if(![c.initialCount,c.reinforcementCount].every(n=>Number.isInteger(n)&&n>=1)||c.initialCount+c.reinforcementCount>100)throw new RangeError('Sapporo supports two positive enemy groups with a total of at most100');
    if(!Number.isFinite(c.phaseSeconds)||c.phaseSeconds<=0||!Number.isFinite(c.fixedStep)||c.fixedStep<1/120||c.fixedStep>.1||!Number.isFinite(c.activeDistance)||c.activeDistance<25||!Number.isFinite(c.candidateStep)||c.candidateStep<2)throw new RangeError('Invalid Sapporo encounter timing or navigation configuration');
    this.terrain=options.terrain;this.streets=new CityStreets(options.roads);
    this.spawnPoints=Object.freeze(this.placeGuards(options.exclusions??[]).map(p=>Object.freeze(p)));
    this.reset();
  }
  private placeGuards(exclusions:readonly SapporoExclusion[]):EnemyPosition[]{
    const candidates:EnemyPosition[]=[],seen=new Set<string>();
    for(const segment of this.streets.segments){
      const steps=Math.max(1,Math.ceil(segment.length/this.config.candidateStep));
      for(let i=0;i<steps;i++){
        const t=(i+.5)/steps,x=segment.a.x+segment.dx*t,z=segment.a.z+segment.dz*t,key=Math.round(x*10)+','+Math.round(z*10);if(seen.has(key))continue;seen.add(key);
        const reference=segment.a.y+(segment.b.y-segment.a.y)*t,y=this.terrain.heightAt(x,z,reference),point={x,y,z};
        if(!Number.isFinite(y)||Math.abs(y-reference)>4||this.terrain.inWater?.(x,z,y)||this.terrain.blockedAt?.(x,z,y,.65,2.3)||!this.streets.contains(point,.65))continue;
        if(this.terrain.slopeAt&&(this.terrain.slopeAt(x,z,y)>.75))continue;
        if(exclusions.some(area=>finitePoint(area.position)&&Number.isFinite(area.radius)&&distance2(point,area.position)<(Math.max(0,area.radius)+1)**2))continue;
        candidates.push(point);
      }
    }
    const count=this.config.initialCount+this.config.reinforcementCount;
    if(candidates.length<count)throw new Error('Sapporo streets do not provide enough clear guard positions: '+candidates.length+'/'+count);
    // Farthest-point sampling distributes both the first50 and the later50 over
    // the whole authored street network rather than building a crowd at spawn.
    const selected:EnemyPosition[]=[],separation=new Float64Array(candidates.length);separation.fill(Infinity);
    let choice=0;
    for(let slot=0;slot<count;slot++){
      const point=candidates[choice];selected.push({...point});separation[choice]=-1;
      let best=-1,next=-1;
      for(let i=0;i<candidates.length;i++){
        if(separation[i]<0)continue;separation[i]=Math.min(separation[i],distance2(candidates[i],point));
        if(separation[i]>best){best=separation[i];next=i;}
      }
      if(slot<count-1&&best<4**2)throw new Error('Sapporo guard placement would overlap; wider clear streets are required');
      choice=next;
    }
    return selected;
  }
  get phase():1|2|3|4{return Math.min(4,1+Math.floor((this.elapsed+1e-7)/this.config.phaseSeconds)) as 1|2|3|4;}
  get activeSmallBoss():boolean{return this.phase>=3;}
  get activeMediumBoss():boolean{return this.phase>=4;}
  get finished():boolean{return this.spawned===this.spawnPoints.length;}
  get targets():readonly HordeUnit[]{return this.units.filter(unit=>unit.hp>0);}
  private addGroup(start:number,end:number,initial:boolean):void {
    for(let slot=start;slot<end;slot++){
      const kind=slot%2?'drone':'humanoid',sourceId=initial?'sapporo-phase-1':'sapporo-phase-2',id='sapporo-'+kind+'-'+String(slot+1).padStart(3,'0'),point=this.spawnPoints[slot];
      const unit=new HordeUnit(id,kind,{...point},slot+1,initial,this.config.level,0,sourceId,slot-start+1);unit.lane='road';
      // Stable distinct patrol timing prevents rows of guards moving in sync.
      unit.machine.clock=(slot*2.399963229728653)%28;unit.machine.yaw=(slot*2.399963229728653)%(Math.PI*2);
      this.units.push(unit);this.spawned++;this.scheduled++;
      this.pending.push({type:'spawn',id,sourceId,kind,position:{...unit.position},initial,at:this.elapsed});
    }
  }
  reset():void {
    this.units.length=0;this.pending=[];this.corpseSeconds.clear();this.accumulator=0;this.ticks=0;this.elapsed=0;this.scheduled=this.spawned=this.killed=this.skipped=0;this.activeLastTick=0;this.announcedPhase=1;
    this.pending.push({type:'phase',phase:1,at:0});this.addGroup(0,this.config.initialCount,true);
  }
  hit(id:string,damage:number):boolean {
    const unit=this.units.find(candidate=>candidate.id===id);if(!unit||!unit.machine.hit(damage))return false;
    this.pending.push({type:'hit',id,kind:unit.kind,position:{...unit.position},amount:damage});
    if(unit.hp===0){this.killed++;this.corpseSeconds.set(id,0);this.pending.push({type:'death',id,kind:unit.kind,position:{...unit.position},amount:damage});}
    return true;
  }
  hitDevice(_id:string,_damage:number):boolean{return false;}
  private permission(unit:HordeUnit,from:Readonly<EnemyPosition>,to:Readonly<EnemyPosition>,radius:number,context:SapporoStepContext):boolean {
    if(!finitePoint(to))return false;
    const steps=Math.max(1,Math.ceil(Math.sqrt(distance2(from,to))/.25));
    let reference=this.terrain.heightAt(from.x,from.z,unit.machine.origin.y);
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t,y=this.terrain.heightAt(x,z,reference);
      if(!Number.isFinite(y)||Math.abs(y-reference)>.49||!this.streets.contains({x,y,z},radius)||this.terrain.inWater?.(x,z,y)||this.terrain.blockedAt?.(x,z,y,radius,unit.kind==='drone'?2.25:1.76))return false;
      reference=y;
    }
    return !context.canMove||context.canMove(from,to,radius,unit.kind);
  }
  private tick(dt:number,player:Readonly<EnemyPosition>,context:SapporoStepContext):number {
    this.ticks++;this.elapsed=this.ticks*this.config.fixedStep;
    const phase=this.phase;
    if(this.spawned===this.config.initialCount&&phase>=2)this.addGroup(this.config.initialCount,this.spawnPoints.length,false);
    while(this.announcedPhase<phase){this.announcedPhase=(this.announcedPhase+1) as 1|2|3|4;this.pending.push({type:'phase',phase:this.announcedPhase,at:(this.announcedPhase-1)*this.config.phaseSeconds});}
    let damage=0;this.activeLastTick=0;
    for(const unit of this.units){
      if(unit.hp<=0){
        const age=(this.corpseSeconds.get(unit.id)??0)+dt;this.corpseSeconds.set(unit.id,age);
        if(age<=6)unit.machine.step(dt,player,(x,z)=>this.terrain.heightAt(x,z,unit.machine.origin.y),false);
        continue;
      }
      const near=distance2(unit.position,player)<=this.config.activeDistance**2||unit.state==='hit';
      if(!near){unit.machine.clock+=dt;unit.machine.state='patrol';continue;}
      this.activeLastTick++;
      const visible=context.combatEnabled!==false&&distance2(unit.position,player)<=ENEMY_RULES[unit.kind].scan**2&&(context.visible?.(unit)??true);
      const amount=unit.machine.step(dt,player,(x,z)=>this.terrain.heightAt(x,z,unit.machine.origin.y),visible,(from,to,radius)=>this.permission(unit,from,to,radius,context));
      if(amount&&context.combatEnabled!==false){damage+=amount;this.pending.push({type:'player-damage',id:unit.id,amount,position:{...unit.position}});}
    }
    return damage;
  }
  step(seconds:number,player:Readonly<EnemyPosition>,context:SapporoStepContext={}):{damage:number;events:SapporoEncounterEvent[]}{
    if(context.paused||!Number.isFinite(seconds)||seconds<=0||!finitePoint(player))return{damage:0,events:this.drainEvents()};
    this.accumulator+=seconds;let damage=0;
    while(this.accumulator+1e-9>=this.config.fixedStep){damage+=this.tick(this.config.fixedStep,player,context);this.accumulator-=this.config.fixedStep;}
    return{damage,events:this.drainEvents()};
  }
  drainEvents():SapporoEncounterEvent[]{const events=this.pending;this.pending=[];return events;}
  summary(){
    let alive=0;for(const unit of this.units)if(unit.hp>0)alive++;
    return{elapsed:this.elapsed,phase:this.phase,phaseCount:4,phaseSeconds:this.config.phaseSeconds,nextPhaseIn:this.phase<4?Math.max(0,this.phase*this.config.phaseSeconds-this.elapsed):null,target:this.spawnPoints.length,scheduled:this.scheduled,spawned:this.spawned,killed:this.killed,alive,skipped:0,finished:this.finished,nextSpawnIn:this.finished?null:Math.max(0,this.config.phaseSeconds-this.elapsed),sources:this.sources,devices:this.devices,activeSmallBoss:this.activeSmallBoss,activeMediumBoss:this.activeMediumBoss,activeAi:this.activeLastTick,sleepingAi:alive-this.activeLastTick};
  }
  snapshot(){return{...this.summary(),units:this.units.map(unit=>unit.snapshot()),devices:[] as HordeDevice[],placement:{candidates:this.spawnPoints.length,minimumSpacing:this.minimumSpacing()},timeline:[{phase:1,at:0,enemies:this.config.initialCount,boss:null},{phase:2,at:this.config.phaseSeconds,enemies:this.config.reinforcementCount,boss:null},{phase:3,at:this.config.phaseSeconds*2,enemies:0,boss:'small'},{phase:4,at:this.config.phaseSeconds*3,enemies:0,boss:'medium'}]};}
  private minimumSpacing():number {
    let squared=Infinity;for(let a=0;a<this.spawnPoints.length;a++)for(let b=a+1;b<this.spawnPoints.length;b++)squared=Math.min(squared,distance2(this.spawnPoints[a],this.spawnPoints[b]));return Math.sqrt(squared);
  }
}
