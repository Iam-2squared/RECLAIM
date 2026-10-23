import test from 'node:test';
import assert from 'node:assert/strict';
import {DroneCrashRig} from '../src/mission/feedback.ts';

test('invalid initial terrain elevation cannot teleport a disabled drone upward', () => {
 const rig=new DroneCrashRig();
 const spike=rig.step(1/60,4,100);
 assert.equal(spike.y,4,'invalid initial floor must not lift the wreck');
 assert.equal(spike.settled,false,'invalid sample cannot permanently settle a wreck');
 const valid=rig.step(1/60,4,0);
 assert(valid.y<=4&&valid.y>3.9);
 assert.equal(valid.settled,false);
 let last=valid;
 for(let i=0;i<300&&!last.settled;i++)last=rig.step(1/60,4,0);
 assert(last.settled);
 assert(Math.abs(last.y-.25)<1e-8);
});

test('first-frame floor inside clearance rejects false upward landing and retries', () => {
 const rig=new DroneCrashRig();
 const first=rig.step(1/60,1,.9);
 assert.equal(first.y,1);
 assert.equal(first.settled,false);
 const second=rig.step(1/60,1,.1);
 assert(second.y<=1);
});

test('ordinary low terrain immediately begins falling without an extra frozen frame',()=>{
 const rig=new DroneCrashRig();
 const first=rig.step(1/30,5,0);
 assert(first.y<5,'valid floor must not incur an unnecessary pause');
 assert(!first.settled);
});
