import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain,coastDistance,routeSample} from '../src/shiretoko-phase1/terrain.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';

const terrain=new ShiretokoTerrain();
const cabin=createCliffCabinReview(terrain);
const X=-100,Z=835,left=X-9,right=X+9,back=Z-7;
test('cliff cabin has a real 3D furnished room, two pitched roof sides and bounded steps',()=>{
  assert(cabin.group instanceof T.Group);
  assert(cabin.parts>25 && cabin.parts<140);
  assert(cabin.stairs>=3 && cabin.stairs<=36);
  assert.equal(cabin.group.children.filter(x=>x.name.includes('pitched roof')).length,2);
  assert(cabin.group.children.some(x=>x.name==='cabin / doorway lintel'));
  assert(cabin.group.children.some(x=>x.name==='cabin / table'));
  assert(cabin.group.children.some(x=>x.name==='cabin / bunk base'));
  assert(cabin.floorY>terrain.heightAt(X,Z));
});
test('original cabin sits inland on bounded 5m terrain relief with eight ground-contact piers',()=>{
  const corners=[[left,back],[left,Z+7],[right,back],[right,Z+7],[X,Z]];
  const heights=corners.map(([x,z])=>terrain.heightAt(x,z));
  assert(Math.max(...heights)-Math.min(...heights)<2,
    'whole 18x14m real surface must not span an unsupported cliff face');
  assert(corners.every(([x,z])=>coastDistance(x,z)>45));
  assert(corners.every(([x,z])=>routeSample(x,z).distance>20));
  const piers=cabin.group.children.filter(x=>x.name==='cabin / terrain foundation pier');
  assert.equal(piers.length,8);
  assert.equal(cabin.supports,8);
  for(const pier of piers){
    const bottom=pier.position.y-pier.geometry.parameters.height/2;
    assert(Math.abs(bottom-terrain.heightAt(pier.position.x,pier.position.z))<1e-7);
    assert(pier.position.y+pier.geometry.parameters.height/2<cabin.floorY);
  }
});
test('every visible stair tread and the occupied floor share their exact top surface with walking',()=>{
  const treads=cabin.group.children.filter(x=>x.name.startsWith('cabin / tread '));
  assert.equal(treads.length,cabin.stairs);
  const sorted=[...treads].sort((a,b)=>Number(a.name.split(' ').at(-1))-Number(b.name.split(' ').at(-1)));
  for(let i=0;i<sorted.length;i++){
    const mesh=sorted[i],h=mesh.geometry.parameters.height;
    const sampled=cabin.heightAt(mesh.position.x,mesh.position.z);
    assert(sampled!==null,'stair top exists');
    assert(Math.abs(sampled-(mesh.position.y+h/2))<1e-8,'visible top agrees with collision height');
    if(i)assert(sampled>cabin.heightAt(sorted[i-1].position.x,Z));
    if(i)assert(sampled-cabin.heightAt(sorted[i-1].position.x,Z)<.27);
  }
  const floor=cabin.group.children.find(x=>x.name==='cabin / real wooden floor');
  assert(floor);
  assert.equal(cabin.heightAt(X,Z),floor.position.y+floor.geometry.parameters.height/2);
  assert.equal(cabin.heightAt(-800,500),null);
  assert.equal(cabin.heightAt(NaN,Z),null);
});
test('walls and furniture block the physical preview walker, but the doorway stays open',()=>{
  assert.equal(cabin.blockedAt(left,Z),true,'west wall');
  assert.equal(cabin.blockedAt(right,Z),false,'real doorway open');
  assert.equal(cabin.blockedAt(X,back),true,'north wall');
  assert.equal(cabin.blockedAt(X-2,Z+3),true,'table');
  assert.equal(cabin.blockedAt(X,Z),false,'walkable interior center');
  const rider=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(rider.place(X,Z));
  assert.equal(rider.y,cabin.floorY);
  assert.equal(rider.place(left,Z),false);
  assert.equal(rider.place(X-2,Z+3),false);
  assert.equal(rider.place(right,Z),true,'door has no invisible collider');
  // The old default walker intentionally has no opt-in cabin collision.
  const legacy=new TerrainWalker(terrain);
  assert.equal(legacy.y,terrain.heightAt(legacy.x,legacy.z));
});
test('real 60Hz walking follows the entry steps to the inside, then stops at the opposite wall',()=>{
  const rider=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(rider.place(cabin.entrance.x,cabin.entrance.z));
  rider.yaw=Math.PI/2;
  for(let i=0;i<245;i++)rider.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(rider.x<right-3, 'crossed the true east doorway to the interior');
  assert(rider.x>left+.3,'cannot tunnel through rear wall');
  assert.equal(rider.grounded,true);
  assert(Math.abs(rider.y-cabin.floorY)<1e-6);
  for(let i=0;i<230;i++)rider.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(rider.x>left+.2,'physical wall stops continued walking');
  assert(rider.x<left+1.2,'wall is an actual nearby obstacle, not a huge invisible boundary');
});
