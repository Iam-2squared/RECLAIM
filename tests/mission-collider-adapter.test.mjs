import test from 'node:test';
import assert from 'node:assert/strict';
import {missionSegmentWorld} from '../src/mission/mission-collider-adapter.ts';
import {resolveSegmentImpact} from '../src/mission/trajectory-effects.ts';
import {MissionProjectilePipeline} from '../src/mission/projectile-pipeline.ts';
import {DroneImpactBridge} from '../src/mission/drone-impact-bridge.ts';
const drone={id:'scout',center:{x:0,y:2,z:6},radius:.6};
const start={x:0,y:2,z:0},end={x:0,y:2,z:8},ground=()=>-100;
const wall={type:'aabb',minX:-1,maxX:1,minY:0,maxY:3,minZ:3,maxZ:3.3,tag:'warehouse-metal'};
const tree={type:'cylinder',x:0,z:2.8,radius:.3,minY:0,maxY:4,tag:'tree-trunk'};

test('terrain and cover come from authoritative physics input, never fabricated geometry',()=>{
 const world=missionSegmentWorld([wall,tree],ground,drone);
 assert.equal(world.heightAt,ground);
 assert.deepEqual(world.solids.map(s=>s.material),['metal','wood']);
 assert.equal(resolveSegmentImpact(start,end,world)?.material,'wood');
 assert.equal(resolveSegmentImpact(start,end,missionSegmentWorld([],ground,drone))?.material,'drone');
});
test('collision snapshot is immutable with respect to later source mutations',()=>{
 const box={...wall},world=missionSegmentWorld([box],ground,drone);
 box.maxZ=90;
 assert.equal(world.solids[0].bounds.maxZ,3.3);
});
test('invalid obstacle bounds, cylinder radius, tag and material fail closed',()=>{
 for(const c of [{...tree,radius:0},{...tree,radius:-1},{...tree,radius:NaN},
  {...wall,minX:5,maxX:1},{...wall,minY:3,maxY:3},{...wall,tag:''}])
  assert.throws(()=>missionSegmentWorld([c],ground,drone),RangeError);
 assert.throws(()=>missionSegmentWorld([wall],ground,drone,()=> 'drone'),RangeError);
});
test('simulated projectile hits wall before target, no ghost damage',()=>{
 const pipe=new MissionProjectilePipeline(),bridge=new DroneImpactBridge();
 const enemy={id:'scout',hp:20,hits:0,hit(damage){this.hp-=damage;this.hits++;return true;}};
 assert.notEqual(pipe.fire(start,{x:0,y:0,z:1},{owner:'player',weapon:'assault',damage:8}),null);
 const world=missionSegmentWorld([wall],ground,drone);
 let impact=null;
 for(let i=0;i<240&&!impact;i++){
  const frame=pipe.tick(world);
  if(frame.impacts.length){
   impact=frame.impacts[0];
   assert.equal(bridge.apply(frame,enemy,()=>assert.fail('blocked projectile defeated target')).acceptedHits,0);
  }
 }
 assert.equal(impact?.impact.material,'metal');
 assert.equal(enemy.hp,20);assert.equal(enemy.hits,0);
 assert.equal(pipe.pendingReceipts,0);
});
