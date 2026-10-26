import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createAuthoredMapPhysics,authoredPoint} from '../src/world/authored-map-physics.ts';
import {missionSegmentWorld} from '../src/mission/mission-collider-adapter.ts';
import {resolveAimImpact} from '../src/mission/trajectory-effects.ts';

test('actual warehouse walls shield a spawn device beyond the walking collision radius',async t=>{
  const html=await readFile(new URL('../public/home-map/shiretoko.html',import.meta.url),'utf8');
  const encoded=html.match(/const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;/);
  assert(encoded,'Uses the actual packaged authored-map payload');
  const data=JSON.parse(gunzipSync(Buffer.from(JSON.parse(encoded[1]),'base64')).toString('utf8'));
  const physics=createAuthoredMapPhysics(data),device=authoredPoint(data.warehouse.spawnpoints[0].position);
  const target={id:'spawn-humanoid',material:'metal',bounds:{minX:device.x-1.2,maxX:device.x+1.2,minY:device.y,maxY:device.y+2.3,minZ:device.z-1,maxZ:device.z+1}};
  const aim={x:device.x,y:device.y+1.3,z:device.z};

  for(const range of [70,100])await t.test(`${range}m shot stops at the supplied corrugated warehouse wall`,()=>{
    // Keep a horizontal device-height ray to isolate distant wall cover. These
    // are fixture eye coordinates; terrain and all wall proxies remain authored.
    const eye={x:device.x,y:aim.y,z:device.z+range};
    const world=radius=>{
      const cover=missionSegmentWorld(physics.collidersNear(eye.x,eye.z,radius),(x,z)=>physics.heightAt(x,z),null);
      return {...cover,solids:[...cover.solids,target]};
    };
    const walkingOnly=resolveAimImpact(eye,aim,world(32));
    assert.equal(walkingOnly?.targetId,target.id,'The local walking query reproduces the distant-cover omission');

    const combat=resolveAimImpact(eye,aim,world(144));
    assert(combat,'The full weapon-range query finds real cover');
    assert.match(combat.targetId,/authored\/metal\/Warehouse \/ Corrugated_Walls$/);
    assert.equal(combat.material,'metal');
    assert(combat.fraction<walkingOnly.fraction,'Cover receives the hit before the device');
    assert(combat.fraction*range>32,'The blocking wall is outside the local walking radius');
    assert(Math.abs(combat.point.z-device.z)>1,'Impact is outside the device hit bounds');
    assert(Math.abs(combat.point.y-aim.y)<1e-6,'The supplied wall blocks at device height');
  });
});
