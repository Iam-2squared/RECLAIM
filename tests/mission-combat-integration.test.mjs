import test from 'node:test';
import assert from 'node:assert/strict';
import {MissionProjectilePipeline} from '../src/mission/projectile-pipeline.ts';
import {PROJECTILE_RULES} from '../src/mission/ballistics.ts';
import {resolveSegmentImpact,resolveAimImpact} from '../src/mission/trajectory-effects.ts';
import {missionSegmentWorld} from '../src/mission/mission-collider-adapter.ts';
import {WeaponState} from '../src/mission/weapon-state.ts';
import {RamDrone,HumanoidEnemy} from '../src/mission/enemy-ai.ts';

const origin={x:0,y:2,z:0},direction={x:0,y:0,z:1};
const ground=()=>-100;
const target=(id,z,material='drone',y=2,radius=.6)=>({id,center:{x:0,y,z},radius,material});
const world=(targets=[],solids=[])=>({solids,drone:null,targets,heightAt:ground});
const wall=(z)=>({id:'solid-cover',material:'metal',bounds:{minX:-2,maxX:2,minY:0,maxY:4,minZ:z,maxZ:z+.2}});
const payload=(damage=8)=>({owner:'player',weapon:'assault',damage});
function drain(pipe,w,ticks=240){
  const moves=[],impacts=[],expirations=[];
  for(let i=0;i<ticks;i++){
    const frame=pipe.tick(w);moves.push(...frame.moves);impacts.push(...frame.impacts);expirations.push(...frame.expirations);
    if(!pipe.active)break;
  }
  return{moves,impacts,expirations};
}

test('weapon-specific projectile speeds advance different real swept distances',()=>{
  const assault=new MissionProjectilePipeline(),sniper=new MissionProjectilePipeline();
  assault.fire(origin,direction,payload(),100,110);sniper.fire(origin,direction,{...payload(12),weapon:'sniper'},145,140);
  const a=assault.tick(world()),s=sniper.tick(world());
  assert.equal(a.moves.length,1);assert.equal(s.moves.length,1);
  assert.ok(Math.abs(a.moves[0].to.z-100*PROJECTILE_RULES.fixedStep)<1e-10);
  assert.ok(Math.abs(s.moves[0].to.z-145*PROJECTILE_RULES.fixedStep)<1e-10);
  assert.ok(s.moves[0].to.z>a.moves[0].to.z);assert.ok(a.moves[0].to.y<origin.y);
});
test('custom short range clips the actual path and expires once before a farther target',()=>{
  const pipe=new MissionProjectilePipeline();pipe.fire(origin,direction,payload(),100,4);
  const result=drain(pipe,world([target('too-far',6)]));
  assert.equal(result.impacts.length,0);assert.equal(result.expirations.length,1);
  const travelled=result.moves.reduce((sum,m)=>sum+Math.hypot(m.to.x-m.from.x,m.to.y-m.from.y,m.to.z-m.from.z),0);
  assert.ok(Math.abs(travelled-4)<1e-8);assert.equal(pipe.active,0);assert.equal(pipe.pendingReceipts,0);
  for(let i=0;i<5;i++)assert.equal(pipe.tick(world()).expirations.length,0);
});
test('custom speed and range reject invalid values without reserving a projectile receipt',()=>{
  const pipe=new MissionProjectilePipeline();
  for(const speed of [0,-1,301,NaN,Infinity])assert.throws(()=>pipe.fire(origin,direction,payload(),speed,100),RangeError);
  for(const range of [0,-1,141,NaN,Infinity])assert.throws(()=>pipe.fire(origin,direction,payload(),100,range),RangeError);
  assert.equal(pipe.active,0);assert.equal(pipe.pendingReceipts,0);
});
test('nearest humanoid body sphere wins ahead of a drone and registers a single terminal receipt',()=>{
  const pipe=new MissionProjectilePipeline(),w=world([
    target('drone',8),target('human',4,'humanoid',1.6,.55),target('human',4,'humanoid',2,.4),
  ]);
  const id=pipe.fire(origin,direction,payload(),100,110),result=drain(pipe,w);
  assert.equal(result.impacts.length,1);assert.equal(result.impacts[0].projectileId,id);
  assert.equal(result.impacts[0].impact.targetId,'human');assert.equal(result.impacts[0].impact.material,'humanoid');
  for(let i=0;i<60;i++)assert.equal(pipe.tick(w).impacts.length,0);
  assert.equal(pipe.pendingReceipts,0);
});
test('nearest drone wins ahead of the humanoid independent of target-array ordering',()=>{
  for(const targets of [[target('human',8,'humanoid'),target('drone',4)],[target('drone',4),target('human',8,'humanoid')]]){
    const pipe=new MissionProjectilePipeline();pipe.fire(origin,direction,payload(),100,110);
    const result=drain(pipe,world(targets));assert.equal(result.impacts.length,1);assert.equal(result.impacts[0].impact.targetId,'drone');
  }
});
test('a collider snapshot blocks every enemy behind it and terminal tracer ends at the cover',()=>{
  const input={type:'aabb',tag:'warehouse-metal',minX:-2,maxX:2,minY:0,maxY:4,minZ:3,maxZ:3.2};
  const base=missionSegmentWorld([input],ground,null),w={...base,targets:[target('human',5,'humanoid'),target('drone',8)]};
  const pipe=new MissionProjectilePipeline();const id=pipe.fire(origin,direction,payload(),145,140);
  const result=drain(pipe,w);assert.equal(result.impacts.length,1);
  assert.equal(result.impacts[0].impact.material,'metal');assert.ok(result.impacts[0].impact.targetId.startsWith('obstacle:'));
  const tracer=pipe.visibleTracers.find(s=>s.projectileId===id&&s.terminal);
  assert.ok(tracer);assert.deepEqual(tracer.to,result.impacts[0].impact.point);assert.equal(tracer.to.z,3);
});
test('coplanar target and cover tie resolves to cover for both enemy kinds',()=>{
  for(const material of ['drone','humanoid']){
    const w=world([target('enemy',4,material,2,1)],[wall(3)]);
    const impact=resolveSegmentImpact(origin,{x:0,y:2,z:8},w);
    assert.equal(impact.material,'metal');assert.equal(impact.targetId,'solid-cover');
  }
});
test('three real assault shots stop the default 24 HP scout exactly once',()=>{
  const drone=new RamDrone(0,6,0),gun=new WeaponState(),pipe=new MissionProjectilePipeline();let deaths=0,receipts=0;
  const w=world([{id:drone.id,center:{...drone.position},radius:.72,material:'drone'}]);
  for(let shot=0;shot<3;shot++){
    gun.trigger(true);gun.trigger(false);let request=gun.step(1/60)[0];
    for(let i=0;!request&&i<60;i++)request=gun.step(1/60)[0];
    assert.ok(request);assert.equal(request.damage,8);
    const from={x:0,y:drone.position.y,z:0};pipe.fire(from,direction,{owner:'player',weapon:request.kind,damage:request.damage},request.speed,request.range);
    for(const receipt of drain(pipe,w).impacts){receipts++;const alive=drone.hp>0;assert.equal(drone.hit(receipt.damage),true);if(alive&&drone.hp===0)deaths++;}
  }
  assert.equal(drone.hp,0);assert.equal(drone.hits,3);assert.equal(receipts,3);assert.equal(deaths,1);
  assert.equal(drone.hit(8),false);assert.equal(pipe.tick(w).impacts.length,0);
});
test('clearing a session drops in-flight damage and receipts before a new encounter',()=>{
  const pipe=new MissionProjectilePipeline();pipe.fire(origin,direction,payload(),100,110);pipe.tick(world());pipe.clear();
  assert.equal(pipe.active,0);assert.equal(pipe.pendingReceipts,0);assert.equal(pipe.visibleTracers.length,0);
  const enemy=new HumanoidEnemy(0,6,0),w=world([target(enemy.id,6,'humanoid')]);
  for(let i=0;i<100;i++)assert.equal(pipe.tick(w).impacts.length,0);
  assert.equal(enemy.hp,24);assert.equal(enemy.hits,0);
});
test('140 metre aim ray finds target beyond a short-segment terrain budget',()=>{
  const w=world([target('far-human',120,'humanoid')]);
  const hit=resolveAimImpact(origin,{x:0,y:2,z:140},w);
  assert.equal(hit.targetId,'far-human');assert.equal(hit.material,'humanoid');
  assert.ok(Math.abs(hit.point.z-119.4)<1e-8);assert.ok(Math.abs(hit.fraction-hit.point.z/140)<1e-10);
  assert.equal(resolveAimImpact(origin,{x:0,y:2,z:140},world()),null);
});
test('long aim ray selects near cover over a farther target and preserves exact global fraction',()=>{
  const hit=resolveAimImpact(origin,{x:0,y:2,z:140},world([target('far-drone',120)],[wall(95)]));
  assert.equal(hit.material,'metal');assert.equal(hit.point.z,95);assert.ok(Math.abs(hit.fraction-95/140)<1e-10);
});
test('long aim ray terrain crossing blocks a target behind a ridge',()=>{
  const w={...world([target('hidden',120)]),heightAt:(_x,z)=>z>=70?3:0};
  const hit=resolveAimImpact(origin,{x:0,y:2,z:140},w);
  assert.equal(hit.material,'terrain');assert.equal(hit.targetId,null);assert.ok(Math.abs(hit.point.z-70)<.002);
});
test('long aim bounds reject non-finite vectors and excessive range',()=>{
  assert.throws(()=>resolveAimImpact(origin,{x:NaN,y:2,z:140},world()),RangeError);
  assert.throws(()=>resolveAimImpact(origin,{x:0,y:Infinity,z:140},world()),RangeError);
  assert.throws(()=>resolveAimImpact(origin,{x:0,y:2,z:201},world()),RangeError);
  assert.equal(resolveAimImpact(origin,{...origin},world()),null);
});
test('a ram drone overlapping the launch point produces one legitimate zero-distance contact',()=>{
  const w=world([{id:'overlapping-scout',center:{...origin},radius:.72,material:'drone'}]);
  const aimed=resolveAimImpact(origin,{x:0,y:2,z:140},w);
  assert.equal(aimed.fraction,0);assert.deepEqual(aimed.point,origin);
  const pipe=new MissionProjectilePipeline();pipe.fire(origin,direction,payload(),100,110);
  const result=drain(pipe,w);assert.equal(result.impacts.length,1);
  assert.equal(result.impacts[0].impact.targetId,'overlapping-scout');assert.deepEqual(result.impacts[0].to,origin);
  assert.equal(pipe.tick(w).impacts.length,0);assert.equal(pipe.pendingReceipts,0);
});
