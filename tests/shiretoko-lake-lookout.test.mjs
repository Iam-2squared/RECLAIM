import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShiretokoTerrain, BASINS, basinDistance } from '../src/shiretoko-phase1/terrain.ts';
import { TerrainWalker } from '../src/shiretoko-phase1/walker.ts';
import { createLakeLookoutReview, lakeLookoutSite } from '../src/shiretoko-phase1/lake-lookout.ts';

const terrain=new ShiretokoTerrain();
const lake=BASINS.find(x=>x.id==='highland-lake');
const site=lakeLookoutSite(terrain);
const review=createLakeLookoutReview(terrain);

test('lake lookout is surveyed on real dry 5m terrain near the highland lake',()=>{
  assert.equal(site.z,lake.z);
  assert(site.x<lake.x,'western accessible shore, not a floating lake island');
  assert(basinDistance(lake,site.x,site.z)>1.06);
  assert(basinDistance(lake,site.x,site.z)<2.0,'outlook remains a lake-shore point');
  for(const dx of [-4,0,4])for(const dz of [-5,0,5]){
    const x=site.x+dx,z=site.z+dz;
    assert.equal(terrain.inWater(x,z),false,'no submerged deck corner or support');
    assert(terrain.slopeAt(x,z)<.85,'true walker slope budget');
  }
  assert.equal(review.supports,6);
  assert.equal(review.panels,1);
  assert(Math.abs(review.entrance.x-(site.x-3.2))<1e-9);
  assert.equal(review.entrance.z,site.z);
});

test('shore survey keeps both middle supports above the actual ground',()=>{
  // The 5m terrain need not be coplanar with the deck's two large triangles.
  // Reject a site that is dry at its corners but buries a side-midpoint pier.
  for(const x of [site.x-4,site.x+4]){
    const ground=terrain.heightAt(x,site.z);
    const deckY=(terrain.heightAt(x,site.z-5)+
      terrain.heightAt(x,site.z+5))/2+.29;
    assert(deckY-ground>=.08-1e-8,
      'six real support feet must reach the displayed triangle top');
    assert.equal(terrain.inWater(x,site.z),false);
    assert(terrain.slopeAt(x,site.z)<=.52);
  }
});

test('real indexed wooden triangles are authoritative for collision and render',()=>{
  const deck=review.group.children[0];
  assert(deck instanceof T.Mesh);
  assert.equal(deck.geometry.getIndex().count,6,'exactly two physical deck triangles');
  const index=deck.geometry.getIndex(),p=deck.geometry.getAttribute('position');
  for(let t=0;t<2;t++){
    const ids=[0,1,2].map(j=>index.getX(t*3+j));
    const x=ids.reduce((sum,i)=>sum+p.getX(i),0)/3;
    const y=ids.reduce((sum,i)=>sum+p.getY(i),0)/3;
    const z=ids.reduce((sum,i)=>sum+p.getZ(i),0)/3;
    const actual=review.heightAt(x,z);
    assert.notEqual(actual,null);
    assert(Math.abs(actual-y)<.0002,'walking height is the exact displayed triangle');
  }
  assert.equal(review.heightAt(site.x+7,site.z),null);
  assert.equal(review.heightAt(Infinity,site.z),null);
  assert.equal(review.heightAt(NaN,site.z),null);
});

test('lake supports, three visible rails and two benches are shared lightweight instanced draw groups',()=>{
  const [deck,piers,rails,posts,benches]=review.group.children;
  assert.equal(review.group.children.length,6,'seventeen plank seams share one draw group');
  assert(piers instanceof T.InstancedMesh && rails instanceof T.InstancedMesh &&
    posts instanceof T.InstancedMesh && benches instanceof T.InstancedMesh);
  assert.equal(piers.count,6);
  assert.equal(rails.count,3);
  assert.equal(posts.count,6);
  assert.equal(benches.count,2);
  const m=new T.Matrix4(),pos=new T.Vector3(),scale=new T.Vector3(),rot=new T.Quaternion();
  for(let i=0;i<piers.count;i++){
    piers.getMatrixAt(i,m);m.decompose(pos,rot,scale);
    const foot=pos.y-scale.y*.5;
    assert(Math.abs(foot-terrain.heightAt(pos.x,pos.z))<.0001,
      'every support must end on real 5m terrain, not float or penetrate');
    assert(Math.abs(pos.y+scale.y*.5-review.heightAt(pos.x,pos.z))<.0002,
      'support touches the physical displayed deck triangle');
  }
  assert(rails.geometry && deck.material);
});

test('native fixed-step walker can enter west side and stops at real lake-facing rail',()=>{
  const surface=(x,z)=>review.heightAt(x,z);
  const rider=new TerrainWalker(terrain,surface,review.blockedAt);
  const start=review.entrance;
  assert.equal(review.blockedAt(start.x,start.z),false,'landward approach is open');
  assert(rider.place(start.x,start.z),'genuine walker can start at selected lookout entry');
  assert(Math.abs(rider.y-surface(start.x,start.z))<1e-7);
  rider.yaw=-Math.PI/2;
  for(let i=0;i<240;i++)rider.step({
    forward:1,right:0,sprint:false,jump:false,
  },1/60);
  assert(rider.x>site.x+.5,'player actually advanced over the lookout floor');
  assert(rider.x<site.x+4,'the eastern guardrail is a physical blocker');
  assert.equal(rider.grounded,true);
  assert(Math.abs(rider.y-surface(rider.x,rider.z))<1e-6,'no sinking or phantom floor');
  assert(review.blockedAt(site.x+3.9,site.z),'visible lake-side rail blocks movement');
  assert(review.blockedAt(site.x,site.z+4.95),'north rail blocks movement');
  assert(review.blockedAt(site.x,site.z-4.95),'south rail blocks movement');
  const original=new TerrainWalker(terrain);
  assert.equal(original.place(start.x,start.z),true);
  assert.equal(original.y,terrain.heightAt(start.x,start.z),
    'normal 5m world has no experimental deck collision');
});

test('all 17 visible lookout deck grooves follow the real walkable 3D triangles',()=>{
  const grooves=review.group.getObjectByName('lake-lookout / terrain-conforming real plank grooves');
  assert(grooves instanceof T.Mesh,'genuine lookout review includes the groove geometry');
  const positions=grooves.geometry.getAttribute('position'),indices=grooves.geometry.getIndex();
  assert.equal(positions.count,17*2*4,'every strip is split on the diagonal');
  assert.equal(indices.count,17*2*6,'compact indexed geometry, not 17 draw calls');
  assert.equal(review.panels,1,'no secondary floor was introduced');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const expected=review.heightAt(x,z);
    assert.notEqual(expected,null,'grooves must remain inside the deck');
    assert(Math.abs(y-expected-.014)<.0002,'grooves track the real sloped floor');
    assert(z>site.z-5&&z<site.z+5,'leave railing endpoints unobstructed');
  }
  assert.equal(review.blockedAt(review.entrance.x,review.entrance.z),false,
    'genuine walker entrance is still open');
});

test('all review-only meshes dispose geometry without affecting campaign',()=>{
  const geometries=new Set(),materials=new Set();
  review.group.traverse(obj=>{
    if(obj instanceof T.Mesh){
      geometries.add(obj.geometry);
      for(const m of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(m);
      if(obj instanceof T.InstancedMesh)obj.dispose();
    }
  });
  assert(geometries.size<=6,'one shared indexed groove mesh, never per-plank draw calls');
  assert(materials.size<=4,'the extra grooves use one shared material only');
  for(const geom of geometries)geom.dispose();
  for(const material of materials)material.dispose();
  review.group.clear();
});
