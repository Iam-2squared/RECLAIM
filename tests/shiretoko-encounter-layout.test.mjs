import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createShiretokoEncounterLayout} from '../src/world/shiretoko-encounter-layout.ts';
import {createAuthoredMapPhysics,authoredGroundMaskContains} from '../src/world/authored-map-physics.ts';

let prepared;
async function actual(){
  if(!prepared)prepared=(async()=>{
    const html=await readFile(new URL('../public/home-map/shiretoko.html',import.meta.url),'utf8');
    const encoded=JSON.parse(html.match(/const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;/)[1]);
    const data=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'))),layout=createShiretokoEncounterLayout(data);
    return{data,layout,before:createAuthoredMapPhysics(data),after:createAuthoredMapPhysics(data,[layout])};
  })();return prepared;
}
function walk(physics,path){
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.12);
    for(let n=0;n<=steps;n++){
      const t=n/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
      assert.ok(physics.isWalkable(x,z,y),`Unwalkable route at ${x},${y},${z}`);
      assert.ok(!physics.blockedAt(x,z,y,.32,1.76),`Blocked route at ${x},${y},${z}`);
      assert.ok(Math.abs(physics.heightAt(x,z,y)-y)<.15,`Discontinuous floor at ${x},${y},${z}: ${physics.heightAt(x,z,y)}`);
    }
  }
}

test('encounter layer is deterministic, additive, and midway between the authored home and warehouse',async()=>{
  const{data,layout,before,after}=await actual(),originalStructures=data.structures,originalMeshes=data.meshes;
  assert.equal(data.structures.length,64);assert.equal(data.meshes.length,12);assert.equal(data.vegetation.instances.length,3330);
  assert.equal(createShiretokoEncounterLayout(data,{heightAt(){throw Error('Overlay must not resample runtime terrain');}}),layout);
  assert.deepEqual(createShiretokoEncounterLayout({...data}),layout);
  assert.equal(data.structures,originalStructures);assert.equal(data.meshes,originalMeshes);
  assert.ok(layout.warehouse.roadProgress>.4&&layout.warehouse.roadProgress<.55);
  assert.equal(layout.warehouse.devices.length,2);assert.equal(new Set(layout.sourceMeshNames).size,layout.meshes.length);
  for(const mesh of layout.meshes){assert.ok(!originalStructures.includes(mesh)&&!originalMeshes.includes(mesh));assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.indices.every(index=>Number.isInteger(index)&&index>=0&&index<mesh.positions.length/3));}
  assert.deepEqual(after.colliders.slice(0,before.colliders.length),before.colliders);
  assert.equal(after.colliders.length,before.colliders.length+layout.colliders.length);
  for(const[x,z]of[[-169,604],[-190,-95],[20,150],[-160,-190]]){
    assert.equal(after.heightAt(x,z),before.heightAt(x,z));assert.equal(after.slopeAt(x,z),before.slopeAt(x,z));assert.equal(after.inWater(x,z),before.inWater(x,z));
  }
});

test('two machines have separate clear interior routes through the new warehouse doorway to the main road',async()=>{
  const{layout,after}=await actual(),warehouse=layout.warehouse;
  for(const device of warehouse.devices){assert.equal(after.heightAt(device.position.x,device.position.z,device.position.y),warehouse.floorHeight);assert.ok(!after.blockedAt(device.position.x,device.position.z,device.position.y,device.radius,2.8));}
  for(const path of Object.values(warehouse.paths))walk(after,path);
  assert.ok(after.blockedAt(-20,254,warehouse.floorHeight,.32,1.76),'Front wall must be solid away from doorway');
  assert.ok(after.blockedAt(0,260,warehouse.floorHeight,.32,1.76),'Rear wall must be solid');
  assert.ok(!after.blockedAt(warehouse.entrance.x,warehouse.entrance.z,warehouse.floorHeight,.32,1.76),'Loading doorway must remain clear');
  assert.ok(after.collidersNear(warehouse.center.x,warehouse.center.z,32).some(c=>c.tag.includes('warehouse-midway')));
});

test('foothill boss area has a continuous level playable floor and a walkable connection from the existing mountain path',async()=>{
  const{layout,before,after}=await actual(),arena=layout.bossArena;
  walk(after,arena.accessPath);
  for(let dx=-12;dx<=12;dx+=3)for(let dz=-12;dz<=12;dz+=3){
    if(Math.hypot(dx,dz)>arena.radius-1)continue;
    const x=arena.center.x+dx,z=arena.center.z+dz;
    assert.ok(Math.abs(after.heightAt(x,z,arena.center.y)-arena.center.y)<.00001);
    assert.ok(after.isWalkable(x,z,arena.center.y));assert.ok(!after.blockedAt(x,z,arena.center.y,.5,2.8));
  }
  for(const[dx,dz]of[[35,0],[-35,0],[0,35],[0,-35]])assert.equal(after.heightAt(arena.center.x+dx,arena.center.z+dz),before.heightAt(arena.center.x+dx,arena.center.z+dz));
  for(const item of layout.meshes)assert.ok(item.name.startsWith('Encounter /'));
  const trees=(await actual()).data.vegetation.instances.filter(item=>/pine|birch|spruce|tree|broadleaf|rock_large|boulder/i.test(item.prototype));
  for(const tree of trees)assert.ok(Math.hypot(tree.position[0]-arena.center.x,-tree.position[1]-arena.center.z)>arena.radius+.5,'Arena placement retains existing trees outside its clear fighting space');
  for(const radius of[0,7,arena.radius,arena.blendRadius])for(let i=0;i<96;i++){
    const angle=i/96*Math.PI*2,x=arena.center.x+Math.cos(angle)*radius,z=arena.center.z+Math.sin(angle)*radius;
    assert.ok(!before.inWater(x,z),`Arena must remain on original dry land at ${x},${z}`);
  }
});

test('replacement ground mask agrees with its polygon and hides higher source terrain from physics',async()=>{
  const{layout}=await actual(),mask=layout.groundMask;
  const highGround={meshes:[{name:'Terrain_Surface',positions:[-400,700,200,-400,-750,200,400,-750,200,400,700,200],indices:[0,1,2,0,2,3]}]};
  const base=createAuthoredMapPhysics(highGround),patched=createAuthoredMapPhysics(highGround,[layout]),center=layout.bossArena.center;
  assert.ok(Math.abs(base.heightAt(center.x,center.z)-200)<.00001);assert.ok(Math.abs(patched.heightAt(center.x,center.z)-center.y)<.00001);
  assert.ok(Math.abs(patched.heightAt(center.x+35,center.z)-200)<.00001);
  const sector=Math.PI*2/mask.sides;
  for(let i=0;i<mask.sides;i++)for(const angle of[i*sector,(i+.5)*sector]){
    const boundary=mask.radius*(angle===i*sector?1:Math.cos(sector/2));
    assert.equal(authoredGroundMaskContains(mask,center.x+Math.cos(angle)*(boundary-.002),center.z+Math.sin(angle)*(boundary-.002)),true);
    assert.equal(authoredGroundMaskContains(mask,center.x+Math.cos(angle)*(boundary+.002),center.z+Math.sin(angle)*(boundary+.002)),false);
  }
});
