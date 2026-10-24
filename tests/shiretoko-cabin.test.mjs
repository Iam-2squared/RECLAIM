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
test('a grounded stove and roof-contact flue are tangible and keep entrance/corridor clear',()=>{
  const hearth=cabin.group.getObjectByName('cabin / stone stove hearth');
  const stove=cabin.group.getObjectByName('cabin / iron stove body');
  const top=cabin.group.getObjectByName('cabin / iron stove top');
  const firebox=cabin.group.getObjectByName('cabin / firebox glass');
  const flue=cabin.group.getObjectByName('cabin / roof-contact stove flue');
  for(const part of [hearth,stove,top,firebox,flue])
    assert(part instanceof T.Mesh,'visible interior has real box geometry, not a decal');
  assert(Math.abs(hearth.position.y-hearth.geometry.parameters.height/2-cabin.floorY)<1e-8,
    'hearth sits exactly on the original floor');
  assert(Math.abs(stove.position.y-stove.geometry.parameters.height/2-
    (cabin.floorY+.11))<1e-8,'heavy stove rests on the visible hearth');
  const stoveX=X-2.5,stoveZ=Z-4.8;
  const peak=cabin.floorY+3.25+2.3,eave=cabin.floorY+3.25+.16;
  const roofY=peak-(peak-eave)*Math.abs(stoveX-X)/10;
  const end=flue.position.y+flue.geometry.parameters.height/2;
  assert(Math.abs(end-(roofY-.05))<.0001,'flue reaches true pitched roof underside');
  assert.equal(cabin.blockedAt(stoveX,stoveZ),true,'visible stove is physical');
  assert.equal(cabin.blockedAt(X,Z),false,'original central passage remains open');
  assert.equal(cabin.blockedAt(right,Z),false,'east doorway remains open');
  const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert.equal(walker.place(stoveX,stoveZ),false,'cannot walk through hot stove');
  assert.equal(walker.place(X,Z),true,'can still stand inside room');
  assert.equal(walker.place(right,Z),true,'can still enter and exit');
  assert.equal(cabin.heightAt(X,Z),cabin.floorY,'no fake floors or save transform');
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

test('stair handrails use one instanced post mesh and remain outside walkable corridor',()=>{
  const posts=cabin.group.children.find(x=>x.name==='cabin / stair rail posts / instanced');
  assert(posts instanceof T.InstancedMesh);
  assert.equal(posts.count,cabin.stairs*2);
  assert.equal(posts.geometry.parameters.height,1.06);
  const matrix=new T.Matrix4(),point=new T.Vector3();
  for(let i=0;i<posts.count;i++){
    posts.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
    const top=cabin.heightAt(point.x,Z);
    assert(Number.isFinite(top),'post must attach to actual supported step');
    assert(Math.abs((point.y-1.06/2)-top)<.20,
      'rail post must overlap step/stringer rather than float above it');
    assert(Math.abs(point.z-Z)>1.15,'post cannot obstruct the 2.3m stair corridor');
  }
  for(const side of [-1,1]){
    const beam=cabin.group.children.find(x=>x.name==='cabin / timber handrail '+side);
    const stringer=cabin.group.children.find(x=>x.name==='cabin / stair stringer '+side);
    assert(beam instanceof T.Mesh && stringer instanceof T.Mesh);
    assert.equal(beam.geometry.parameters.depth,.16);
    assert.equal(stringer.geometry.parameters.depth,.18);
    assert.equal(cabin.blockedAt(right+4,Z+side*1.08),true,
      'visible rail has a horizontal player collision margin');
    assert.equal(cabin.blockedAt(right+4,Z),false,
      'actual central entry path must remain passable');
  }
  // Native walker still steps through door and reaches the real floor.
  const rider=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(rider.place(cabin.entrance.x,Z));
  rider.yaw=Math.PI/2;
  for(let i=0;i<245;i++)rider.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(rider.x<right-3);
  assert(Math.abs(rider.y-cabin.floorY)<1e-6);
});


test('both cabin windows have genuine see-through wall openings above collision-safe sills',()=>{
  cabin.group.updateMatrixWorld(true);
  const windowX=X-4, eyeY=cabin.floorY+1.86;
  const panes=cabin.group.children.filter(m=>m.name==='cabin / glazed window');
  assert.equal(panes.length,2);
  assert(panes.every(m=>m.material.transparent && m.material.opacity<1),
    'actual glazing must remain transparent rather than an opaque window decal');
  const jambs=cabin.group.children.filter(m=>m.name==='cabin / window jamb');
  assert.equal(jambs.length,4);
  for(const [side,z,sign] of [['north',back-2,1],['south',Z+7+2,-1]]){
    const walls=cabin.group.children.filter(m=>m.name.startsWith('cabin / '+side+' wall'));
    assert.equal(walls.length,4,'window aperture is framed by four solid wall pieces');
    const opaqueHit=(x,y)=>{
      const ray=new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(0,0,sign),0,4);
      return walls.some(mesh=>ray.intersectObject(mesh,false).length>0);
    };
    assert.equal(opaqueHit(windowX,eyeY),false,
      'glass-level sightline must not intersect an invisible solid wall');
    assert.equal(opaqueHit(windowX,cabin.floorY+.7),true,
      'real solid wall below glazing prevents a crawl-through gap');
    assert.equal(opaqueHit(X+1,eyeY),true,
      'opaque exterior remains intact beside the window');
  }
  // A raised wall opening does not alter the existing 2D walker footprint.
  assert.equal(cabin.blockedAt(windowX,back),true);
  assert.equal(cabin.blockedAt(windowX,Z+7),true);
  assert.equal(cabin.blockedAt(right,Z),false,'original east door stays open');
  assert.equal(cabin.heightAt(X,Z),cabin.floorY,'floor remains exactly walkable');
});

test('bounded cedar wall cladding is real instanced geometry and leaves genuine windows unobstructed',()=>{
  const siding=cabin.group.children.find(x=>x.name==='cabin / cedar cladding / instanced');
  assert(siding instanceof T.InstancedMesh,'exterior siding is not 55 separate draw calls');
  assert(siding.count>=40 && siding.count<100,'cedar strips must stay inside one bounded draw batch');
  assert.equal(siding.geometry.parameters.height,.34);
  assert(siding.instanceColor && siding.instanceColor.count===siding.count,
    'individual boards have weathered colours without extra materials');
  const positions=new T.Vector3(),matrix=new T.Matrix4(),swatches=new Set();
  for(let i=0;i<siding.count;i++){
    siding.getMatrixAt(i,matrix);
    positions.setFromMatrixPosition(matrix);
    for(const value of positions.toArray())assert(Number.isFinite(value));
    assert(positions.y>cabin.floorY && positions.y<cabin.floorY+3.3);
    const colour=new T.Color();siding.getColorAt(i,colour);
    swatches.add(colour.getHex());
  }
  assert(swatches.size>=3,'siding should not look like repeated monochrome panels');
  cabin.group.updateMatrixWorld(true);
  for(const [z,dz] of [[back-2,1],[Z+9,-1]]){
    const ray=new T.Raycaster(new T.Vector3(X-4,cabin.floorY+1.86,z),
      new T.Vector3(0,0,dz),0,4);
    assert.equal(ray.intersectObject(siding,false).length,0,
      'cedar may not obstruct the true transparent cabin window aperture');
  }
  assert.equal(cabin.blockedAt(right,Z),false,'doorway remains walkable');
  assert.equal(cabin.heightAt(X,Z),cabin.floorY,'cedar does not create fake physical floors');
});

test('standing-seam roof adds one instance batch with ribs resting on the real pitched roof',()=>{
  const seams=cabin.group.children.find(x=>x.name==='cabin / standing seam metal roof / instanced');
  assert(seams instanceof T.InstancedMesh,'roof ribs are not individual draw calls');
  assert.equal(seams.count,33,'30 sloping seams, one ridge cap and two drip edges');
  assert.equal(seams.geometry.getAttribute('position').count,24,'lightweight repeated box geometry');
  assert(seams.boundingSphere && Number.isFinite(seams.boundingSphere.radius));
  assert(seams.instanceColor && seams.instanceColor.count===seams.count);
  const roofSides=cabin.group.children.filter(x=>x.name.endsWith('pitched roof'));
  assert.equal(roofSides.length,2,'original real roof surfaces are preserved');
  const matrix=new T.Matrix4(),colour=new T.Color(),swatches=new Set();
  const peak=cabin.floorY+3.25+2.3,eave=cabin.floorY+3.25+.16;
  for(let i=0;i<30;i++){
    seams.getMatrixAt(i,matrix);
    seams.getColorAt(i,colour);swatches.add(colour.getHex());
    const side=i<15?-1:1;
    for(const endpoint of [-.5,.5]){
      const point=new T.Vector3(endpoint,0,0).applyMatrix4(matrix);
      assert(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z));
      assert(point.z>=Z-8&&point.z<=Z+8,'seams stay within existing 16m roof span');
      assert((point.x-X)*side>=-.02&&Math.abs(point.x-X)<10.1);
      const roofY=peak-(peak-eave)*Math.abs(point.x-X)/10;
      assert(point.y-roofY>.02&&point.y-roofY<.065,
        'physical rib ends must rest on their corresponding sloped roof face');
    }
  }
  assert(swatches.size>=3,'subtle weathered colour variation without new textures');
  assert.equal(cabin.heightAt(X,Z),cabin.floorY,'roof does not move the walking floor');
  assert.equal(cabin.blockedAt(right,Z),false,'real east entrance remains open');
});
