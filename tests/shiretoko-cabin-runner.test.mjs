import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';

const X=-100,Z=835;
const terrain=new ShiretokoTerrain();
const cabin=createCliffCabinReview(terrain);

test('cabin runner has fourteen distinct physical low-profile woven pieces in one GPU instance batch',()=>{
  const rug=cabin.group.getObjectByName('cabin / grounded woven floor runner / instanced');
  assert(rug instanceof T.InstancedMesh);
  assert.equal(rug.count,14,'12 cross-weave panels plus two contiguous bound edges');
  assert(rug.instanceColor&&rug.instanceColor.count===rug.count,'woven shades require no new textures');
  assert.equal(rug.geometry.getAttribute('position').count,24);
  assert(rug.boundingSphere&&Number.isFinite(rug.boundingSphere.radius));
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),
    quat=new T.Quaternion(),color=new T.Color(),swatches=new Set();
  for(let i=0;i<rug.count;i++){
    rug.getMatrixAt(i,matrix);
    matrix.decompose(position,quat,scale);
    rug.getColorAt(i,color);swatches.add(color.getHex());
    assert([...position.toArray(),...scale.toArray()].every(Number.isFinite));
    assert(Math.abs(position.x-(X+2))<=1.27);
    assert(Math.abs(position.z-(Z+2.7))<=1.22);
    assert(Math.abs(scale.y-.020)<.00001);
    assert(Math.abs(position.y+scale.y/2-(cabin.floorY-.017))<.00001,
      'weave lower half inlaid in existing timber planks, not a floating mat');
    assert(Math.abs(position.y+scale.y/2-(cabin.floorY+.003))<.021);
    assert.equal(cabin.heightAt(position.x,position.z),cabin.floorY,
      'every textile strip rests on the authoritative existing cabin floor');
    if(i<12){
      assert(Math.abs(scale.x-2.46)<.00001);
      assert(Math.abs(scale.z-.218)<.00001);
    }else{
      assert(Math.abs(scale.x-.13)<.00001);
      assert(Math.abs(scale.z-2.64)<.00001);
    }
  }
  assert(swatches.size>=5,'real woven alternating tones without one mesh per stripe');
});

test('decorative inlaid rug never invents a raised collision floor or obstructs cabin traversal',()=>{
  for(const [x,z] of [[X+2,Z+2.7],[X+2,Z+1.5],[X+3.2,Z+2.7]]){
    assert.equal(cabin.heightAt(x,z),cabin.floorY);
    assert.equal(cabin.blockedAt(x,z),false,'woven textile is not an invisible barrier');
  }
  assert.equal(cabin.blockedAt(X,Z),false,'east-west entry corridor stays open');
  assert.equal(cabin.blockedAt(X+9,Z),false,'actual doorway remains open');
  assert.equal(cabin.blockedAt(X-2,Z+3),true,'original solid table untouched');
  const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(walker.place(X+2,Z+2.7));
  assert.equal(walker.y,cabin.floorY,'player feet use unchanged plank surface');
  assert(walker.place(cabin.entrance.x,cabin.entrance.z));
  walker.yaw=Math.PI/2;
  for(let i=0;i<245;i++)walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(walker.grounded);
  assert(Math.abs(walker.y-cabin.floorY)<.00001);
});
