import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';

const X=-100,Z=835;
const terrain=new ShiretokoTerrain();
const cabin=createCliffCabinReview(terrain);

test('two authentic grounded timber chairs are geometry, not uncollidable decals',()=>{
  const chairs=cabin.group.getObjectByName('cabin / two grounded table chairs / instanced');
  assert(chairs instanceof T.InstancedMesh);
  assert.equal(chairs.count,18,'two seats, eight legs, four uprights and four back slats');
  assert.equal(chairs.geometry.getAttribute('position').count,24,'one reusable box geometry');
  assert(chairs.boundingSphere&&Number.isFinite(chairs.boundingSphere.radius));
  assert(chairs.instanceColor&&chairs.instanceColor.count===chairs.count);
  const matrix=new T.Matrix4(),pos=new T.Vector3(),scale=new T.Vector3(),
    quat=new T.Quaternion(),colour=new T.Color(),swatches=new Set();
  for(let i=0;i<chairs.count;i++){
    chairs.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);
    chairs.getColorAt(i,colour);swatches.add(colour.getHex());
    assert([...pos.toArray(),...scale.toArray()].every(Number.isFinite));
    assert(Math.abs(pos.x-(X-2))<.5,'all wood stays beside the old table');
    const cz=i<9?Z+1.78:Z+4.22;
    assert(Math.abs(pos.z-cz)<.39,'all chair parts stay within each collision footprint');
    const relative=i%9;
    if(relative>=1&&relative<=4){
      assert(Math.abs(pos.y-scale.y/2-cabin.floorY)<.0001,
        'all eight visible leg feet touch the SAME walking floor');
      assert.equal(scale.y,.45);
    }
    if(relative===0){
      assert(Math.abs(pos.y-cabin.floorY-.52)<.0001);
      assert(scale.x===.8&&scale.z===.72,'seat covers its physical collision footprint');
    }
    if(relative>=5){
      assert(pos.y>cabin.floorY+.9 && pos.y<cabin.floorY+1.5,
        'visible chair backs connect to their grounded seats without a high floating barrier');
    }
  }
  assert(swatches.size>=4,'timber has warm but bounded per-part colour variation');
});

test('chair colliders match both visible footprints and preserve central 60Hz traversal',()=>{
  for(const cz of [Z+1.78,Z+4.22]){
    assert.equal(cabin.heightAt(X-2,cz),cabin.floorY);
    assert.equal(cabin.blockedAt(X-2,cz),true,'chairs are not walk-through furniture');
    assert.equal(cabin.blockedAt(X-2,cz+.50),true,'player margin protects back slats');
    const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
    assert.equal(walker.place(X-2,cz),false,'native placement rejects chair footprint');
  }
  assert.equal(cabin.blockedAt(X,Z),false,'cabin central corridor is unchanged');
  assert.equal(cabin.blockedAt(X-2,Z),false,'table chairs do not block main traverse axis');
  assert.equal(cabin.blockedAt(X+9,Z),false,'genuine doorway remains open');
  const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(walker.place(cabin.entrance.x,cabin.entrance.z));
  walker.yaw=Math.PI/2;
  for(let i=0;i<245;i++)walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(walker.x<X+6&&walker.x>X-9&&walker.grounded);
  assert(Math.abs(walker.y-cabin.floorY)<1e-5,'walked ground stays matched to visible floor');
});
