import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShiretokoTerrain } from '../src/shiretoko-phase1/terrain.ts';
import { createCliffCabinReview } from '../src/shiretoko-phase1/cabin.ts';

test('sixteen real cedar interior rafters, ties and ridge meet the pitched roof with a clear enterable room',()=>{
  const terrain=new ShiretokoTerrain();
  const cabin=createCliffCabinReview(terrain);
  const beams=cabin.group.getObjectByName('cabin / interior roof-contact cedar rafters and ties / instanced');
  assert(beams instanceof T.InstancedMesh,'interior timber must render as real 3D, not an overlay');
  assert.equal(beams.count,16,'five rafter pairs, five ties and one ridge beam');
  assert.equal(beams.geometry.getAttribute('position').count,24,'shared low-cost 3D box');
  assert(beams.instanceColor?.count===16,'weathered timber shades share one instanced material');
  assert(beams.boundingSphere?.radius>6,'real scene bounds support culling');
  const X=-100,Z=835,WIDTH=18,DEPTH=14;
  const floor=cabin.floorY,wallTop=floor+3.25,eave=wallTop+.16,peak=wallTop+2.3;
  const roofAt=x=>peak-(peak-eave)*Math.abs(x-X)/(WIDTH/2+1);
  const matrix=new T.Matrix4();
  for(let i=0;i<5;i++){
    const targetZ=Z-DEPTH/2+.95+(DEPTH-1.9)*i/4;
    for(let side=0;side<2;side++){
      beams.getMatrixAt(i*3+side,matrix);
      const a=new T.Vector3(-.5,0,0).applyMatrix4(matrix);
      const b=new T.Vector3(.5,0,0).applyMatrix4(matrix);
      for(const p of [a,b]){
        assert(Math.abs(p.z-targetZ)<.0003,'rafter follows its own cross-frame');
        assert(Math.abs(roofAt(p.x)-p.y-.10)<.0003,
          'sloped rafter centreline follows actual roof with 10cm attachment embed');
        assert(p.y>floor+3.2,'overhead timber stays clear of walker head');
      }
      assert(Math.abs(a.x-b.x)>8,'rafters span actual roof instead of short disconnected accents');
    }
    beams.getMatrixAt(i*3+2,matrix);
    const left=new T.Vector3(-.5,0,0).applyMatrix4(matrix);
    const right=new T.Vector3(.5,0,0).applyMatrix4(matrix);
    assert(Math.abs(left.x-(X-WIDTH/2+.25))<.0003);
    assert(Math.abs(right.x-(X+WIDTH/2-.25))<.0003);
    assert(Math.abs(left.y-(wallTop+.22))<.0003);
    assert(Math.abs(right.z-targetZ)<.0003);
    assert(left.y>floor+3.2,'real ties are above the playable eye height');
  }
  beams.getMatrixAt(15,matrix);
  const ridgeA=new T.Vector3(-.5,0,0).applyMatrix4(matrix);
  const ridgeB=new T.Vector3(.5,0,0).applyMatrix4(matrix);
  assert(Math.abs(ridgeA.x-X)<.0003&&Math.abs(ridgeB.x-X)<.0003);
  assert(Math.abs(Math.abs(ridgeB.z-ridgeA.z)-(DEPTH-.6))<.0003);
  assert(Math.abs(ridgeA.y-(peak-.11))<.0003,
    'long ridge contacts the existing true apex');
  assert.equal(cabin.heightAt(X,Z),floor,'no new floor or coordinate remapping');
  assert.equal(cabin.blockedAt(X,Z),false,'central room remains open');
  assert.equal(cabin.blockedAt(X+WIDTH/2,Z),false,'east entrance remains open');
  assert.equal(cabin.blockedAt(X-2,Z+3),true,'existing table collision is retained');
});
