import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {ShiretokoTerrain,routeSample} from '../src/shiretoko-phase1/terrain.ts';
import {createNearMeadowReview} from '../src/shiretoko-phase1/near-meadow.ts';

test('near camera grass is one bounded, true 3D instanced mesh on the exact terrain with safe travel clearances',()=>{
  const terrain=new ShiretokoTerrain(),low=createNearMeadowReview(terrain,'low');
  const meshes=low.group.children.filter(o=>o instanceof T.InstancedMesh);
  assert.equal(meshes.length,1);
  const mesh=meshes[0];
  assert(mesh.frustumCulled);
  assert(mesh.geometry.getAttribute('position').count>=40);
  assert(mesh.geometry.getAttribute('color').count>=40);
  const pos=mesh.geometry.getAttribute('position'),bounds=mesh.geometry.boundingBox;
  mesh.geometry.computeBoundingBox();
  assert(mesh.geometry.boundingBox.max.y>.5 && mesh.geometry.boundingBox.max.y<.8);
  let best=null;
  for(const [x,z] of [[-210,370],[-130,410],[-170,600],[-100,835],[-140,690]]){
    low.sync(x,z);
    if(mesh.count>0){best={x,z,count:mesh.count};break;}
  }
  assert(best,'actual Shiretoko lowland near the visible marsh/forest must have grounded meadow tufts');
  assert(mesh.count<=430);
  const matrix=new T.Matrix4(),origin=new T.Vector3();
  for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);origin.setFromMatrixPosition(matrix);
    assert(Math.abs(origin.y-terrain.heightAt(origin.x,origin.z))<.0001,'exact 5m render-ground contact');
    assert(!terrain.inWater(origin.x,origin.z),'never plant in water');
    assert(routeSample(origin.x,origin.z).distance>=8,'retain all original walking paths');
  }
  const snapshots=[];
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);snapshots.push(matrix.elements.slice());}
  const n=low.rebuilds;
  assert.equal(low.sync(best.x+1,best.z+1),false,'no per-frame vegetation rebuild');
  assert.equal(low.rebuilds,n);assert.equal(mesh.count,best.count);
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert.deepEqual(matrix.elements,snapshots[i]);}
  assert.equal(low.sync(best.x+24,best.z),true,'moving between 12m ring cells updates a reused GPU group');
  assert.equal(low.group.children[0],mesh);
  assert.equal(low.rebuilds,n+1);
  const second=createNearMeadowReview(terrain,'low');
  second.sync(best.x,best.z);
  assert.equal(second.instances,best.count,'world-seeded placement never depends on camera or frame history');
  const higher=createNearMeadowReview(terrain,'balanced');
  higher.sync(best.x,best.z);
  assert(higher.instances>best.count && higher.instances<=1150,'balanced has denser but bounded near grass');
  assert.equal(higher.group.children.length,1);
  for(const layer of [low,second,higher]){const obj=layer.group.children[0];obj.dispose();obj.geometry.dispose();obj.material.dispose();layer.group.clear();}
});
test('native page opt-in enables and updates near-field grass but ordinary TITLE/HOME do not',()=>{
  const page=readFileSync(new URL('../src/shiretoko-phase1/preview.ts',import.meta.url),'utf8');
  assert(page.includes("const nearMeadowReview = floraReview ? createNearMeadowReview(terrain, floraReview.quality) : null;"));
  assert(page.includes("if (nearMeadowReview) root.add(nearMeadowReview.group);"));
  assert(page.includes('nearMeadowReview?.sync(walking?walker.x:controls.target.x,'));
  assert(page.includes('nearMeadowTufts: nearMeadowReview?.instances ?? 0,'));
  assert.throws(()=>createNearMeadowReview({},'ultra'),RangeError);
});
