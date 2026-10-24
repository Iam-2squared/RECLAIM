import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForDriverWalkObservation} from './driver-walk-observer.mjs';
import {observeActualWalkSegment} from './walk-progress-probe.mjs';
const observation=()=>({target:{x:0,z:20},radius:1.3,stopRange:8,firstElapsed:null,
 simSeconds:.4,initialTargetDistance:20,progressMetres:.6});
const sample=(z,elapsed=0,extra={})=>({paused:false,player:{x:0,z},elapsed,...extra});
const options={timeout:200,polling:1};
function pageOf(samples){let calls=0;return{get calls(){return calls;},async evaluate(fn){
 assert.match(fn.toString(),/snapshot\(\)\.mission/);
 assert.doesNotMatch(fn.toString(),/dispatchEvent|\.step\(|keyboard|setTimeout|requestAnimationFrame/);
 return samples[Math.min(calls++,samples.length-1)];}};}

test('driver observes real progress with no in-document waitForFunction or fabricated input',async()=>{
 const page=pageOf([sample(0),sample(.3,.1),sample(.7,.2)]);
 assert.equal(await waitForDriverWalkObservation(page,observation(),options),'progress');
 assert.equal(page.calls,3);
});
test('same precise arrival and near predicates retain precedence',async()=>{
 for(const [z,reason]of[[19,'reached'],[12.1,'near']])
  assert.equal(await waitForDriverWalkObservation(pageOf([sample(z)]),observation(),options),reason);
});
test('precision pulse retains a stable actual elapsed anchor across protocol reads',async()=>{
 const o={...observation(),stopRange:null,progressMetres:null,simSeconds:.1};
 assert.equal(await waitForDriverWalkObservation(pageOf([sample(0,10),sample(0,10.05),sample(0,10.11)]),o,options),'elapsed');
 assert.equal(o.firstElapsed,null,'does not mutate caller or game state');
});
test('pure classifier uses provided live snapshot without accessing global window',()=>{
 assert.equal(observeActualWalkSegment(observation(),sample(.7)),'progress');
});
test('pause and disappearing Mission never become success or target arrival',async()=>{
 for(const s of [null,sample(0,0,{paused:true})])
  assert.equal(await waitForDriverWalkObservation(pageOf([s]),observation(),options),'paused');
});
test('no progress still fails within its original deadline and schedules no new reads',async()=>{
 const page=pageOf([sample(0)]);
 await assert.rejects(waitForDriverWalkObservation(page,observation(),{timeout:20,polling:2}),/exceeded 20ms/);
 const calls=page.calls;await new Promise(r=>setTimeout(r,10));assert.equal(page.calls,calls);
});
test('wrong-way motion never passes a forward-progress predicate',async()=>{
 const page=pageOf([sample(0),sample(-2),sample(-4)]);
 await assert.rejects(waitForDriverWalkObservation(page,observation(),{timeout:15,polling:1}),/exceeded 15ms/);
});
test('original protocol read error propagates once without retry',async()=>{
 const original=new Error('page disconnected');let calls=0;
 await assert.rejects(waitForDriverWalkObservation({async evaluate(){calls++;throw original;}},observation(),options),e=>e===original);
 assert.equal(calls,1);
});
test('a late protocol response after deadline does not resume polling',async()=>{
 let release,calls=0;
 const page={evaluate(){calls++;return new Promise(r=>{release=r;});}};
 await assert.rejects(waitForDriverWalkObservation(page,observation(),{timeout:10,polling:1}),/exceeded 10ms/);
 release(sample(0));await new Promise(r=>setTimeout(r,10));assert.equal(calls,1);
});
test('bounded sampling never overlaps native protocol reads',async()=>{
 let inFlight=0,peak=0,calls=0;
 const page={async evaluate(){inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,2));inFlight--;return sample(++calls*.3);}};
 assert.equal(await waitForDriverWalkObservation(page,observation(),options),'progress');assert.equal(peak,1);
});
test('invalid and inflated time budgets are rejected before reading the page',async()=>{
 for(const timeout of [0,-1,NaN,Infinity,5001])
  await assert.rejects(waitForDriverWalkObservation({},observation(),{timeout,polling:75}),RangeError);
});
