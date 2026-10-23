import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withNativePrecisionInputGuard as guard} from './native-precision-input-guard.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test('unchanged state observation completes without injected native release', async () => {
  let released=0;
  const value=await guard(()=>{released++},async()=>42,15);
  assert.equal(value,42);assert.equal(released,0);
});
test('native key is released while the renderer-state observer is still outstanding', async () => {
  let released=false,observedWhileHeld=null;
  const value=await guard(async()=>{released=true},async()=>{
    await pause(35);observedWhileHeld=released;return 'actual-state-observed';
  },10);
  assert.equal(value,'actual-state-observed');assert.equal(observedWhileHeld,true);
});
test('preserves the original observation failure',async()=>{
  await assert.rejects(guard(()=>{},async()=>{throw new Error('actual radius not reached')},10),/actual radius not reached/);
});
test('preserves a native key-release failure instead of claiming passing input',async()=>{
  await assert.rejects(guard(async()=>{throw Error('keyup transport failed')},async()=>{await pause(25)},5),/keyup transport failed/);
});
test('preserves both independent failures without retry',async()=>{
  const error=await guard(async()=>{throw Error('keyup failed')},async()=>{await pause(25);throw Error('observe failed')},5).catch(e=>e);
  assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,2);
});
test('rejects invalid or unbounded guard intervals',async()=>{
  for(const v of [0,-1,251,NaN,Infinity]) await assert.rejects(guard(()=>{},()=>{},v),RangeError);
});
