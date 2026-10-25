import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';

const terrain=new ShiretokoTerrain();
const cabin=createCliffCabinReview(terrain);
const X=-100,Z=835,right=X+9;

test('entrance canopy is eight connected true 3D timber and pitched-metal volumes in one GPU draw group',()=>{
  const canopy=cabin.group.getObjectByName('cabin / grounded pitched entrance canopy / instanced');
  assert(canopy instanceof T.InstancedMesh);
  assert.equal(canopy.count,8,'roof, fascia, two rafters, two posts, two diagonal braces');
  assert.equal(canopy.geometry.getAttribute('position').count,24);
  assert(canopy.instanceColor&&canopy.instanceColor.count===canopy.count);
  assert(canopy.boundingSphere&&canopy.boundingSphere.radius>0);
  const matrix=new T.Matrix4(),pos=new T.Vector3(),q=new T.Quaternion(),
    scale=new T.Vector3(),swatches=new Set();
  for(let i=0;i<canopy.count;i++){
    canopy.getMatrixAt(i,matrix);matrix.decompose(pos,q,scale);
    assert([...pos.toArray(),...scale.toArray()].every(Number.isFinite));
    assert(Math.min(...scale.toArray())>.09,'every piece is real positive 3D volume');
    const c=new T.Color();canopy.getColorAt(i,c);swatches.add(c.getHex());
    if(i===0){
      assert(Math.abs(pos.x-(right+1.22))<.02);
      assert(Math.abs(pos.y-(cabin.floorY+2.95))<.02);
      assert(scale.z>4.8,'roof visibly spans both original opaque doorway piers');
      assert(Math.abs(q.z)>.05,'awning really slopes towards rain runoff');
    }
    if(i===2||i===3){
      assert(scale.x>2.8,'long rafters overlap the real roof at both ends');
      assert(Math.abs(pos.z-Z)>2.1,'rafter sides leave walking axis clear');
    }
    if(i===4||i===5){
      const side=i===4?-1:1;
      const ground=terrain.heightAt(pos.x,pos.z);
      assert(Math.abs(pos.x-(right+2.35))<.0001);
      assert(Math.abs(pos.z-(Z+side*2.23))<.0001);
      assert(Math.abs(pos.y-scale.y/2-ground+.02)<.0001,
        'both support feet overlap the authoritative 5m terrain by 2cm');
      const roofAt=cabin.floorY+3.18 +(-.46)*(pos.x-(right-.22))/2.88;
      assert(Math.abs(pos.y+scale.y/2-(roofAt-.045))<.0002,
        'posts physically terminate inside pitched canopy roof');
      assert(!terrain.inWater(pos.x,pos.z));
      assert.equal(cabin.blockedAt(pos.x,pos.z),true,
        'real grounded timber columns are not intangible geometry');
      assert.equal(cabin.heightAt(pos.x,pos.z),null,
        'roof must NOT introduce a fake walking level above the ground');
    }
  }
  assert(swatches.size>=3,'charcoal roofing and warm timber share per-instance colours');
});

test('awning brackets and collision never obstruct the approved 2.3m stair or enterable east doorway',()=>{
  for(const x of [right,right+.5,right+1.7,right+2.35,right+4.8,right+8.2]){
    assert.equal(cabin.blockedAt(x,Z),false,'full centerline from stair to interior open');
  }
  for(const side of [-1,1]){
    assert.equal(cabin.blockedAt(right+2.35,Z+side*2.23),true);
    assert.equal(cabin.blockedAt(right+2.35,Z+side*1.0),false,
      'canopy column must not invade either edge of the stair walking width');
  }
  const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(walker.place(cabin.entrance.x,cabin.entrance.z));
  walker.yaw=Math.PI/2;
  for(let i=0;i<245;i++)
    walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(walker.x<right-3&&walker.x>X-9);
  assert(walker.grounded);
  assert(Math.abs(walker.y-cabin.floorY)<1e-5);
});
