import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createAuthoredMapPhysics,authoredPoint} from '../src/world/authored-map-physics.ts';
import {AUTHORED_MAP_META} from '../src/world/authored-map-meta.ts';
import {CharacterController} from '../src/mission/controller.ts';

let prepared;
async function actualMap(){
  if(!prepared)prepared=(async()=>{
    const html=await readFile(new URL('../public/home-map/shiretoko.html',import.meta.url),'utf8');
    const match=html.match(/const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;/);
    assert.ok(match,'Runtime map contains the actual authored mesh payload');
    const data=JSON.parse(gunzipSync(Buffer.from(JSON.parse(match[1]),'base64')).toString('utf8'));
    return {data,physics:createAuthoredMapPhysics(data)};
  })();
  return prepared;
}

test('authored coordinates and overlapping floors retain their real height and ground-floor spawn',async()=>{
  const {physics:p}=await actualMap();
  assert.deepEqual(authoredPoint([-169,-604,81.25]),{x:-169,y:81.25,z:604});
  assert.equal(p.spawn.x,AUTHORED_MAP_META.spawn.x);assert.equal(p.spawn.z,AUTHORED_MAP_META.spawn.z);
  assert.ok(Math.abs(p.spawn.y-81.9)<.001);
  assert.equal(p.blockedAt(p.spawn.x,p.spawn.z,p.spawn.y),false);
  assert.ok(Math.abs(p.heightAt(-177,599,81.9)-81.9)<.001);
  assert.ok(Math.abs(p.heightAt(-177,599,86.1)-86.1)<.001);
  assert.ok(p.stats.terrainTriangles>9000&&p.stats.walkingTriangles>30000);
});

test('real controller walks through authored doorway, descends porch steps and climbs the interior stairs',async()=>{
  const {physics:p}=await actualMap();
  const controller=new CharacterController(p,()=>[],p.bounds,p.spawn);
  for(let frame=0;frame<250;frame++)controller.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert.ok(controller.position.z<586,'Walked from inside the actual house through the doorway and onto terrain');
  assert.ok(controller.distance>12);assert.equal(controller.recoveries,0);
  assert.equal(controller.restore({x:-169,y:81.9,z:600.3,yaw:Math.PI,pitch:0}),true);
  for(let frame=0;frame<145;frame++)controller.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert.ok(controller.position.z>607.5);assert.ok(Math.abs(controller.position.y-86.1)<.001);
  assert.equal(controller.recoveries,0);
  assert.equal(p.blockedAt(-181,604,81.9),true,'Actual outside wall blocks the capsule');
  assert.equal(p.blockedAt(-169,595,81.9),false,'Actual front door opening stays open');
});

test('authored trail has dry continuous walking support, lake water blocks and fog boundary remains closed',async()=>{
  const {data,physics:p}=await actualMap();let previous=null,samples=0;
  for(const point of data.trail.path){
    if(point[1]>628.3)break;
    const x=point[0],z=-point[1],height=p.heightAt(x,z,point[2]);
    assert.ok(height>0,`Missing authored terrain at ${x},${z}`);
    assert.equal(p.inWater(x,z,point[2]),false);
    assert.ok(p.slopeAt(x,z,point[2])<=1.05);
    if(previous!==null)assert.ok(Math.abs(height-previous)<.45,'No unsupported rise beyond the controller step height');
    previous=height;samples++;
  }
  assert.ok(samples>4000);assert.equal(p.inWater(25,-195),true);
  assert.equal(p.isWalkable(15,-629),false);
  assert.equal(p.blockedAt(15,-628.9,270),true);
  assert.equal(p.collidersNear(-169,597),p.collidersNear(-168.9,597.1),'Stable nearby collider array within a spatial cell');
});
