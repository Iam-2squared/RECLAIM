import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShiretokoTerrain, routeSample } from '../src/shiretoko-phase1/terrain.ts';
import { createFloraReviewLayer } from '../src/shiretoko-phase1/flora-renderer.ts';

test('opt-in flora creates physical-grounded instanced 3D with bounded draw calls and safe travel clearances',()=>{
  const terrain=new ShiretokoTerrain();
  const layer=createFloraReviewLayer(terrain,'low');
  assert(layer.instances>1200 && layer.instances<16_000, 'bounded sparse low-quality flora');
  assert(layer.drawGroups>0 && layer.drawGroups<=96);
  assert.equal(layer.quality,'low');
  assert.equal(layer.instanceBytes,layer.instances*76);
  const seen=new Set(),trees=new Set(),matrix=new THREE.Matrix4(),translation=new THREE.Vector3();
  let total=0,foundTalus=false;
  layer.group.traverse(node=>{
    if(!(node instanceof THREE.InstancedMesh))return;
    assert(node.count>0 && node.count<=layer.instances);
    assert(node.name.startsWith('flora/review/600m-'));
    assert(node.instanceColor && node.instanceColor.count===node.count);
    assert(node.frustumCulled, '600m cells must remain frustum-cullable');
    assert(node.boundingSphere && Number.isFinite(node.boundingSphere.radius));
    assert(node.geometry.getAttribute('color')?.count===node.geometry.getAttribute('position')?.count);
    assert(node.geometry.getAttribute('normal')?.count===node.geometry.getAttribute('position')?.count);
    if(node.name.endsWith('/spruce')||node.name.endsWith('/birch')){
      const species=node.name.split('/').at(-1);
      trees.add(species);
      const bounds=node.geometry.boundingBox;
      assert(bounds,'shared tree geometry must have CPU bounds for frustum culling');
      assert(bounds.min.y>=-.001,'tree geometry must be rooted at the ground');
      assert(bounds.max.y>(species==='spruce'?8.4:8.0) && bounds.max.y<10,
        'mature tree silhouette remains distinct and within the draw-budget envelope');
      assert(bounds.max.x-bounds.min.x>2.5,'crown must have real lateral branches');
      assert(node.geometry.getAttribute('position').count<500,
        'visual improvement must not explode per-instance vertex cost');
    }
    if(node.name.endsWith('/stone')){
      foundTalus=true;
      const geometry=node.geometry, bounds=geometry.boundingBox;
      const vertices=geometry.getAttribute('position'), colours=geometry.getAttribute('color');
      assert(bounds, 'instanced stone cluster must have a shared bounding box');
      assert(vertices.count>=120&&vertices.count<350,
        'three-facet talus replaces one pebble without excessive per-instance vertices');
      assert(bounds.min.y>=-.12&&bounds.max.y<1.05,
        'talus boulders remain rooted at the sampled physical ground, never hovering');
      assert(bounds.max.x-bounds.min.x>1.7,
        'stone silhouette must include separate lateral talus fragments');
      const swatches=new Set();
      for(let v=0;v<colours.count;v++)
        swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
      assert.equal(swatches.size,3,'three different rock faces share vertex colour material');
    }
    seen.add(node.geometry);total+=node.count;
    const sampled=[0,Math.floor(node.count/2),node.count-1];
    for(const i of sampled){
      node.getMatrixAt(i,matrix);translation.setFromMatrixPosition(matrix);
      for(const c of translation.toArray())assert(Number.isFinite(c));
      assert(translation.x>=-1200 && translation.x<1200);
      assert(translation.z>=-1200 && translation.z<1200);
      assert(Math.abs(translation.y-terrain.heightAt(translation.x,translation.z))<.0001,'same 5m collision surface');
      assert(routeSample(translation.x,translation.z).distance>=8,'no props in route');
      assert(!terrain.inWater(translation.x,translation.z),'no submerged props');
    }
  });
  assert.equal(total,layer.instances);
  assert(seen.size<=6,'all 600m culling groups must share species geometries');
  assert.deepEqual([...trees].sort(),['birch','spruce'],'both mature species rendered in low-quality mode');
  assert(foundTalus,'real terrain should render talus in the low setting');
  assert.equal(layer.group.children.filter(x=>x.isLight).length,2,'review-only light setup');
  for(const g of seen)g.dispose();
  for(const node of layer.group.children)if(node instanceof THREE.InstancedMesh)node.dispose();
  layer.group.clear();
});

test('invalid quality is rejected before allocating scene resources',()=>{
  assert.throws(()=>createFloraReviewLayer({},'ultra'),RangeError);
});
