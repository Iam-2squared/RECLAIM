import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {CABIN_SITE} from '../src/shiretoko-phase1/cabin-site.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';

test('true raised Shiretoko trail/lake map is fixed to west cabin wall in one drawable group',()=>{
  const terrain=new ShiretokoTerrain(),cabin=createCliffCabinReview(terrain);
  const wall=cabin.group.getObjectByName('cabin / west wall');
  const map=cabin.group.getObjectByName(
    'cabin / wall-mounted physical Shiretoko trail and lake map / instanced');
  assert(map instanceof T.InstancedMesh,'real map exists in the walkable room');
  assert(wall instanceof T.Mesh);
  assert.equal(map.count,17,'one backing, four frame rails, six route segments, two lakes, four markers');
  assert.equal(map.geometry.getAttribute('position').count,24,'all details reuse one physical box mesh');
  assert(map.frustumCulled&&map.boundingSphere&&Number.isFinite(map.boundingSphere.radius));
  assert(map.instanceColor&&map.instanceColor.count===17);
  const left=CABIN_SITE.x-CABIN_SITE.width/2,westFace=left+.34;
  const m=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion();
  const shades=new Set();
  for(let i=0;i<map.count;i++){
    map.getMatrixAt(i,m);m.decompose(p,q,s);
    assert([p.x,p.y,p.z,s.x,s.y,s.z].every(Number.isFinite));
    assert(p.x-s.x/2>=westFace-.02&&p.x+s.x/2<westFace+.23,
      'relief is inside existing west-wall player collision thickness');
    assert(p.y-s.y/2>cabin.floorY+.65&&p.y+s.y/2<cabin.floorY+2.7,
      'map is eye-height mounted, never a fake walkable floor');
    assert(Math.abs(p.z-CABIN_SITE.z-1.6)<1.6,'map stays inside real west wall');
    const tint=new T.Color();map.getColorAt(i,tint);
    shades.add([tint.r,tint.g,tint.b].map(v=>v.toFixed(3)).join(':'));
  }
  assert(shades.size>=5,'blue basin, pale terrain, ochre route, wood frame, copper pins are physically different');
  assert.equal(cabin.blockedAt(left+.36,CABIN_SITE.z+1.6),true,
    'existing padded wall collision already covers the entire map relief');
  assert.equal(cabin.blockedAt(CABIN_SITE.x,CABIN_SITE.z),false);
  assert.equal(cabin.blockedAt(CABIN_SITE.x+CABIN_SITE.width/2,CABIN_SITE.z),false,
    'open door remains free; no fake wall map collision barrier');
  assert.equal(cabin.heightAt(CABIN_SITE.x,CABIN_SITE.z),cabin.floorY,
    'original 480m saves and exact cabin walking floor are never changed');
  // Existing cabin walker path is preserved; creating a wall fixture must not
  // modify native deck, stair or room collisions.
  const walker=new TerrainWalker(terrain,(x,z)=>cabin.heightAt(x,z)??terrain.heightAt(x,z),
    (x,z)=>cabin.blockedAt(x,z));
  assert(walker.place(cabin.entrance.x,cabin.entrance.z));
  assert(walker.place(CABIN_SITE.x,CABIN_SITE.z));
  for(const child of cabin.group.children){
    if(child instanceof T.InstancedMesh)child.dispose();
    if(child instanceof T.Mesh){child.geometry.dispose();for(const material of Array.isArray(child.material)?child.material:[child.material])material.dispose();}
  }
  cabin.group.clear();
});
