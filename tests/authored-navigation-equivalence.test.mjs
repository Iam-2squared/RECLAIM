import{test}from'node:test';
import assert from'node:assert/strict';
import{authoredScenarioData,physicsScenario,hordeScenario}from'./helpers/authored-performance-scenario.mjs';
import{HordeDirector}from'../src/mission/horde-director.ts';

let data;
const actualData=()=>data??=(authoredScenarioData());

test('optimized physics matches the original authored floor, water and collision results at1738 points',async()=>{
 const measured=physicsScenario(await actualData());
 assert.equal(measured.samples,1738);
 // Recorded from the unchanged shipped implementation before optimization.
 assert.equal(measured.digest,'6fe625aa2410349837cfcce23faf2276e0bf485347291f0b1a93a4aa2d7954cd');
 assert.deepEqual(measured.stats,{terrainTriangles:10636,walkingTriangles:107931,waterTriangles:2634,colliders:48582});
});

test('all authored horde states remain identical from initialspawn through50 enemies at240s',async()=>{
 const measured=hordeScenario(await actualData());
 assert.equal(measured.digest,'a3ef94b2e8dc0015f9106effa6f49dd3d9c276a15991c6ff09479da9c47eca1f');
 assert.equal(measured.spawned,50);assert.ok(Math.abs(measured.elapsed-240)<1e-6);
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
