import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSapporoMapWorld} from '../src/world/sapporo-map-world.ts';
test('actual lossless Sapporo GLB parses offline, renders authored geometry and owns no animation loop',async()=>{
 const compressed=new Uint8Array(await readFile(new URL('../public/sapporo-map/city.glb.gz',import.meta.url))),metadata=JSON.parse(await readFile(new URL('../public/sapporo-map/physics.json',import.meta.url),'utf8'));
 const world=await createSapporoMapWorld({compressed,metadata},'low');
 assert.equal(world.stats().source,'authored-sapporo');assert.equal(world.stats().totalSourceMeshes,223);assert.ok(world.stats().visibleSourceMeshes>0);assert.equal(world.routeStats().coverObjects,8);assert.equal(world.routeStats().checkpoints,6);
 const route=world.scene.getObjectByName('sapporo:blue-checkpoint-line');assert.ok(route?.isMesh);assert.ok(route.geometry.getAttribute('position').count>10000);
 for(const kind of ['tower','station'])assert.ok(world.scene.getObjectByName(`sapporo:boss-arena:${kind}`));
 world.setPhase(3);assert.equal(world.routeStats().phase,3);world.setPhase(4);assert.equal(world.routeStats().phase,4);
 world.update(world.sapporoLayout.bossArenas.station.center.x,world.sapporoLayout.bossArenas.station.center.z);assert.ok(world.colliders.length>0);world.setQuality('balanced');assert.equal(world.stats().quality,'balanced');
 world.dispose();assert.equal(world.stats().disposed,true);assert.equal(world.scene.children.length,0);assert.equal(world.stats().totalSourceMeshes,0);world.dispose();
});
