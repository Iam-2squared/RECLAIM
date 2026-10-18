import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeaponFeedback, DroneCrashRig, FEEDBACK_LIMITS } from '../src/mission/feedback.ts';

test('weapon reaction stays bounded and resets on pause', () => {
 const fx = new WeaponFeedback();
 for (let i = 0; i < 100; i++) fx.fire('sniper');
 assert(fx.pose.rear <= FEEDBACK_LIMITS.maxRear);
 assert(fx.pose.rise <= FEEDBACK_LIMITS.maxRise);
 assert(fx.pose.flash > 0);
 fx.step(.1);
 assert(fx.pose.rear < FEEDBACK_LIMITS.maxRear);
 fx.clear();
 assert.deepEqual(fx.pose, { rear:0, drop:0, rise:0, flash:0 });
});

test('reduced motion decreases recoil without hiding confirmation flash', () => {
 const normal = new WeaponFeedback(false), reduced = new WeaponFeedback(true);
 normal.fire('assault'); reduced.fire('assault');
 assert(reduced.pose.rise < normal.pose.rise);
 assert.equal(reduced.pose.flash, normal.pose.flash);
});

test('stopped drone rig descends toward terrain and settles', () => {
 const rig = new DroneCrashRig();
 let y = 6, frame;
 for(let i=0;i<150;i++) {frame=rig.step(1/60,y,0);y=frame.y; if(frame.settled)break;}
 assert(frame.settled);
 assert(y >= .25);
 assert(frame.bank > 0);
 rig.reset();
 const again=rig.step(1/60,6,0);
 assert(!again.settled);
});