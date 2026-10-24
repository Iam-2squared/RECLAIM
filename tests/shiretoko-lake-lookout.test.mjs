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
  assert.equal(review.group.children.length,8,'seven original groups plus one real indexed walking ramp');
  assert(piers instanceof T.InstancedMesh && rails instanceof T.InstancedMesh &&
    posts instanceof T.InstancedMesh && benches instanceof T.InstancedMesh);
  assert.equal(piers.count,6);
  assert.equal(rails.count,6,'two sloped guard heights share one instanced draw group');
  assert.equal(posts.count,6);
  assert.equal(benches.count,4,'two walk-blocking seats and two connected backs share one instanced draw group');
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

test('all eight bench legs physically bridge the actual pitched deck and visible seats',()=>{
  const seats=review.group.getObjectByName('lake-lookout / instanced rest benches');
  const legs=review.group.getObjectByName('lake-lookout / instanced grounded bench legs');
  assert(seats instanceof T.InstancedMesh && legs instanceof T.InstancedMesh);
  assert.equal(seats.count,4,'two seats plus two actual backrests share existing mesh and material');
  assert.equal(legs.count,8,'four real supports per seat, one extra draw call');
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3();
  const rotation=new T.Quaternion();
  for(let bench=0;bench<2;bench++){
    seats.getMatrixAt(bench,matrix);
    matrix.decompose(position,rotation,scale);
    const seatX=position.x,seatZ=position.z,underside=position.y-.085;
    assert.equal(review.blockedAt(seatX,seatZ),true,
      'visible seats remain collision solids');
    for(let j=0;j<4;j++){
      legs.getMatrixAt(bench*4+j,matrix);
      matrix.decompose(position,rotation,scale);
      assert(Math.abs(position.x-seatX)<=.51 && Math.abs(position.z-seatZ)<=.13,
        'leg remains within the original bench collision footprint');
      const foot=position.y-scale.y/2,top=position.y+scale.y/2;
      assert(Math.abs(foot-review.heightAt(position.x,position.z))<.0002,
        'no leg may float above or bury into the displayed deck triangles');
      assert(Math.abs(top-underside)<.0002,
        'leg top must actually touch the visible underside of the bench seat');
    }
  }
  assert.equal(review.blockedAt(site.x,site.z),false,
    'the centre walking strip is open between benches');
  assert.equal(review.blockedAt(review.entrance.x,review.entrance.z),false,
    'original west entrance and story save guards are untouched');
});

test('both lake benches have wooden backs physically joined to seats within existing collisions',()=>{
  const benches=review.group.getObjectByName('lake-lookout / instanced rest benches');
  assert(benches instanceof T.InstancedMesh);
  assert.equal(benches.count,4,'reuses two original seat instances plus two backs');
  assert.equal(review.group.children.length,8,'one added accessible 3D ramp, no extra bench draw group');
  const seatMatrix=new T.Matrix4(),backMatrix=new T.Matrix4();
  const seatPosition=new T.Vector3(),backPosition=new T.Vector3();
  const seatRotation=new T.Quaternion(),backRotation=new T.Quaternion();
  const scale=new T.Vector3();
  for(let i=0;i<2;i++){
    benches.getMatrixAt(i,seatMatrix);
    seatMatrix.decompose(seatPosition,seatRotation,scale);
    benches.getMatrixAt(i+2,backMatrix);
    backMatrix.decompose(backPosition,backRotation,scale);
    // Rotating the same .49m-depth seat slab upright makes a .49m back.
    const bottom=new T.Vector3(0,0,.245).applyMatrix4(backMatrix);
    assert(Math.abs(bottom.y-(seatPosition.y+.085))<.01,
      'upright back bottom must physically overlap the visible seat top');
    assert(Math.abs(backPosition.x-seatPosition.x)<.0002,
      'backrest stays aligned with its long seat plank');
    assert(Math.abs(Math.abs(backPosition.z-seatPosition.z)-.19)<.0002,
      'outer placement retains the entire original centre walking strip');
    assert(review.blockedAt(backPosition.x,backPosition.z),
      'backrest remains within the original bench collider');
    assert(Math.abs(backRotation.angleTo(new T.Quaternion().setFromAxisAngle(
      new T.Vector3(1,0,0),Math.PI/2)))<.0002,
      'backrest is visibly upright rather than a duplicate flat seat');
  }
  assert.equal(review.blockedAt(site.x,site.z),false,
    'two complete seats still leave the original central walking route');
  assert.equal(review.blockedAt(review.entrance.x,review.entrance.z),false,
    'west entry is open and walker footprint is unchanged');
});

test('all three visible rails meet real sloped deck at both ends and still match posts',()=>{
  const rails=review.group.getObjectByName('lake-lookout / instanced three-sided guard rails');
  assert(rails instanceof T.InstancedMesh);
  assert.equal(rails.count,6,'upper and lower three-sided guard share the same one-draw-call group');
  const edges=[
    [[site.x+4,site.z-5],[site.x+4,site.z+5]],
    [[site.x-4,site.z-5],[site.x+4,site.z-5]],
    [[site.x-4,site.z+5],[site.x+4,site.z+5]],
  ];
  const matrix=new T.Matrix4();
  for(const [band,offset] of [.95,.48].entries()){
    for(let i=0;i<edges.length;i++){
      rails.getMatrixAt(i+band*edges.length,matrix);
      for(const [endpoint,localX] of [[edges[i][0],-.5],[edges[i][1],.5]]){
        const actual=new T.Vector3(localX,0,0).applyMatrix4(matrix);
        const expectedY=review.heightAt(endpoint[0],endpoint[1]);
        assert.notEqual(expectedY,null);
        assert(Math.hypot(actual.x-endpoint[0],actual.z-endpoint[1])<.0002,
          'both rail bands must stay directly over the true deck edge');
        assert(Math.abs(actual.y-expectedY-offset)<.0002,
          'upper and lower rails must follow actual pitched deck at both ends');
      }
    }
  }
  assert.equal(review.blockedAt(site.x+3.9,site.z),true,
    'existing physical east rail and open west entrance are unchanged');
  assert.equal(review.blockedAt(review.entrance.x,review.entrance.z),false);
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

test('actual landward access ramp links 5m terrain to lake deck for the same native walker',()=>{
  const ramp=review.group.getObjectByName('lake-lookout / real surveyed landward access ramp');
  const deck=review.group.getObjectByName('lake-lookout / real indexed wooden walk top');
  assert(ramp instanceof T.Mesh && deck instanceof T.Mesh,'both floor pieces are rendered meshes');
  assert.equal(ramp.material,deck.material,'new real floor reuses the original wood material');
  const p=ramp.geometry.getAttribute('position'),indices=ramp.geometry.getIndex();
  assert.equal(p.count,9*7,'0.4m survey mesh, no giant ungrounded flat triangle');
  assert.equal(indices.count,8*6*6,'96 real triangles use a single additional draw call');
  assert(ramp.geometry.boundingSphere && ramp.geometry.getAttribute('normal'),
    'normal-lit real 3D ramp participates in frustum culling');
  const left=site.x-4,west=left-3.2,z=site.z;
  for(let iz=1;iz<6;iz++)for(let ix=1;ix<8;ix++){
    const i=iz*9+ix,x=p.getX(i),y=p.getY(i),v=p.getZ(i);
    const collisionY=review.heightAt(x,v);
    assert.notEqual(collisionY,null,'every visible inner ramp vertex is a real walker floor');
    assert(Math.abs(collisionY-y)<.0008,'rendered ramp and contact agree at all surveyed vertices');
    assert(y>=terrain.heightAt(x,v)-.001,'the approach does not disappear under actual ground');
  }
  assert.equal(review.heightAt(west-.15,z),null,
    'no review-only platform floor far outside the visible approach');
  assert.equal(review.blockedAt(west+1.2,z),false,'full 2.4m entrance stays open');
  assert(Math.abs(review.heightAt(left,z)-p.getY(4*9+8))<.0008,
    'landward ramp edge joins the exact old deck height without step or gap');
  const rider=new TerrainWalker(terrain,review.heightAt,review.blockedAt);
  assert(rider.place(west+.08,z),'native preview walker starts on real ramp near ground');
  rider.yaw=-Math.PI/2;
  for(let i=0;i<210;i++)rider.step({
    forward:1,right:0,sprint:false,jump:false,
  },1/60);
  assert(rider.x>site.x+.2,'walker physically traverses the ramp and reaches the lake-facing half');
  assert(rider.x<site.x+4,'the original visible east guard still blocks the native walker');
  assert(rider.grounded && Math.abs(rider.y-review.heightAt(rider.x,rider.z))<.00001,
    'walker never falls through either indexed wood surface');
  const original=new TerrainWalker(terrain);
  assert(original.place(west+.08,z),'old 5m world remains independently walkable');
  assert.equal(original.y,terrain.heightAt(west+.08,z),
    'ramp never rewrites terrain heights or campaign save coordinates');
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
  assert(geometries.size<=8,'the real approach adds only one terrain-conforming geometry');
  assert(materials.size<=4,'the extra grooves use one shared material only');
  for(const geom of geometries)geom.dispose();
  for(const material of materials)material.dispose();
  review.group.clear();
});
