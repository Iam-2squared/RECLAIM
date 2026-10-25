import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';

// Verify actual GPU matrices and geometry, not a comment or decorative CSS.
test('both blank cabin gables gain roof-connected 3D cedar trusses in one bounded batch',()=>{
  const terrain=new ShiretokoTerrain();
  const cabin=createCliffCabinReview(terrain);
  const mesh=cabin.group.getObjectByName(
    'cabin / both roof-connected cedar gable structural trusses / instanced');
  assert(mesh instanceof T.InstancedMesh);
  assert.equal(mesh.count,12,'six true structural timbers per exterior gable');
  assert.equal(mesh.geometry.getAttribute('position').count,24);
  assert(mesh.instanceColor && mesh.instanceColor.count===mesh.count);
  assert(mesh.boundingSphere && Number.isFinite(mesh.boundingSphere.radius));
  const X=-100,Z=835,left=X-9,right=X+9,back=Z-7,front=Z+7;
  const wallTop=cabin.floorY+3.25,peak=wallTop+2.3;
  const m=new T.Matrix4(),centre=new T.Vector3(),rot=new T.Quaternion(),
    scale=new T.Vector3(),color=new T.Color(),swatches=new Set();
  for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,m);m.decompose(centre,rot,scale);
    mesh.getColorAt(i,color);swatches.add(color.getHex());
    assert([...centre.toArray(),...scale.toArray()].every(Number.isFinite));
    assert(Math.abs(centre.z-(i<6?back-.13:front+.13))<1e-6,
      'rafters sit on the actual original north/south triangular wall plane');
    assert(scale.x>.5&&scale.x<19&&scale.y>.1&&scale.y<.21&&scale.z<.2);
    const ends=[-.5,.5].map(x=>new T.Vector3(x,0,0).applyMatrix4(m));
    for(const pt of ends){
      assert(pt.y>wallTop-.06&&pt.y<peak+.13,
        'timber never hangs into the 1.68m walker or transparent windows');
      assert(pt.x>=left-.1&&pt.x<=right+.1,'frame stays in original 18m facade');
    }
    if(i%6<2){
      for(const pt of ends){
        const triangularY=wallTop+(peak-wallTop)*(1-Math.abs(pt.x-X)/9);
        assert(Math.abs(pt.y-triangularY-.06)<.0001,
          'roof rafters follow the original ACTUAL pitched gable line');
      }
    }
    if(i%6===2)
      assert(Math.abs(ends[0].y-(wallTop+.14))<.0001 &&
        Math.abs(ends[1].y-(wallTop+.14))<.0001,
        'eighteen-metre horizontal timber joins the sloping rafters');
  }
  assert(swatches.size>=4,'cedar uses actual per-instance colour variation');
  assert.equal(cabin.group.children.filter(x=>x.name.endsWith('pitched roof')).length,2,
    'the original two true roof-face meshes remain unchanged');
  assert.equal(cabin.group.children.filter(x=>x.name==='cabin / glazed window').length,2);
  const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(walker.place(cabin.entrance.x,835),'open original stair approach');
  walker.yaw=Math.PI/2;
  for(let i=0;i<245;i++)walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(walker.x<right-3&&walker.grounded,
    'real 60Hz walker still enters room; frame introduces no invisible collision');
  assert.equal(cabin.heightAt(X,Z),cabin.floorY,
    'visible floor and physical walking contract have not changed');
});
