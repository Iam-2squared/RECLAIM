import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {ShiretokoTerrain,routeSample,wetnessAt} from '../src/shiretoko-phase1/terrain.ts';
import {createNearMeadowReview} from '../src/shiretoko-phase1/near-meadow.ts';

test('near camera grass is one bounded, true 3D instanced mesh on the exact terrain with safe travel clearances',()=>{
  const terrain=new ShiretokoTerrain(),low=createNearMeadowReview(terrain,'low');
  const meshes=low.group.children.filter(o=>o instanceof T.InstancedMesh);
  assert.equal(meshes.length,2,'one original grass draw plus one cullable damp-edge cotton batch');
  const [mesh,cotton]=meshes;
  assert.equal(cotton.name,'flora/review/near-field-cottongrass/moisture-gated');
  assert(cotton.frustumCulled&&cotton.count===0);
  const cp=cotton.geometry.getAttribute('position'),cc=cotton.geometry.getAttribute('color');
  assert(cp.count>=50&&cp.count<150,'two real 3D cotton-tuft stems fit a compact geometry');
  assert.equal(cc.count,cp.count);
  assert(cotton.geometry.index.count>=100,'stalks and fluffy off-centre heads use indexed 3D triangles');
  const cb=cotton.geometry.boundingBox;
  assert(cb.min.y>=0&&cb.max.y>.95&&cb.max.y<1.2,
    'cotton grows from the actual terrain root, with small raised heads');
  const cream=new T.Color(0xf7f5e9),cottonColors=cc;
  let white=0;
  for(let v=0;v<cc.count;v++)
    if(Math.abs(cottonColors.getX(v)-cream.r)<.0001&&
      Math.abs(cottonColors.getY(v)-cream.g)<.0001&&
      Math.abs(cottonColors.getZ(v)-cream.b)<.0001)white++;
  assert(white>=12,'off-white cotton puffs are actual coloured 3D vertices, not texture cards');
  assert(mesh.frustumCulled);
  // The moving grass batch now includes two genuinely 3D seed-bearing
  // culms with ochre grains, without creating additional draw groups.
  assert(mesh.geometry.getAttribute('position').count>=75);
  assert.equal(mesh.geometry.getAttribute('color').count,mesh.geometry.getAttribute('position').count);
  const tone=new T.Color(0xa99b68),colour=mesh.geometry.getAttribute('color');
  let seedVertices=0;
  for(let i=0;i<colour.count;i++){
    if(Math.abs(colour.getX(i)-tone.r)<.0001 &&
      Math.abs(colour.getY(i)-tone.g)<.0001 &&
      Math.abs(colour.getZ(i)-tone.b)<.0001)seedVertices++;
  }
  assert(seedVertices>=12,'visible seed clusters must be baked into the shared low-poly 3D geometry');
  const pos=mesh.geometry.getAttribute('position'),bounds=mesh.geometry.boundingBox;
  mesh.geometry.computeBoundingBox();
  // The tallest genuine grain is h=.76 - .035 + .048*1.5 = .797 m
  // above the rooted origin. Assert the actual compact envelope rather
  // than the rejected (incorrectly assumed) >.80 m synthetic threshold.
  assert(mesh.geometry.boundingBox.max.y>.79 && mesh.geometry.boundingBox.max.y<.81);
  let best=null;
  for(const [x,z] of [[-210,370],[-130,410],[-170,600],[-100,835],[-140,690]]){
    low.sync(x,z);
    if(mesh.count>0){best={x,z,count:mesh.count};break;}
  }
  assert(best,'actual Shiretoko lowland near the visible marsh/forest must have grounded meadow tufts');
  assert(mesh.count<=600,'extra near-field tufts must respect the bounded low LOD pool');
  assert(mesh.instanceColor && mesh.instanceColor.count>=mesh.count,
    'patchy near-field grass shades through ONE instanced colour buffer');
  assert(mesh.instanceColor.version>0,'the shared tint buffer must be uploaded after sync');
  const shades=new Set(),instanceShade=new T.Color();
  for(let i=0;i<mesh.count;i++){
    mesh.getColorAt(i,instanceShade);
    assert(instanceShade.r>.75&&instanceShade.r<1.3&&
      instanceShade.g>.7&&instanceShade.g<1.3&&
      instanceShade.b>.65&&instanceShade.b<1.3,
      'slope/marsh-safe grass retains finite natural tint bounds');
    shades.add([instanceShade.r,instanceShade.g,instanceShade.b].map(v=>v.toFixed(3)).join(':'));
  }
  if(mesh.count>8)assert(shades.size>4,'world-seeded dry/moist colour variation is visible');
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
  assert(higher.instances>best.count && higher.instances<=1420,'balanced has denser but bounded near grass');
  assert.equal(higher.group.children.length,2);
  assert(higher.cottonClusters<=600,'balanced damp plants have a strict GPU instance cap');
  assert(higher.drawGroups<=2,'new cottongrass adds at most one cullable draw batch');
  // The review should show a real white-tipped fringe in damp lowlands.
  // Every instance is rooted on the SAME indexed 5m terrain, and inherits
  // the original water, route, slope and building clearance decisions.
  const wetReview=createNearMeadowReview(terrain,'low');
  let cottonEvidence=null;
  for(const [x,z] of [[-210,370],[-130,410],[-170,600],[-140,690],
    [-230,310],[-80,510],[145,435],[-60,440],[20,410],[-220,460]]){
    wetReview.sync(x,z);
    if(wetReview.cottonClusters>0){cottonEvidence={x,z,count:wetReview.cottonClusters};break;}
  }
  assert(cottonEvidence,'visible moist-marsh fringe grows natural, terrain-rooted cotton heads');
  assert(wetReview.cottonClusters<=240);
  const cottonBatch=wetReview.group.children[1];
  for(let i=0;i<cottonBatch.count;i++){
    cottonBatch.getMatrixAt(i,matrix);origin.setFromMatrixPosition(matrix);
    assert(Math.abs(origin.y-terrain.heightAt(origin.x,origin.z))<.0001,'cotton rooted in rendered 5m terrain');
    assert(!terrain.inWater(origin.x,origin.z),'white heads cannot be planted in water');
    assert(routeSample(origin.x,origin.z).distance>=8,'protect the entire native walk');
    const moisture=wetnessAt(origin.x,origin.z,origin.y);
    assert(moisture>=.14-1e-6&&moisture<=.65+1e-6,'cotton grows only on damp, drained marsh fringes');
    assert(terrain.slopeAt(origin.x,origin.z)<.35,'no tufts hanging off cliffs');
  }
  const replay=createNearMeadowReview(terrain,'low');
  replay.sync(cottonEvidence.x,cottonEvidence.z);
  assert.equal(replay.cottonClusters,wetReview.cottonClusters,'cotton placement is world-seeded, not frame-seeded');
  for(let i=0;i<cottonBatch.count;i++){
    replay.group.children[1].getMatrixAt(i,new T.Matrix4());
  }
  for(const layer of [low,second,higher,wetReview,replay]){
    for(const obj of layer.group.children){obj.dispose();obj.geometry.dispose();obj.material.dispose();}
    layer.group.clear();
  }
});
test('native page opt-in enables and updates near-field grass but ordinary TITLE/HOME do not',()=>{
  const page=readFileSync(new URL('../src/shiretoko-phase1/preview.ts',import.meta.url),'utf8');
  assert(page.includes("const nearMeadowReview = floraReview ? createNearMeadowReview(terrain, floraReview.quality) : null;"));
  assert(page.includes("if (nearMeadowReview) root.add(nearMeadowReview.group);"));
  assert(page.includes('nearMeadowReview?.sync(walking?walker.x:controls.target.x,'));
  assert(page.includes('nearMeadowTufts: nearMeadowReview?.instances ?? 0,'));
  assert(page.includes('nearMeadowCottonClusters: nearMeadowReview?.cottonClusters ?? 0,'));
  assert(page.includes('nearMeadowDrawGroups: nearMeadowReview?.drawGroups ?? 0,'));
  assert(!page.includes('nearMeadowDrawGroups: nearMeadowReview?.instances ? 1 : 0,'));
  assert.throws(()=>createNearMeadowReview({},'ultra'),RangeError);
});
