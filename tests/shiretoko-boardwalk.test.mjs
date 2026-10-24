import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShiretokoTerrain, ROUTE, TERRAIN } from '../src/shiretoko-phase1/terrain.ts';
import { createBoardwalkReview } from '../src/shiretoko-phase1/boardwalk.ts';
import { TerrainWalker } from '../src/shiretoko-phase1/walker.ts';

const terrain = new ShiretokoTerrain();
const boardwalk = createBoardwalkReview(terrain);
const start = ROUTE[3], next = ROUTE[4];
const midpoint = {x:(start.x+next.x)*.5,z:(start.z+next.z)*.5};

test('marsh review boardwalk is physical indexed triangles with bounded instanced support geometry',()=>{
  assert(boardwalk.panels>30&&boardwalk.panels<=260);
  assert.equal(boardwalk.indexedTriangles,boardwalk.panels*2);
  assert(boardwalk.supports>8&&boardwalk.supports<boardwalk.panels);
  assert.equal(boardwalk.group.children.length,6);
  const [deck,posts,seams,edging,rails,guardPosts]=boardwalk.group.children;
  assert.equal(seams.name,'boardwalk / plank seams / instanced');
  assert.equal(edging.name,'boardwalk / side edging / instanced');
  assert(seams.isInstancedMesh && edging.isInstancedMesh);
  assert.equal(seams.count,boardwalk.panels);
  assert.equal(edging.count,boardwalk.panels*2);
  assert.equal(seams.geometry.parameters.height,.025);
  assert.equal(edging.geometry.parameters.height,.09);
  assert.equal(rails.name,'boardwalk / pitch-matched guard rails / instanced');
  assert.equal(guardPosts.name,'boardwalk / deck-grounded guard posts / instanced');
  assert(rails.isInstancedMesh && guardPosts.isInstancedMesh);
  assert.equal(rails.count,boardwalk.panels*4,'both full-height and knee-height rails share one draw group');
  assert(guardPosts.count>100 && guardPosts.count<boardwalk.panels);
  assert.equal(rails.geometry.parameters.height,.12);
  assert.equal(guardPosts.geometry.parameters.height,.94);
  assert.equal(deck.type,'Mesh');
  assert.equal(posts.type,'Mesh'); // This Three.js build retains the Mesh type tag; isInstancedMesh is authoritative.
  assert(posts.isInstancedMesh);
  assert.equal(posts.count,boardwalk.supports);
  assert.equal(deck.geometry.getIndex().count,boardwalk.indexedTriangles*3);
  assert.equal(TERRAIN.cell,5);
});

test('triangle barycentres sample the exact displayed wooden deck, not a hidden collision proxy',()=>{
  const deck=boardwalk.group.children[0],position=deck.geometry.getAttribute('position'),
    indices=deck.geometry.getIndex();
  const epsilon=5e-4;
  for(let triangle=0;triangle<boardwalk.indexedTriangles;triangle+=Math.max(1,Math.floor(boardwalk.indexedTriangles/31))){
    const ids=[0,1,2].map(j=>indices.getX(triangle*3+j));
    const x=ids.reduce((a,i)=>a+position.getX(i),0)/3;
    const y=ids.reduce((a,i)=>a+position.getY(i),0)/3;
    const z=ids.reduce((a,i)=>a+position.getZ(i),0)/3;
    const surface=boardwalk.heightAt(x,z);
    assert(surface!==null,`no indexed platform beneath triangle ${triangle}`);
    assert(Math.abs(surface-y)<epsilon,`mesh and deck collision differ: ${surface} versus ${y}`);
  }
  assert.equal(boardwalk.heightAt(850,850),null);
  assert.equal(boardwalk.heightAt(NaN,0),null);
  assert.equal(boardwalk.heightAt(Infinity,0),null);
});

test('walkable platform stands on real deck without altering the default 5m walker',()=>{
  const platformY=boardwalk.heightAt(midpoint.x,midpoint.z);
  assert(platformY!==null);
  assert(platformY>terrain.heightAt(midpoint.x,midpoint.z)+.10);
  const original=new TerrainWalker(terrain);
  const rider=new TerrainWalker(terrain,boardwalk.heightAt);
  assert.equal(original.place(midpoint.x,midpoint.z),true);
  assert.equal(rider.place(midpoint.x,midpoint.z),true);
  assert.equal(original.y,terrain.heightAt(midpoint.x,midpoint.z));
  assert(Math.abs(rider.y-platformY)<1e-7);
  for(let i=0;i<100;i++){
    original.step({forward:0,right:0,sprint:false,jump:false},1/60);
    rider.step({forward:0,right:0,sprint:false,jump:false},1/60);
  }
  assert.equal(original.grounded,true);assert.equal(rider.grounded,true);
  assert.equal(original.y,terrain.heightAt(midpoint.x,midpoint.z));
  assert(Math.abs(rider.y-platformY)<1e-7);
  const wrong=new TerrainWalker(terrain,boardwalk.heightAt);
  assert.equal(wrong.place(TERRAIN.extent+5,0),false);
});

test('step and jump settle on the same indexed plank sampled for rendering',()=>{
  const rider=new TerrainWalker(terrain,boardwalk.heightAt);
  assert(rider.place(midpoint.x,midpoint.z));
  rider.step({forward:0,right:0,sprint:false,jump:true},1/60);
  assert.equal(rider.grounded,false);
  for(let i=0;i<90;i++)rider.step({forward:0,right:0,sprint:false,jump:false},1/60);
  assert.equal(rider.grounded,true);
  assert(Math.abs(rider.y-boardwalk.heightAt(midpoint.x,midpoint.z))<1e-7);
  // Optional floor is strictly confined to review: default constructor persists.
  const off=new TerrainWalker(terrain);
  assert.equal(off.place(midpoint.x,midpoint.z),true);
  assert.equal(off.y,terrain.heightAt(midpoint.x,midpoint.z));
});


test('visible plank seams share the real indexed deck height, not a phantom walkway',()=>{
  const seams=boardwalk.group.children[2];
  const m=new T.Matrix4(),p=new T.Vector3();
  const stride=Math.max(1,Math.floor(seams.count/21));
  for(let i=0;i<seams.count;i+=stride){
    seams.getMatrixAt(i,m);
    p.setFromMatrixPosition(m);
    const realTop=boardwalk.heightAt(p.x,p.z);
    assert.notEqual(realTop,null,'instanced seam must lie on a real wooden panel');
    assert(Math.abs(p.y-realTop-.012)<.007,
      'displayed seam must be grounded on the same indexed collision triangles');
  }
  // A seam marker does not obstruct the centre, nor alter exact deck contact.
  assert.equal(boardwalk.heightAt(midpoint.x,midpoint.z)!==null,true);
  assert(boardwalk.group.children.every(mesh=>mesh.geometry && mesh.material));
});

test('visible side guards follow real sloping deck corners and block only edges',()=>{
  const [deck,,,,rails,guardPosts]=boardwalk.group.children;
  const vertices=deck.geometry.getAttribute('position');
  const matrix=new T.Matrix4(),at=new T.Vector3();
  const stride=Math.max(1,Math.floor(boardwalk.panels/30));
  for(let panel=0;panel<boardwalk.panels;panel+=stride){
    for(let side=0;side<2;side++){
      const first=panel*4+side,last=first+2;
      const actualDeckY=(vertices.getY(first)+vertices.getY(last))*.5;
      for(const [band,lift] of [.88,.48].entries()){
        const i=panel*4+side*2+band;
        rails.getMatrixAt(i,matrix);at.setFromMatrixPosition(matrix);
        assert(Math.abs(at.y-actualDeckY-lift)<.001,
          'both handrail and knee rail must follow actual indexed deck pitch');
        assert(boardwalk.blockedAt(at.x,at.z),
          'both visible side bands must share original physical edge collision');
      }
    }
  }
  assert.equal(boardwalk.blockedAt(midpoint.x,midpoint.z),false,
    'the original 3.2m central path remains traversable');
  assert.equal(boardwalk.blockedAt(NaN,midpoint.z),true,'reject invalid collision coordinates');
  const walker=new TerrainWalker(terrain,boardwalk.heightAt,boardwalk.blockedAt);
  assert(walker.place(midpoint.x,midpoint.z));
  for(let i=0;i<90;i++)walker.step({forward:0,right:0,sprint:false,jump:false},1/60);
  assert(walker.grounded);
  assert(Math.abs(walker.y-boardwalk.heightAt(midpoint.x,midpoint.z))<1e-7);
  for(let i=0;i<guardPosts.count;i+=Math.max(1,Math.floor(guardPosts.count/30))){
    guardPosts.getMatrixAt(i,matrix);at.setFromMatrixPosition(matrix);
    const deckY=boardwalk.heightAt(at.x,at.z);
    assert(deckY!==null,'post must be on real terrain-derived deck edge');
    assert(Math.abs(at.y-.47-deckY)<.005,'posts must rest on exactly the indexed deck');
  }
});
