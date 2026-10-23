import test from 'node:test';
import assert from 'node:assert/strict';
import {WALK_OBSERVER_POLL_MS,walkObserverOptions} from './walk-observer-options.mjs';
test('read-only walk observation uses a timer independent of rendering RAF',()=>{
  assert.equal(WALK_OBSERVER_POLL_MS,75);
  assert.deepEqual(walkObserverOptions(50_000),{polling:75,timeout:5000});
});
test('existing five-second segment limit never expands',()=>{
  for (const ms of [1,25,250,1200,5000,5001,50000]) {
    const opts=walkObserverOptions(ms);
    assert.equal(opts.timeout,Math.min(ms,5000));
    assert(opts.timeout<=5000);
  }
});
test('invalid budgets are rejected rather than misreporting a walk',()=>{
  for (const v of [-1,0,NaN,Infinity])assert.throws(()=>walkObserverOptions(v),RangeError);
});
