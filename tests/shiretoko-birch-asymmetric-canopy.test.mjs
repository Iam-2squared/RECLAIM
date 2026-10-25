import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShiretokoTerrain } from '../src/shiretoko-phase1/terrain.ts';
import { createFloraReviewLayer } from '../src/shiretoko-phase1/flora-renderer.ts';

// This is the live 3D species geometry used by /shiretoko-nature.html,
// not a separate illustrative mesh or a source-string existence check.
test('asymmetric birch crown spreads into three world axes in the same real GPU batch',()=>{
  const terrain=new ShiretokoTerrain();
  const layer=createFloraReviewLayer(terrain,'low');
  const birches=layer.group.children.filter(o=>
    o instanceof T.InstancedMesh && o.name.endsWith('/birch'));
  assert(birches.length>0,'low-detail actual scene must contain birch trees');
  assert(layer.instances>1200 && layer.instances<16000);
  assert(layer.drawGroups<=96);
  assert.equal(layer.instanceBytes,layer.instances*76,'no new instance allocation');
  const shared=birches[0].geometry;
  assert(birches.every(o=>o.geometry===shared),'all 600m birches reuse one real geometry');
  const position=shared.getAttribute('position'),color=shared.getAttribute('color');
  assert.equal(position.count,color.count,'vertex-lit crown remains a single material');
  assert(position.count<500,'spread comes from the original low-poly vertices');
  assert(shared.boundingBox.min.y>=-.001 && shared.boundingBox.max.y>8.0 &&
    shared.boundingBox.max.y<10,'silhouette remains rooted and bounded');
  const toSwatch=hex=>new T.Color(hex).toArray().map(n=>Math.round(n*255)).join(',');
  const points=hex=>{
    const matching=[];
    for(let i=0;i<position.count;i++){
      const key=[color.getX(i),color.getY(i),color.getZ(i)]
        .map(n=>Math.round(n*255)).join(',');
      if(key===toSwatch(hex))
        matching.push([position.getX(i),position.getY(i),position.getZ(i)]);
    }
    return matching;
  };
  const west=points(0x6b8554),east=points(0x6e925c),towardsLake=points(0x4e7651);
  assert.equal(west.length,60);
  assert.equal(east.length,60);
  assert.equal(towardsLake.length,60);
  assert(Math.min(...west.map(p=>p[0]))< -1.80,'west overhang is actual 3D leaves');
  assert(Math.max(...east.map(p=>p[0]))>1.80,'east overhang is actual 3D leaves');
  assert(Math.min(...east.map(p=>p[2]))< -1.25,'east lobe reaches behind the trunk');
  assert(Math.max(...towardsLake.map(p=>p[2]))>1.35,
    'third asymmetric lobe reaches forward: no flat billboard');
  for(const hex of [0xa59f8a,0xb4ad98])
    assert(points(hex).length>=40,'two pale angled branch cylinders are genuine polygons');
  const ratios=new Set(),matrix=new T.Matrix4(),p=new T.Vector3(),scale=new T.Vector3();
  for(const mesh of birches)for(const i of [0,Math.floor(mesh.count/2),mesh.count-1]){
    mesh.getMatrixAt(i,matrix);
    p.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);
    assert(Math.abs(p.y-terrain.heightAt(p.x,p.z))<.0002,
      'birch instance roots still sample authoritative rendered 5m ground');
    assert(scale.x>0&&scale.z>0&&scale.y>0);
    ratios.add((scale.x/scale.y).toFixed(4)+':'+(scale.z/scale.y).toFixed(4));
  }
  assert(ratios.size>=3,'tree-to-tree crown proportions should remain varied');
  const geometries=new Set();
  layer.group.traverse(o=>{if(o instanceof T.InstancedMesh){geometries.add(o.geometry);o.dispose();}});
  for(const g of geometries)g.dispose();
  layer.group.clear();
});
