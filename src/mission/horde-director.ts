import {HumanoidEnemy,RamDrone,ENEMY_RULES,type EnemyPosition,type EnemyState} from './enemy-ai.ts';
import {authoredPoint,type AuthoredMapPhysicsData,type AuthoredMesh} from '../world/authored-map-physics.ts';
import {createShiretokoEncounterLayout} from '../world/shiretoko-encounter-layout.ts';

export type HordeKind='humanoid'|'drone';
export type HordeTerrain={
  heightAt:(x:number,z:number,referenceY?:number)=>number;
  inWater?:(x:number,z:number,referenceY?:number)=>boolean;
  blockedAt?:(x:number,z:number,y:number,radius:number,height:number)=>boolean;
  slopeAt?:(x:number,z:number,referenceY?:number)=>number;
};
export type HordeConfig={cap:number;spawnInterval:number;deviceHp:number;level:number;roadHalfWidth:number;fixedStep:number;initialRoadDistances:readonly number[]};
export const HORDE_DEFAULTS:Readonly<HordeConfig>=Object.freeze({cap:50,spawnInterval:5,deviceHp:500,level:1,roadHalfWidth:1.45,fixedStep:1/30,initialRoadDistances:Object.freeze([28,44])});
export type HordeEvent=
  |{type:'spawn';id:string;sourceId:string;kind:HordeKind;position:EnemyPosition;initial:boolean;at:number}
  |{type:'skipped';sourceId:string;kind:HordeKind;slot:number;at:number}
  |{type:'hit'|'death';id:string;kind:HordeKind;position:EnemyPosition;amount:number}
  |{type:'device-hit'|'device-destroyed';id:string;kind:HordeKind;position:EnemyPosition;amount:number}
  |{type:'player-damage';id:string;amount:number;position:EnemyPosition};
export type HordeStepContext={visible?:(unit:HordeUnit)=>boolean;canMove?:(from:Readonly<EnemyPosition>,to:Readonly<EnemyPosition>,radius:number,kind:HordeKind)=>boolean;combatEnabled?:boolean};
export type HordeDevice={id:string;sourceId:string;kind:HordeKind;position:EnemyPosition;radius:number;hp:number;maxHp:number;destroyed:boolean};
export type HordeWarehouseBounds={minX:number;maxX:number;minZ:number;maxZ:number};
export type HordeSourceOptions={id:string;cap:number;warehouseRoad:Readonly<Record<HordeKind,readonly EnemyPosition[]>>;devices:readonly {kind:HordeKind;position:EnemyPosition;radius?:number}[];warehouseBounds?:HordeWarehouseBounds};
export type HordeOptions={road:readonly EnemyPosition[];terrain:HordeTerrain;sources?:readonly HordeSourceOptions[];warehouseRoad?:HordeSourceOptions['warehouseRoad'];devices?:HordeSourceOptions['devices'];warehouseBounds?:HordeWarehouseBounds;config?:Partial<HordeConfig>};
const flat=(a:Readonly<EnemyPosition>,b:Readonly<EnemyPosition>)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const finitePoint=(p:Readonly<EnemyPosition>)=>[p.x,p.y,p.z].every(Number.isFinite);
type RoadProjection={distance:number;along:number;point:EnemyPosition};
type RoadSegment={a:EnemyPosition;dx:number;dy:number;dz:number;den:number;length:number};

class Road {
  readonly points:readonly EnemyPosition[];readonly cumulative:number[]=[0];readonly length:number;
  private readonly cells=new Map<string,number[]>();
  private readonly segments:RoadSegment[]=[];
  private readonly allSegments:number[]=[];
  private readonly candidateCells=new Map<string,readonly number[]>();
  private lastX=NaN;private lastZ=NaN;private lastDistance=Infinity;private lastAlong=0;private lastPointX=0;private lastPointY=0;private lastPointZ=0;
  constructor(points:readonly EnemyPosition[]){
    this.points=points.filter(finitePoint).map(p=>({...p})).filter((p,i,all)=>i===0||flat(p,all[i-1])>1e-5);
    if(this.points.length<2)throw new RangeError('A horde road needs at least two finite distinct points');
    for(let i=1;i<this.points.length;i++){
      const a=this.points[i-1],b=this.points[i];this.cumulative.push(this.cumulative[i-1]+flat(a,b));
      const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;this.segments.push({a,dx,dy:b.y-a.y,dz,den,length:Math.sqrt(den)});this.allSegments.push(i-1);
      for(let x=Math.floor(Math.min(a.x,b.x)/32);x<=Math.floor(Math.max(a.x,b.x)/32);x++)for(let z=Math.floor(Math.min(a.z,b.z)/32);z<=Math.floor(Math.max(a.z,b.z)/32);z++){
        const key=`${x},${z}`,cell=this.cells.get(key);if(cell)cell.push(i-1);else this.cells.set(key,[i-1]);
      }
    }
    this.length=this.cumulative.at(-1)!;
  }
  at(distance:number):EnemyPosition {
    const d=clamp(distance,0,this.length);let lo=0,hi=this.points.length-2;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(this.cumulative[mid]<=d)lo=mid;else hi=mid-1;}
    const a=this.points[lo],b=this.points[lo+1],span=this.cumulative[lo+1]-this.cumulative[lo],t=span>0?(d-this.cumulative[lo])/span:0;
    return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
  }
  project(point:Readonly<EnemyPosition>):RoadProjection {
    if(point.x===this.lastX&&point.z===this.lastZ)return{distance:this.lastDistance,along:this.lastAlong,point:{x:this.lastPointX,y:this.lastPointY,z:this.lastPointZ}};
    const cx=Math.floor(point.x/32),cz=Math.floor(point.z/32),key=`${cx},${cz}`;let indices=this.candidateCells.get(key);
    if(!indices){
      const candidates=new Set<number>();
      // Preserve the original first populated ring and candidate insertion order.
      for(let ring=0;ring<=2&&candidates.size===0;ring++)for(let dx=-ring;dx<=ring;dx++)for(let dz=-ring;dz<=ring;dz++)for(const index of this.cells.get(`${cx+dx},${cz+dz}`)??[])candidates.add(index);
      indices=candidates.size?Array.from(candidates):this.allSegments;
      if(this.candidateCells.size>=128)this.candidateCells.clear();this.candidateCells.set(key,indices);
    }
    let best=Infinity,along=0,bestX=this.points[0].x,bestY=this.points[0].y,bestZ=this.points[0].z;
    for(const i of indices){const s=this.segments[i],a=s.a,t=clamp(((point.x-a.x)*s.dx+(point.z-a.z)*s.dz)/(s.den||1),0,1),x=a.x+s.dx*t,z=a.z+s.dz*t,distance=Math.hypot(point.x-x,point.z-z);if(distance<best){best=distance;along=this.cumulative[i]+s.length*t;bestX=x;bestY=a.y+s.dy*t;bestZ=z;}}
    this.lastX=point.x;this.lastZ=point.z;this.lastDistance=best;this.lastAlong=along;this.lastPointX=bestX;this.lastPointY=bestY;this.lastPointZ=bestZ;return{distance:best,along,point:{x:bestX,y:bestY,z:bestZ}};
  }
}

export class HordeUnit {
  readonly id:string;readonly sourceId:string;readonly sourceSlot:number;readonly kind:HordeKind;readonly machine:HumanoidEnemy|RamDrone;
  roadDistance:number;warehouseDistance=0;lane:'road'|'warehouse';readonly slot:number;readonly initial:boolean;
  constructor(id:string,kind:HordeKind,position:EnemyPosition,slot:number,initial:boolean,level:number,roadDistance:number,sourceId='warehouse',sourceSlot=slot){
    this.id=id;this.sourceId=sourceId;this.sourceSlot=sourceSlot;this.kind=kind;this.slot=slot;this.initial=initial;this.roadDistance=roadDistance;this.lane=initial?'road':'warehouse';
    this.machine=kind==='humanoid'?new HumanoidEnemy(position.x,position.z,position.y,level):new RamDrone(position.x,position.z,position.y,level);
  }
  get position():EnemyPosition{return this.machine.position;}
  get hp():number{return this.machine.hp;}
  get maxHp():number{return this.machine.maxHp;}
  get yaw():number{return this.machine.yaw;}
  get state():EnemyState{return this.machine.state;}
  get motion(){return this.machine.motion;}
  snapshot(){return{...this.machine.snapshot(),id:this.id,sourceId:this.sourceId,sourceSlot:this.sourceSlot,slot:this.slot,initial:this.initial,lane:this.lane,roadDistance:this.roadDistance,warehouseDistance:this.warehouseDistance};}
}

type HordeSource={id:string;cap:number;warehouseRoad:Record<HordeKind,Road>;warehouseBounds?:HordeWarehouseBounds;joins:Record<HordeKind,number>;devices:HordeDevice[];scheduled:number;spawned:number;killed:number;skipped:number;nextSpawnAt:number;playerBranch:Record<HordeKind,RoadProjection|null>};

/** Pure fixed-step encounter scheduler and road-bound navigation. No wall clock or rendering. */
export class HordeDirector {
  readonly config:HordeConfig;readonly terrain:HordeTerrain;readonly units:HordeUnit[]=[];readonly devices:HordeDevice[];
  readonly road:Road;readonly warehouseRoad:Record<HordeKind,Road>;readonly sources:readonly HordeSource[];
  private readonly sourceById=new Map<string,HordeSource>();private readonly multiSource:boolean;
  private accumulator=0;private pending:HordeEvent[]=[];
  private playerX=NaN;private playerZ=NaN;private playerMain:RoadProjection|null=null;
  elapsed=0;scheduled=0;spawned=0;killed=0;skipped=0;
  constructor(options:HordeOptions){
    this.config={...HORDE_DEFAULTS,...options.config};this.config.cap=Math.max(2,Math.min(50,Math.floor(this.config.cap)));this.config.spawnInterval=Math.max(.1,this.config.spawnInterval);this.config.fixedStep=clamp(this.config.fixedStep,1/120,.1);
    this.terrain=options.terrain;this.road=new Road(options.road);this.multiSource=options.sources!==undefined;
    if(!this.multiSource&&(!options.warehouseRoad||!options.devices))throw new RangeError('A horde requires warehouse roads and spawn devices');
    const definitions=options.sources??[{id:'warehouse',cap:this.config.cap,warehouseRoad:options.warehouseRoad!,devices:options.devices!,warehouseBounds:options.warehouseBounds}];
    if(!definitions.length)throw new RangeError('A horde requires at least one spawn source');
    let totalCap=0;
    this.sources=definitions.map(definition=>{
      if(!definition.id||this.sourceById.has(definition.id)||!Number.isInteger(definition.cap)||definition.cap<1)throw new RangeError('Horde spawn sources require unique ids and positive integer caps');
      totalCap+=definition.cap;
      const warehouseRoad={humanoid:new Road(definition.warehouseRoad.humanoid),drone:new Road(definition.warehouseRoad.drone)},joins={humanoid:this.road.project(warehouseRoad.humanoid.at(warehouseRoad.humanoid.length)).along,drone:this.road.project(warehouseRoad.drone.at(warehouseRoad.drone.length)).along};
      const devices=(['humanoid','drone'] as const).map(kind=>{const device=definition.devices.find(d=>d.kind===kind);if(!device||!finitePoint(device.position))throw new RangeError(`Missing finite ${kind} spawn device in ${definition.id}`);return{id:this.multiSource?`${definition.id}:spawn-${kind}`:`spawn-${kind}`,sourceId:definition.id,kind,position:{...device.position},radius:device.radius??.75,hp:this.config.deviceHp,maxHp:this.config.deviceHp,destroyed:false};});
      const source:HordeSource={id:definition.id,cap:definition.cap,warehouseRoad,warehouseBounds:definition.warehouseBounds,joins,devices,scheduled:0,spawned:0,killed:0,skipped:0,nextSpawnAt:this.config.spawnInterval,playerBranch:{humanoid:null,drone:null}};this.sourceById.set(source.id,source);return source;
    });
    if(totalCap>50)throw new RangeError('Horde spawn source caps cannot exceed 50 in total');
    this.config.cap=totalCap;if(this.multiSource)this.config.initialRoadDistances=[];
    this.warehouseRoad=this.sources[0].warehouseRoad;this.devices=this.sources.flatMap(source=>source.devices);
    this.reset();
  }
  private initialSpawn(slot:number,distance:number):void {
    const kind:HordeKind=slot%2?'humanoid':'drone',point=this.road.at(distance),ground=this.terrain.heightAt(point.x,point.z,point.y);point.y=Number.isFinite(ground)?ground:point.y;
    this.addUnit(this.sources[0],kind,point,slot,true,distance);
  }
  private addUnit(source:HordeSource,kind:HordeKind,point:EnemyPosition,sourceSlot:number,initial:boolean,distance:number):void {
    const id=this.multiSource?`horde-${source.id}-${kind}-${String(sourceSlot).padStart(3,'0')}`:`horde-${kind}-${String(sourceSlot).padStart(3,'0')}`,unit=new HordeUnit(id,kind,point,this.scheduled,initial,this.config.level,distance,source.id,sourceSlot);this.units.push(unit);this.spawned++;source.spawned++;
    this.pending.push({type:'spawn',id,sourceId:source.id,kind,position:{...unit.position},initial,at:this.elapsed});
  }
  reset():void {
    this.units.length=0;this.pending=[];this.elapsed=0;this.accumulator=0;this.scheduled=0;this.spawned=0;this.killed=0;this.skipped=0;
    for(const device of this.devices){device.hp=device.maxHp;device.destroyed=false;}
    this.playerX=this.playerZ=NaN;this.playerMain=null;
    for(const source of this.sources){source.scheduled=source.spawned=source.killed=source.skipped=0;source.nextSpawnAt=this.config.spawnInterval;source.playerBranch.humanoid=source.playerBranch.drone=null;}
    if(!this.multiSource)for(let i=0;i<Math.min(2,this.config.cap,this.config.initialRoadDistances.length);i++){this.scheduled++;this.sources[0].scheduled++;this.initialSpawn(i+1,this.config.initialRoadDistances[i]);}
  }
  private sourceFinished(source:HordeSource):boolean{return source.scheduled>=source.cap||source.devices.every(device=>device.destroyed);}
  get finished():boolean{return this.sources.every(source=>this.sourceFinished(source));}
  get targets():readonly HordeUnit[]{return this.units.filter(unit=>unit.hp>0);}
  hit(id:string,damage:number):boolean {
    const unit=this.units.find(unit=>unit.id===id);if(!unit||!unit.machine.hit(damage))return false;
    this.pending.push({type:'hit',id,kind:unit.kind,position:{...unit.position},amount:damage});
    if(unit.hp===0){this.killed++;this.sourceById.get(unit.sourceId)!.killed++;this.pending.push({type:'death',id,kind:unit.kind,position:{...unit.position},amount:damage});}
    return true;
  }
  hitDevice(id:string,damage:number):boolean {
    const device=this.devices.find(device=>device.id===id);if(!device||device.destroyed||!Number.isFinite(damage)||damage<=0)return false;
    device.hp=Math.max(0,device.hp-damage);device.destroyed=device.hp===0;
    this.pending.push({type:'device-hit',id,kind:device.kind,position:{...device.position},amount:damage});
    if(device.destroyed)this.pending.push({type:'device-destroyed',id,kind:device.kind,position:{...device.position},amount:damage});
    return true;
  }
  private schedule():void {
    for(const source of this.sources){
      if(this.sourceFinished(source)||this.elapsed+1e-7<source.nextSpawnAt)continue;
      const sourceSlot=++source.scheduled,slot=++this.scheduled,kind:HordeKind=sourceSlot%2?'humanoid':'drone',device=source.devices[kind==='humanoid'?0:1];
      source.nextSpawnAt+=this.config.spawnInterval;
      if(device.destroyed){this.skipped++;source.skipped++;this.pending.push({type:'skipped',sourceId:source.id,kind,slot,at:this.elapsed});continue;}
      const point=source.warehouseRoad[kind].at(0),ground=this.terrain.heightAt(point.x,point.z,point.y);point.y=Number.isFinite(ground)?ground:point.y;
      this.addUnit(source,kind,point,sourceSlot,false,source.joins[kind]);
    }
  }
  private corridor(point:Readonly<EnemyPosition>,unit:HordeUnit,radius:number):boolean {
    const source=this.sourceById.get(unit.sourceId)!,b=source.warehouseBounds;
    if(b&&point.x>=b.minX+radius&&point.x<=b.maxX-radius&&point.z>=b.minZ+radius&&point.z<=b.maxZ-radius)return true;
    const half=Math.max(.55,this.config.roadHalfWidth-radius);
    return this.road.project(point).distance<=half||source.warehouseRoad[unit.kind].project(point).distance<=Math.max(half,1.2);
  }
  private permission(unit:HordeUnit,from:Readonly<EnemyPosition>,to:Readonly<EnemyPosition>,radius:number,context:HordeStepContext):boolean {
    if(!finitePoint(to))return false;
    const count=Math.max(1,Math.ceil(flat(from,to)/.15));let reference=this.terrain.heightAt(from.x,from.z,from.y-(unit.kind==='drone'?1.85:0));
    for(let i=1;i<=count;i++){
      const point={x:from.x+(to.x-from.x)*i/count,y:reference,z:from.z+(to.z-from.z)*i/count};
      if(!this.corridor(point,unit,radius))return false;
      const ground=this.terrain.heightAt(point.x,point.z,reference);
      if(!Number.isFinite(ground)||Math.abs(ground-reference)>.49||this.terrain.inWater?.(point.x,point.z,ground)||this.terrain.blockedAt?.(point.x,point.z,ground,radius,unit.kind==='drone'?2.25:1.76))return false;
      reference=ground;
    }
    return !context.canMove||context.canMove(from,to,radius,unit.kind);
  }
  private syncDistances(unit:HordeUnit):void {
    if(unit.lane==='road')unit.roadDistance=this.road.project(unit.position).along;
    else unit.warehouseDistance=this.sourceById.get(unit.sourceId)!.warehouseRoad[unit.kind].project(unit.position).along;
  }
  private navigate(unit:HordeUnit,player:Readonly<EnemyPosition>,dt:number,context:HordeStepContext):void {
    if(player.x!==this.playerX||player.z!==this.playerZ){this.playerX=player.x;this.playerZ=player.z;this.playerMain=null;for(const source of this.sources)source.playerBranch.humanoid=source.playerBranch.drone=null;}
    const source=this.sourceById.get(unit.sourceId)!,branch=source.warehouseRoad[unit.kind],mainPlayer=this.playerMain??(this.playerMain=this.road.project(player)),branchPlayer=source.playerBranch[unit.kind]??(source.playerBranch[unit.kind]=branch.project(player)),playerOnBranch=branchPlayer.distance+1<mainPlayer.distance;
    let route=unit.lane==='road'?this.road:branch,along=unit.lane==='road'?unit.roadDistance:unit.warehouseDistance,target=unit.lane==='road'?(playerOnBranch?source.joins[unit.kind]:mainPlayer.along):(playerOnBranch?branchPlayer.along:branch.length);
    if(Math.abs(target-along)<.18){
      if(unit.lane==='warehouse'&&!playerOnBranch){unit.lane='road';unit.roadDistance=source.joins[unit.kind];route=this.road;along=unit.roadDistance;target=mainPlayer.along;}
      else if(unit.lane==='road'&&playerOnBranch){unit.lane='warehouse';unit.warehouseDistance=branch.length;route=branch;along=branch.length;target=branchPlayer.along;}
      else return;
    }
    const speed=ENEMY_RULES[unit.kind].speed*(this.config.level>=5?1.2:1),travel=speed*dt,direction=Math.sign(target-along),destination=route.at(along+direction*Math.min(Math.abs(target-along),Math.max(travel,.35)));
    const tangent=route.at(clamp(along+direction*.8,0,route.length)),dx=tangent.x-unit.position.x,dz=tangent.z-unit.position.z,len=Math.hypot(dx,dz)||1,radius=ENEMY_RULES[unit.kind].radius;
    for(const offset of [0,.3,-.3,.6,-.6]){
      const targetPoint={x:destination.x-dz/len*offset,y:destination.y,z:destination.z+dx/len*offset},distance=flat(unit.position,targetPoint);
      if(distance<1e-6)continue;
      const ratio=Math.min(1,travel/distance),next={x:unit.position.x+(targetPoint.x-unit.position.x)*ratio,y:unit.position.y,z:unit.position.z+(targetPoint.z-unit.position.z)*ratio};
      const ground=this.terrain.heightAt(next.x,next.z,destination.y);next.y=unit.kind==='drone'?ground+1.85:ground;
      if(!this.permission(unit,unit.position,next,radius,context))continue;
      unit.machine.yaw=Math.atan2(unit.position.x-next.x,unit.position.z-next.z);unit.machine.position=next;this.syncDistances(unit);return;
    }
  }
  private tick(dt:number,player:Readonly<EnemyPosition>,context:HordeStepContext):number {
    this.elapsed+=dt;this.schedule();let damage=0;
    for(const unit of this.units){
      const heightAt=(x:number,z:number)=>this.terrain.heightAt(x,z,unit.position.y-(unit.kind==='drone'?1.85:0));
      if(unit.hp<=0){unit.machine.step(dt,player,heightAt,false);continue;}
      const near=flat(unit.position,player)<=ENEMY_RULES[unit.kind].scan;
      // Outside awareness range visibility cannot affect this navigation branch.
      const visible=(near||unit.state==='hit')&&context.combatEnabled!==false&&(context.visible?.(unit)??true);
      if(unit.state==='hit'||near&&visible){
        Object.assign(unit.machine.origin,{x:unit.position.x,y:heightAt(unit.position.x,unit.position.z),z:unit.position.z});
        const amount=unit.machine.step(dt,player,heightAt,visible,(from,to,radius)=>this.permission(unit,from,to,radius,context));
        this.syncDistances(unit);
        if(amount&&context.combatEnabled!==false){damage+=amount;this.pending.push({type:'player-damage',id:unit.id,amount,position:{...unit.position}});}
      }else {
        unit.machine.state='patrol';unit.machine.clock+=dt;this.navigate(unit,player,dt,context);
        const ground=heightAt(unit.position.x,unit.position.z);unit.machine.position.y=ground+(unit.kind==='drone'?1.85+Math.sin(unit.machine.clock*2.2)*.1:0);
      }
    }
    return damage;
  }
  step(seconds:number,player:Readonly<EnemyPosition>,context:HordeStepContext={}):{damage:number;events:HordeEvent[]}{
    if(!Number.isFinite(seconds)||seconds<=0||!finitePoint(player))return{damage:0,events:this.drainEvents()};
    this.accumulator+=seconds;let damage=0;
    while(this.accumulator+1e-9>=this.config.fixedStep){damage+=this.tick(this.config.fixedStep,player,context);this.accumulator-=this.config.fixedStep;}
    return{damage,events:this.drainEvents()};
  }
  drainEvents():HordeEvent[]{const events=this.pending;this.pending=[];return events;}
  /** HUD counters do not need copies of all actor states and device positions. */
  summary(){
    const sources=this.sources.map(source=>({id:source.id,target:source.cap,scheduled:source.scheduled,spawned:source.spawned,killed:source.killed,alive:0,skipped:source.skipped,finished:this.sourceFinished(source),nextSpawnIn:this.sourceFinished(source)?null:Math.max(0,source.nextSpawnAt-this.elapsed)}));
    let alive=0;for(const unit of this.units)if(unit.hp>0){alive++;sources[this.sources.indexOf(this.sourceById.get(unit.sourceId)!)].alive++;}
    let nextSpawnIn:number|null=null;for(const source of sources)if(source.nextSpawnIn!==null)nextSpawnIn=nextSpawnIn===null?source.nextSpawnIn:Math.min(nextSpawnIn,source.nextSpawnIn);
    return{elapsed:this.elapsed,target:this.config.cap,scheduled:this.scheduled,spawned:this.spawned,killed:this.killed,alive,skipped:this.skipped,finished:this.finished,nextSpawnIn,sources,devices:this.devices as readonly Readonly<HordeDevice>[]};
  }
  snapshot(){const{devices,...summary}=this.summary();return{...summary,units:this.units.map(unit=>unit.snapshot()),devices:devices.map(device=>({...device,position:{...device.position}}))};}
}

type WarehouseMetadata={access?:{name:string;start_world:readonly number[];end_world:readonly number[]}[];footprint_local?:readonly number[]};
type WarehouseData={center?:readonly number[];floor?:readonly number[];spawnpoints?:{position:readonly number[]}[];doors?:{position:readonly number[]}[];metadata?:WarehouseMetadata};

function surfaceContains(mesh:AuthoredMesh,x:number,z:number):boolean {
  const ps=mesh.positions,ix=mesh.indices;
  for(let i=0;i<ix.length;i+=3){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3,ax=ps[a],az=-ps[a+1],bx=ps[b],bz=-ps[b+1],cx=ps[c],cz=-ps[c+1],den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-8)continue;const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;if(u>=-1e-5&&v>=-1e-5&&1-u-v>=-1e-5)return true;}
  return false;
}

/** Find the centre of the actual painted warehouse approach, rather than cutting across the field. */
function approachRoute(start:EnemyPosition,end:EnemyPosition,mesh:AuthoredMesh|undefined,terrain:HordeTerrain):EnemyPosition[]{
  if(!mesh)return[start,end];
  const size=.5,goalX=Math.round((end.x-start.x)/size),goalZ=Math.round((end.z-start.z)/size),key=(x:number,z:number)=>`${x},${z}`,goal=key(goalX,goalZ),nodes=new Map<string,{x:number;z:number;g:number;f:number;parent:string|null}>(),open=new Set<string>(['0,0']),closed=new Set<string>();
  nodes.set('0,0',{x:0,z:0,g:0,f:Math.hypot(goalX,goalZ),parent:null});
  const world=(x:number,z:number)=>{const p={x:start.x+x*size,y:start.y,z:start.z+z*size};p.y=terrain.heightAt(p.x,p.z,start.y);return p;};
  let found:string|null=null;
  for(let iterations=0;open.size&&iterations<12000;iterations++){
    let current='';let score=Infinity;for(const id of open){const f=nodes.get(id)!.f;if(f<score){score=f;current=id;}}
    const n=nodes.get(current)!;if(current===goal||Math.hypot(n.x-goalX,n.z-goalZ)<1.1){found=current;break;}open.delete(current);closed.add(current);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(!dx&&!dz)continue;const x=n.x+dx,z=n.z+dz,id=key(x,z);if(closed.has(id)||Math.abs(x)>120||Math.abs(z)>120)continue;const p=world(x,z);
      if(!surfaceContains(mesh,p.x,p.z)&&flat(p,start)>.8&&flat(p,end)>.8||terrain.inWater?.(p.x,p.z,p.y)||terrain.blockedAt?.(p.x,p.z,p.y,.43,1.76))continue;
      const g=n.g+Math.hypot(dx,dz),previous=nodes.get(id);if(previous&&previous.g<=g)continue;nodes.set(id,{x,z,g,f:g+Math.hypot(x-goalX,z-goalZ),parent:current});open.add(id);
    }
  }
  if(!found)throw new Error('No clear path along the authored warehouse approach');
  const reverse:EnemyPosition[]=[end];for(let id:string|null=found;id;id=nodes.get(id)!.parent){const n=nodes.get(id)!;reverse.push(world(n.x,n.z));}reverse.push(start);const raw=reverse.reverse(),result:EnemyPosition[]=[raw[0]];
  const clear=(a:EnemyPosition,b:EnemyPosition)=>{const steps=Math.ceil(flat(a,b)/.2);for(let i=1;i<steps;i++){const x=a.x+(b.x-a.x)*i/steps,z=a.z+(b.z-a.z)*i/steps,y=terrain.heightAt(x,z,start.y);if(!surfaceContains(mesh,x,z)||terrain.blockedAt?.(x,z,y,.43,1.76))return false;}return true;};
  let index=0;while(index<raw.length-1){let next=index+1;for(let j=index+2;j<raw.length&&flat(raw[index],raw[j])<12;j++){if(!clear(raw[index],raw[j]))break;next=j;}result.push(raw[next]);index=next;}
  return result;
}

export function createAuthoredHorde(data:AuthoredMapPhysicsData,terrain:HordeTerrain,config?:Partial<HordeConfig>):HordeDirector {
  const road=(data.trail?.path??[]).filter(p=>p[1]<(data.boundary?.hardLimit??630)-1.4).map(authoredPoint);if(road.length<2)throw new Error('Authored horde requires the actual trail centreline');
  const warehouse=data.warehouse as WarehouseData|undefined;if(!warehouse?.floor||!warehouse.center)throw new Error('Authored horde requires warehouse metadata');
  const ramp=warehouse.metadata?.access?.find(access=>access.name==='front_loading'),door=authoredPoint(ramp?.start_world??warehouse.doors?.[0]?.position??warehouse.floor),rampEnd=authoredPoint(ramp?.end_world??warehouse.floor),main=new Road(road),join=main.project(rampEnd).point;
  const approach=approachRoute(rampEnd,join,data.structures?.find(mesh=>mesh.name.includes('荒れた搬入口')),terrain);
  const points=warehouse.spawnpoints??[],humanoid=authoredPoint(points[0]?.position??[-201,90,110.24]),drone=authoredPoint(points[1]?.position??[-184,89,110.24]);
  const centre=authoredPoint(warehouse.center),footprint=warehouse.metadata?.footprint_local??[-21,21,-14,14];
  const additional=createShiretokoEncounterLayout(data,terrain).warehouse;
  const original:HordeSourceOptions={id:'warehouse-original',cap:20,warehouseRoad:{humanoid:[humanoid,door,...approach],drone:[drone,door,...approach]},devices:[{kind:'humanoid',position:humanoid},{kind:'drone',position:drone}],warehouseBounds:{minX:centre.x+footprint[0],maxX:centre.x+footprint[1],minZ:centre.z-footprint[3],maxZ:centre.z-footprint[2]}};
  return new HordeDirector({road,terrain,sources:[original,{id:additional.id,cap:30,warehouseRoad:additional.paths,devices:additional.devices,warehouseBounds:additional.bounds}],config});
}
