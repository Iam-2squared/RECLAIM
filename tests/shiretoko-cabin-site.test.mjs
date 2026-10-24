import test from 'node:test';
import assert from 'node:assert/strict';
import {CABIN_SITE,cabinSiteClearanceDistance} from '../src/shiretoko-phase1/cabin-site.ts';
import {planFlora} from '../src/shiretoko-phase1/vegetation-plan.ts';

test('cabin and all nine metres of entrance stairs share an exact exclusion zone',()=>{
  assert.deepEqual(CABIN_SITE,{x:-100,z:835,width:18,depth:14,stairsRun:9});
  for(const [x,z] of [[-100,835],[-109,828],[-91,842],[-82,835],[-85,835]])
    assert.equal(cabinSiteClearanceDistance(x,z),0,'foundation/steps '+x+', '+z);
  assert.equal(cabinSiteClearanceDistance(-81,835),1);
  assert.equal(cabinSiteClearanceDistance(-100,850),8);
  assert.equal(cabinSiteClearanceDistance(-111,842),2);
});

test('seeded 300m flora chunk cannot place any instances inside cabin, porch or 7m margin',()=>{
  const base={height:()=>108,slope:()=>0,wetness:()=>0,routeDistance:()=>500,water:()=>false};
  const planned=planFlora(3,6,{...base,structureDistance:cabinSiteClearanceDistance},'balanced');
  assert(planned.length>50,'fixture places surrounding trees');
  assert(planned.every(({x,z})=>cabinSiteClearanceDistance(x,z)>=7),
    'no plant center may intersect actual house/stairs or 7m safety margin');
  const without=planFlora(3,6,base,'balanced');
  assert(without.length>planned.length,'the real site must remove at least one seeded plant');
});
