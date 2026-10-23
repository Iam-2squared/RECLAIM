import test from 'node:test';
import assert from 'node:assert/strict';
import { DroneCrashRig } from '../src/mission/feedback.ts';

function run(ticks, initial=9, floor=0) {
  const rig=new DroneCrashRig(); let pose;
  for(const dt of ticks) pose=rig.step(dt,initial,floor);
  return pose;
}

test('crash motion is independent of render FPS for identical elapsed time',()=>{
 const a=run(Array(54).fill(1/120)),b=run(Array(27).fill(1/60)),c=run(Array(9).fill(.05));
 assert.ok(Math.abs(a.y-b.y)<1e-4);
 assert.ok(Math.abs(a.y-c.y)<1e-4);
 assert.ok(Math.abs(a.bank-c.bank)<1e-4);
});
test('delayed frames do not alter the position at the same elapsed time',()=>{
 const a=run(Array(40).fill(.025),16),b=run(Array(10).fill(.1),16);
 assert.ok(Math.abs(a.y-b.y)<1e-4);
 assert.equal(a.settled,b.settled);
});
test('stopped drone settles above terrain and does not penetrate',()=>{
 const rig=new DroneCrashRig(); let pose;
 for(let i=0;i<60;i++){pose=rig.step(.08,2,.7);assert.ok(pose.y>=.95-1e-8);}
 assert.equal(pose.settled,true);assert.equal(pose.stopped,true);assert.ok(pose.bank<=.95);
});
test('raised terrain floor cannot produce a below-ground drone',()=>{
 const rig=new DroneCrashRig();rig.step(.1,12,0);
 assert.ok(rig.step(.1,12,10).y>=10.25);
 for(let i=0;i<80;i++)rig.step(.02,12,10);
 const final=rig.step(.2,12,10);assert.equal(final.settled,true);assert.equal(final.y,10.25);
});
test('reset is isolated from prior enemy crash animation',()=>{
 const rig=new DroneCrashRig();for(let i=0;i<80;i++)rig.step(.1,6,0);
 assert.equal(rig.step(.1,6,0).settled,true);
 rig.reset();const pose=rig.step(.01,20,12);
 assert.equal(pose.settled,false);assert.ok(pose.bank>0&&pose.bank<.1);assert.ok(pose.y>19.99);
});
test('invalid time never poisons crash state',()=>{
 const rig=new DroneCrashRig();const p=rig.step(.1,6,0);
 for(const dt of [-1,0,Infinity,NaN]) {
  const next=rig.step(dt,6,0);assert.equal(next.y,6);assert.equal(next.bank,p.bank);
 }
 assert.ok(Number.isFinite(rig.step(.1,6,0).y));
});
