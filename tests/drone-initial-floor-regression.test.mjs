import test from 'node:test';
import assert from 'node:assert/strict';
import {DroneCrashRig} from '../src/mission/feedback.ts';

test('an impossible initial terrain floor cannot teleport a stopped drone upward',()=>{
 const rig=new DroneCrashRig();
 const spike=rig.step(1/60,4,100);
 assert.equal(spike.y,4);
 assert.equal(spike.settled,false,'invalid floor must not permanently settle the wreck');
 const valid=rig.step(1/60,4,0);
 assert(valid.y<=4&&valid.y>3.9,'valid ground resumes deterministic falling');
 assert.equal(valid.settled,false);
 let last=valid;for(let n=0;n<300&&!last.settled;n++)last=rig.step(1/60,4,0);
 assert.equal(last.settled,true);
 assert(Math.abs(last.y-.25)<1e-8);
});

test('a floor within the body-clearance zone never causes a false upward landing',()=>{
 const rig=new DroneCrashRig();
 const sampled=rig.step(1/60,1,0.9);
 assert.equal(sampled.y,1);
 assert.equal(sampled.settled,false);
 const next=rig.step(1/60,1,0.1);
 assert(next.y<=1);
});

test('invalid frame does not consume the fall clock or contaminate a subsequent valid frame',()=>{
 const rig=new DroneCrashRig(),reference=new DroneCrashRig();
 for(let i=0;i<4;i++)assert.equal(rig.step(1/60,5,99).y,5);
 const first=rig.step(1/60,5,0);
 const direct=reference.step(1/60,5,0);
 assert.deepEqual(first,direct);
});
