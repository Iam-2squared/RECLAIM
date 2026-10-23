import test from 'node:test';
import assert from 'node:assert/strict';
import {DroneCrashRig} from '../src/mission/feedback.ts';

test('an invalid first terrain floor above a disabled drone cannot teleport it upward',()=>{
 const rig=new DroneCrashRig();
 const spike=rig.step(1/60,4,100);
 assert.equal(spike.y,4,'untrusted initial floor must never lift the wreck');
 assert.equal(spike.settled,false,'never sleep on an erroneous upper terrain sample');
 const valid=rig.step(1/60,4,0);
 assert(valid.y<=4&&valid.y>3.9,'valid terrain resumes the fall');
 assert.equal(valid.settled,false);
 let last=valid;
 for(let n=0;n<300&&!last.settled;n++)last=rig.step(1/60,4,0);
 assert.equal(last.settled,true);
 assert(Math.abs(last.y-.25)<1e-8);
});

test('a sub-clearance first sample does not force a false upward landing',()=>{
 const rig=new DroneCrashRig();
 const sampled=rig.step(1/60,1,0.9);
 assert.equal(sampled.y,1);
 assert.equal(sampled.settled,false);
 const recovered=rig.step(1/60,1,0.1);
 assert(recovered.y<=1);
 assert.equal(recovered.stopped,true);
});

test('invalid first frames preserve a finite resettable pose and do not accrue fall time',()=>{
 const rig=new DroneCrashRig();
 for(let n=0;n<30;n++){
   const p=rig.step(1/60,3,7);
   assert.deepEqual([p.y,p.bank,p.settled],[3,0,false]);
 }
 const started=rig.step(1/60,3,0);
 assert(started.y>2.99&&started.y<=3);
 rig.reset();
 assert.equal(rig.step(0,3,0).y,3);
 const again=rig.step(1/60,3,0);
 assert(Math.abs(again.y-started.y)<1e-9);
});
