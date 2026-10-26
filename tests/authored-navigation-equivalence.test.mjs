import{test}from'node:test';
import assert from'node:assert/strict';
import{authoredScenarioData,physicsScenario}from'./helpers/authored-performance-scenario.mjs';
import{HordeDirector,createAuthoredHorde}from'../src/mission/horde-director.ts';
import{createAuthoredMapPhysics}from'../src/world/authored-map-physics.ts';
import{createShiretokoEncounterLayout}from'../src/world/shiretoko-encounter-layout.ts';

let data;
const actualData=()=>data??=(authoredScenarioData());

test('optimized physics matches the original authored floor, water and collision results at1738 points',async()=>{
 const measured=physicsScenario(await actualData());
 assert.equal(measured.samples,1738);
 // Recorded from the unchanged shipped implementation before optimization.
 assert.equal(measured.digest,'6fe625aa2410349837cfcce23faf2276e0bf485347291f0b1a93a4aa2d7954cd');
 assert.deepEqual(measured.stats,{terrainTriangles:10636,walkingTriangles:107931,waterTriangles:2634,colliders:48582});
});

test('authored warehouses independently reach20 at100s and30 at150s with no initial road enemies',async()=>{
 const authored=await actualData(),layout=createShiretokoEncounterLayout(authored),physics=createAuthoredMapPhysics(authored,[layout]),horde=createAuthoredHorde(authored,physics),player={...physics.spawn},idle={combatEnabled:false};
 assert.equal(horde.units.length,0);assert.equal(horde.devices.length,4);assert.deepEqual(horde.summary().sources.map(source=>source.target),[20,30]);
 assert.equal(horde.devices.every(device=>device.hp===500&&device.maxHp===500),true);
 horde.step(5,player,idle);assert.deepEqual(horde.units.map(unit=>unit.kind),['humanoid','humanoid']);
 horde.step(95,player,idle);assert.deepEqual(horde.summary().sources.map(source=>[source.spawned,source.finished]),[[20,true],[20,false]]);
 horde.step(50,player,idle);assert.deepEqual(horde.summary().sources.map(source=>[source.spawned,source.finished]),[[20,true],[30,true]]);assert.equal(horde.finished,true);
 for(const source of horde.sources){
  const units=horde.units.filter(unit=>unit.sourceId===source.id);assert.equal(units.filter(unit=>unit.kind==='humanoid').length,source.cap/2);assert.equal(units.filter(unit=>unit.kind==='drone').length,source.cap/2);
  assert.ok(units.some(unit=>unit.lane==='road'),'Each warehouse has a clear exit onto the actual trail');
  for(const unit of units){assert.ok(Object.values(unit.position).every(Number.isFinite));const route=unit.lane==='road'?horde.road:source.warehouseRoad[unit.kind];assert.ok(route.project(unit.position).distance<=1.5);}
 }
 horde.step(10,player,idle);assert.equal(horde.units.length,50);horde.hitDevice(horde.devices[0].id,500);horde.reset();assert.equal(horde.units.length,0);assert.equal(horde.devices.every(device=>device.hp===500&&!device.destroyed),true);
});

function fixture(){return new HordeDirector({road:[{x:0,y:0,z:0},{x:0,y:0,z:-300}],warehouseRoad:{humanoid:[{x:10,y:0,z:-100},{x:0,y:0,z:-100}],drone:[{x:12,y:0,z:-100},{x:0,y:0,z:-100}]},terrain:{heightAt:()=>0,inWater:()=>false,blockedAt:()=>false},devices:[{kind:'humanoid',position:{x:10,y:0,z:-100}},{kind:'drone',position:{x:12,y:0,z:-100}}]});}

test('far enemies follow the same route without unnecessary line-of-sight queries; HUD summary keeps snapshot isolation',()=>{
 const a=fixture(),b=fixture(),far={x:1000,y:0,z:1000};let queries=0;
 a.step(10,far,{visible:()=>{queries++;return true;}});b.step(10,far,{visible:()=>false});
 assert.equal(queries,0);assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.spawned,4);
 const summary=a.summary(),snapshot=a.snapshot();assert.equal('units'in summary,false);assert.equal(summary.devices,a.devices);
 for(const key of ['elapsed','target','scheduled','spawned','killed','alive','skipped','finished','nextSpawnIn'])assert.equal(summary[key],snapshot[key]);
 snapshot.devices[0].position.x+=100;assert.notEqual(snapshot.devices[0].position.x,a.devices[0].position.x);
 const point={x:0,y:0,z:-20},projection=a.road.project(point);projection.point.x=200;
 assert.equal(a.road.project(point).point.x,0,'A caller cannot mutate the last-query projection cache');
});
