import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WeaponFeedback,DroneCrashRig,FEEDBACK_LIMITS} from '../src/mission/feedback.ts';

test('game-only recoil has visible kick, finite cap and time-based recovery',()=>{
 const r=new WeaponFeedback();r.fire('assault');assert(r.pose.rear>0);assert(r.pose.rise>0);
 for(let i=0;i<100;i++)r.fire('assault');assert(r.pose.rear<=FEEDBACK_LIMITS.maxRear);
 for(let i=0;i<150;i++)r.step(.016);assert.deepEqual(r.pose,{rear:0,drop:0,rise:0,flash:0});
});
test('reduced motion lessens camera-independent weapon kick and reset prevents carrying over on retry',()=>{
 const a=new WeaponFeedback(),b=new WeaponFeedback(true);
 a.fire('sniper');b.fire('sniper');assert(b.pose.rise<a.pose.rise/3);
 b.step(.04);assert.equal(b.pose.flash>0,true);b.step(.1);assert.equal(b.pose.flash,0);
 a.clear();assert.deepEqual(a.pose,{rear:0,drop:0,rise:0,flash:0});
});
test('drone crash descends and settles at shared terrain without penetrating or perpetual rotation',()=>{
 const crash=new DroneCrashRig();let y=2.4,pose;
 for(let i=0;i<100;i++){pose=crash.step(1/60,y,0);assert(pose.y<=y+1e-9);assert(pose.y>=.25);y=pose.y;}
 assert(pose.settled);assert.equal(y,.25);assert(pose.bank>0&&pose.bank<=.95);
 assert.deepEqual(crash.step(1/60,y,0),pose);
 crash.reset();assert.equal(crash.step(1/60,2.4,0).settled,false);
});
test('drone visual fall does not bounce when authoritative drone stays at previous y',()=>{
 const rig=new DroneCrashRig();let last=Infinity,settled=false;
 for(let i=0;i<100;i++){
  const pose=rig.step(1/60,2.4,0);
  assert(pose.y<=last+1e-12,'visual y must never rise back to authoritative height');
  last=pose.y;settled=pose.settled;
 }
 assert(settled);assert.equal(last,.25);
 assert.equal(rig.step(1/60,2.4,0).y,.25);
});
