import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {CABIN_SITE} from '../src/shiretoko-phase1/cabin-site.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';
import {natureReviewFocus} from '../src/shiretoko-phase1/review-focus.ts';

test('only the explicit cabin+interior URL selects the real map-focused room camera',()=>{
  const source=readFileSync(new URL('../src/shiretoko-phase1/preview.ts',import.meta.url),'utf8');
  assert.match(source,/const interiorRequested = Boolean\\(cabinReview\\)/);
  assert.match(source,/query\\.get\\('interior'\\)/);
  assert.match(source,/const firstLook = interiorRequested && cabinReview/);
  assert.match(source,/position:\\[CABIN_SITE\\.x\\+4\\.6,cabinReview\\.floorY\\+2\\.35/);
  assert.match(source,/target:\\[CABIN_SITE\\.x-8\\.45,cabinReview\\.floorY\\+1\\.73/);
  assert.match(source,/interiorEntry \\?\\? cabinEntry/);
  assert.equal(natureReviewFocus(new URLSearchParams('interior=1'),()=>100),null,
    'indoor flag alone cannot create a phantom building or alter baseline');
  const ext=natureReviewFocus(new URLSearchParams('cabin=1'),()=>100);
  assert(ext && ext.kind==='cabin');
  assert.deepEqual(ext.position,[-60,112,820],
    'original standalone cabin exterior opening remains exactly unchanged');
});

test('real indoor orbit ray hits the original instanced wall map before the far wall',()=>{
  const terrain=new ShiretokoTerrain(),cabin=createCliffCabinReview(terrain);
  const map=cabin.group.getObjectByName(
    'cabin / wall-mounted physical Shiretoko trail and lake map / instanced');
  assert(map instanceof T.InstancedMesh);
  const eye=new T.Vector3(CABIN_SITE.x+4.6,cabin.floorY+2.35,CABIN_SITE.z-1.3);
  const target=new T.Vector3(CABIN_SITE.x-8.45,cabin.floorY+1.73,CABIN_SITE.z+1.6);
  const hits=new T.Raycaster(eye,target.clone().sub(eye).normalize(),0,35).intersectObject(map,false);
  assert(hits.length>0,'actual 3D visitor camera directly sees the physical wall map');
  assert(hits[0].distance>5&&hits[0].distance<18,'map is on the in-room west wall, not outside');
  assert.equal(cabin.blockedAt(CABIN_SITE.x,CABIN_SITE.z),false);
  const walker=new TerrainWalker(terrain,(x,z)=>cabin.heightAt(x,z)??terrain.heightAt(x,z),
    (x,z)=>cabin.blockedAt(x,z));
  assert(walker.place(CABIN_SITE.x,CABIN_SITE.z));
  assert.equal(walker.y,cabin.floorY,'real player spawns on original unchanged floor');
  const geometries=new Set(),materials=new Set();
  cabin.group.traverse(node=>{
    if(node instanceof T.InstancedMesh)node.dispose();
    if(node instanceof T.Mesh){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());cabin.group.clear();
});
