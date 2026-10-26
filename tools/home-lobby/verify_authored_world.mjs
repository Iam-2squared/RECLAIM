import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { decodeAuthoredMapHtml } from '../../src/world/authored-map-data.ts';
import { createAuthoredMapWorld } from '../../src/world/authored-map-world.ts';

const html=await readFile(new URL('../../public/home-map/shiretoko.html',import.meta.url),'utf8');
const data=await decodeAuthoredMapHtml(html);
const world=await createAuthoredMapWorld(data,'low',{textureFactory:async()=>new T.Texture()});
assert.equal(world.data.atmosphere.preset,'purple_storm');
assert(world.scene.getObjectByName('authored:purple-storm-sky'));
for(const source of [...data.meshes,...data.structures]){
 const mesh=world.scene.getObjectByName(source.name);assert(mesh?.isMesh,`Source mesh absent: ${source.name}`);
 const position=mesh.geometry.getAttribute('position');
 assert.equal(position.getX(0),Math.fround(source.positions[0]));
 assert(Math.abs(position.getY(0)-Math.fround(source.positions[2]))<1e-4);
 assert(Math.abs(position.getZ(0)+Math.fround(source.positions[1]))<1e-4);
 assert.equal(mesh.geometry.index.count,source.indices.length);
}
assert(world.terrain.isWalkable(world.spawn.x,world.spawn.z,world.spawn.y));
assert(Math.abs(world.terrain.heightAt(world.spawn.x,world.spawn.z,world.spawn.y)-world.spawn.y)<.001);
const first=world.stats();assert.equal(first.totalAuthoredInstances,data.vegetation.instances.length);assert(first.instances>0);assert(first.instances<first.totalAuthoredInstances);
world.update(-190,-95);const moved=world.stats();assert(moved.colliders>0);assert(moved.instances>0);
world.setQuality('balanced');assert(world.stats().instances>=moved.instances);
assert(world.scene.getObjectByName('runtime:opening-radio'));
world.dispose();const disposed=world.stats();assert(disposed.disposed);assert.equal(disposed.geometries,0);assert.equal(disposed.materials,0);assert.equal(disposed.textures,0);assert.equal(world.scene.children.length,0);
console.log(JSON.stringify({terrainMeshes:data.meshes.length,structureMeshes:data.structures.length,totalSourceInstances:data.vegetation.instances.length,initialLow:first,movedLow:moved,geometryOnlyTextureStub:true,coordinateMapping:'source(x,y,z) -> Three(x,z,-y)',disposed:true},null,2));
