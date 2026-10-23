import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(boardwalk.group.children.length,2);
  const [deck,posts]=boardwalk.group.children;
  assert.equal(deck.type,'Mesh');
  assert.equal(posts.type,'Mesh'); // InstancedMesh has type 'Mesh' in Three.js
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
