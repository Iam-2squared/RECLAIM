import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainFrameDemand } from '../src/shiretoko-phase1/frame-demand.ts';
const pose=()=>({position:{x:1,y:109.8,z:850},quaternion:{x:0,y:0,z:0,w:1},fov:66,aspect:1.6});
test('first frame is required and identical frozen frames do not resubmit',()=>{
  const gate=new TerrainFrameDemand(),c=pose();assert.equal(gate.changed(c),true);
  gate.submitted(c);for(let i=0;i<600;i++)assert.equal(gate.changed(c),false);
});
test('every translation, rotation and projection component invalidates the last drawn frame',()=>{
  for(const key of ['x','y','z']){const gate=new TerrainFrameDemand(),c=pose();gate.submitted(c);c.position[key]+=.01;assert.equal(gate.changed(c),true);gate.submitted(c);assert.equal(gate.changed(c),false);}
  for(const key of ['x','y','z','w']){const gate=new TerrainFrameDemand(),c=pose();gate.submitted(c);c.quaternion[key]+=.01;assert.equal(gate.changed(c),true);}
  for(const key of ['fov','aspect']){const gate=new TerrainFrameDemand(),c=pose();gate.submitted(c);c[key]+=.01;assert.equal(gate.changed(c),true);}
});
test('physics motion always produces new frames even with frozen water',()=>{
  const gate=new TerrainFrameDemand(),c=pose();gate.submitted(c);
  for(let i=0;i<60;i++){c.position.z-=1/60;c.position.y=109.8+Math.sin(i/60*Math.PI);assert.equal(gate.changed(c),true);gate.submitted(c);}
});
test('sampling does not mutate or acknowledge a camera before its actual draw',()=>{
  const gate=new TerrainFrameDemand(),c=pose(),before=structuredClone(c);
  assert(gate.changed(c));assert(gate.changed(c));assert.deepEqual(c,before);
  gate.submitted(c);c.position.x=4;assert(gate.changed(c));assert(gate.changed(c));
});
