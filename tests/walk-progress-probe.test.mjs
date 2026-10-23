import test from 'node:test';
import assert from 'node:assert/strict';
import {observeActualWalkSegment} from './walk-progress-probe.mjs';
function scenario({x=0,z=0,elapsed=1,paused=false,available=true}={}) {
  let state=available?{player:{x,z},elapsed,paused}:null;
  globalThis.window={__RECLAIM__:{snapshot:()=>({mission:state})}};
  return {set:(changes)=>{state=state&&{...state,...changes,player:{...state.player,...changes.player}}}};
}
function opts(overrides={}) {return {target:{x:0,z:20},radius:1.3,stopRange:8,firstElapsed:null,simSeconds:0.4,initialTargetDistance:20,progressMetres:.6,...overrides};}
test('only genuine progress TOWARD far target triggers another bounded read',()=>{
 const s=scenario();const o=opts();assert.equal(observeActualWalkSegment(o),false);s.set({player:{z:.59},elapsed:1.03});assert.equal(observeActualWalkSegment(o),false);s.set({player:{z:.65},elapsed:1.07});assert.equal(observeActualWalkSegment(o),'progress');
});
test('wrong-way movement never impersonates target progress',()=>{
 const s=scenario();const o=opts();assert.equal(observeActualWalkSegment(o),false);s.set({player:{z:-5},elapsed:1.1});assert.equal(observeActualWalkSegment(o),false);s.set({elapsed:1.41});assert.equal(observeActualWalkSegment(o),'elapsed');
});
test('precision approach requires original simulated-time or exact arrival predicate',()=>{
 const s=scenario({z:17});const o=opts({initialTargetDistance:3,stopRange:null,progressMetres:null,simSeconds:.12,radius:1.3});assert.equal(observeActualWalkSegment(o),false);s.set({player:{z:17.4},elapsed:1.03});assert.equal(observeActualWalkSegment(o),false);s.set({elapsed:1.12});assert.equal(observeActualWalkSegment(o),'elapsed');s.set({player:{z:18.71},elapsed:1.13});assert.equal(observeActualWalkSegment(o),'reached');
});
test('near-range stop retains precedence over progress and unchanged arrival radius',()=>{
 const s=scenario({z:12.01});const o=opts();assert.equal(observeActualWalkSegment(o),'near');s.set({player:{z:18.8}});assert.equal(observeActualWalkSegment(o),'reached');
});
test('walk-range progress is independently bounded to actual target advance',()=>{
 const s=scenario({z:14});const o=opts({initialTargetDistance:6,progressMetres:.25,stopRange:3});assert.equal(observeActualWalkSegment(o),false);s.set({player:{z:14.3},elapsed:1.04});assert.equal(observeActualWalkSegment(o),'progress');
});
test('pause and disappearing mission are surfaced without fake movement',()=>{
 scenario({paused:true});assert.equal(observeActualWalkSegment(opts()),'paused');scenario({available:false});assert.equal(observeActualWalkSegment(opts()),'paused');
});
