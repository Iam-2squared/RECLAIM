import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {createCliffCabinReview} from '../src/shiretoko-phase1/cabin.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';

const X=-100,Z=835;
const terrain=new ShiretokoTerrain();
const cabin=createCliffCabinReview(terrain);

test('sixteen genuine coloured book volumes share one render batch and rest on the real wooden shelf',()=>{
  const shelf=cabin.group.getObjectByName('cabin / shelf');
  const books=cabin.group.getObjectByName('cabin / grounded coloured shelf books / instanced');
  assert(shelf instanceof T.Mesh);
  assert(books instanceof T.InstancedMesh);
  assert.equal(books.count,16);
  assert.equal(books.geometry.getAttribute('position').count,24,'one reusable box');
  assert(books.instanceColor && books.instanceColor.count===books.count);
  assert(books.boundingSphere && Number.isFinite(books.boundingSphere.radius));
  const shelfY=shelf.position.y+shelf.geometry.parameters.height/2;
  const colors=new Set(),matrix=new T.Matrix4(),color=new T.Color();
  for(let i=0;i<books.count;i++){
    books.getMatrixAt(i,matrix);
    books.getColorAt(i,color);colors.add(color.getHex());
    let minY=Infinity;
    for(const sx of [-.5,.5])for(const sy of [-.5,.5])for(const sz of [-.5,.5]){
      const point=new T.Vector3(sx,sy,sz).applyMatrix4(matrix);
      minY=Math.min(minY,point.y);
      assert(point.x>X+1.5 && point.x<X+4.5,'volume stays on the supported 3m shelf');
      assert(point.z>Z-5.5 && point.z<Z-4.8,'volume stays inside shelf depth');
      assert(point.y>cabin.floorY+1.3 && point.y<cabin.floorY+2.05,
        'volumes remain below roof and above floor');
    }
    assert(Math.abs(minY-shelfY)<.008,'real book corners rest on shelf, not float');
  }
  assert(colors.size>=4,'a varied collection, not one repeated flat colour');
});

test('decorative shelves preserve exact floor, old collisions, entry and real 60 Hz walking',()=>{
  assert.equal(cabin.heightAt(X,Z),cabin.floorY);
  assert.equal(cabin.blockedAt(X,Z),false);
  assert.equal(cabin.blockedAt(X-2,Z+3),true,'table still solid');
  assert.equal(cabin.blockedAt(X-5.3,Z-3.4),true,'bunk still solid');
  assert.equal(cabin.blockedAt(X+9,Z),false,'east doorway stays open');
  const walker=new TerrainWalker(terrain,cabin.heightAt,cabin.blockedAt);
  assert(walker.place(cabin.entrance.x,Z));
  walker.yaw=Math.PI/2;
  for(let i=0;i<245;i++)walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
  assert(walker.x<X+6 && walker.x>X-9 && walker.grounded,
    'native walker enters without an invented shelf collider');
  assert(Math.abs(walker.y-cabin.floorY)<1e-5);
});
