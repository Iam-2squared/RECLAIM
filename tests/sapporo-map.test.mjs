import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SapporoMapPhysics,SAPPORO_ARENA_COVERS} from '../src/world/sapporo-map-physics.ts';
import {SAPPORO_MAP_META as meta} from '../src/world/sapporo-map-meta.ts';
import {CharacterController} from '../src/mission/controller.ts';
import {collectSapporoMapAssets} from '../scripts/sapporo-map-package.mjs';
const source=JSON.parse(await readFile(new URL('../public/sapporo-map/physics.json',import.meta.url),'utf8'));
const physics=new SapporoMapPhysics(source);
test('Sapporo uses authored road heights, solid city walls and original river water',()=>{
 assert.equal(source.colliders.length,2173);assert.equal(physics.allColliders.length,2181);assert.equal(source.floors.length,1822);
 for(const point of [...meta.checkpoints,...Object.values(meta.bossArenas).map(a=>a.center)]){assert.ok(Math.abs(physics.heightAt(point.x,point.z)-point.y)<.001);assert.equal(physics.inWater(point.x,point.z,point.y),false);assert.equal(physics.blockedAt(point.x,point.z,point.y,.65,2),false);}
 assert.equal(physics.blockedAt(346.889952,133.971292,0,.4,1.8),true,'TV tower podium must remain solid');
 assert.equal(physics.blockedAt(55.023923,-909.090909,0,.4,1.8),true,'Station building must remain solid');
 const water=source.water[1],x=(water[0]+water[3]+water[6])/3,z=(water[2]+water[5]+water[8])/3;assert.equal(physics.inWater(x,z,0),true);
 for(const c of SAPPORO_ARENA_COVERS){const y=physics.heightAt(c.x,c.z);assert.equal(physics.blockedAt(c.x,c.z,y,.4,1.8),true);}
});
test('blue line connects every checkpoint and avoids source walls, cover and water at walking scale',()=>{
 assert.ok(meta.route.length>100);assert.equal(meta.checkpoints.length,6);assert.equal(meta.roads.length,51);
 for(const checkpoint of meta.checkpoints)assert.ok(meta.route.some(p=>Math.hypot(p.x-checkpoint.x,p.z-checkpoint.z)<.001));
 let samples=0;
 for(let i=1;i<meta.route.length;i++){const a=meta.route[i-1],b=meta.route[i],length=Math.hypot(b.x-a.x,b.z-a.z);for(let d=0;d<=length;d+=.4){const t=length?d/length:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=physics.heightAt(x,z);assert.equal(physics.blockedAt(x,z,y,.55,1.8),false,`Line intersects solid object at ${x},${z}`);assert.equal(physics.inWater(x,z,y),false);samples++;}}
 assert.ok(samples>8000);
});
test('actual player controller walks the complete blue route through the city with zero recoveries',()=>{
 const player=new CharacterController(physics,()=>physics.collidersNear(player.position.x,player.position.z),meta.bounds,meta.spawn);let steps=0;
 for(const point of meta.route.slice(1)){
  for(let local=0;Math.hypot(point.x-player.position.x,point.z-player.position.z)>.035;local++){
   assert.ok(local<1000,`Controller stuck near ${JSON.stringify(point)} at ${JSON.stringify(player.position)}`);
   const dx=point.x-player.position.x,dz=point.z-player.position.z;player.yaw=Math.atan2(-dx,-dz);player.step({forward:1,right:0,sprint:true,jump:false},Math.min(1/30,Math.hypot(dx,dz)/5.8));steps++;
  }
 }
 assert.ok(player.distance>3200);assert.equal(player.recoveries,0);assert.ok(steps>16000);assert.ok(Math.hypot(player.position.x-meta.exit.x,player.position.z-meta.exit.z)<.1);
});
test('standalone package includes the verified compact actual model, collision metadata and waiting photo once',async()=>{
 const bundle=await collectSapporoMapAssets(new URL('../public',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
 assert.ok(bundle.record.runtimeBytes<27*1024*1024);assert.equal(bundle.record.sourceModelModified,false);assert.equal(bundle.record.meshoptViews,667);assert.equal(bundle.record.externalDependencies,0);assert.ok(bundle.payload.photoDataUrl.startsWith('data:image/webp;base64,'));assert.equal(bundle.payload.metadata.sourceGlbSha256,bundle.record.sourceGlbSha256);
});
