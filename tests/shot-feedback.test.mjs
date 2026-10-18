import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOT_FEEDBACK, ShotFeedback} from '../src/mission/shot-feedback.ts';

test('each game weapon produces bounded, differing recoil feedback', () => {
  const kicks = Object.keys(SHOT_FEEDBACK).map(id => {
    const f = new ShotFeedback(); f.fire(id);
    assert(f.flashSeconds > 0 && f.tracerSeconds > f.flashSeconds);
    return f.pitch;
  });
  assert.equal(new Set(kicks).size, 3);
});

test('rapid firing cannot accumulate unbounded camera or model offsets', () => {
  const f = new ShotFeedback();
  for (let i = 0; i < 5000; i++) f.fire('sniper');
  assert(f.pitch <= 0.035);
  assert(f.travel <= 0.07);
  const start = f.pitch;
  f.step(0.1);
  assert(f.pitch < start);
});

test('feedback decays with time; invalid steps do not create NaN', () => {
  const f = new ShotFeedback(); f.fire('assault');
  f.step(NaN); f.step(-1); f.step(Infinity);
  assert.equal(f.pitch, 0.01);
  for (let i=0; i<120; i++) f.step(1/60);
  assert.equal(f.pitch, 0);
  assert.equal(f.travel, 0);
  assert.equal(f.flashSeconds, 0);
  assert.equal(f.tracerSeconds, 0);
});

test('pause or leave resets transients immediately', () => {
  const f = new ShotFeedback(); f.fire('rifle'); f.reset();
  assert.deepEqual([f.pitch, f.travel, f.flashSeconds, f.tracerSeconds], [0, 0, 0, 0]);
});
