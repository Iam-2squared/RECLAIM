import test from 'node:test';
import assert from 'node:assert/strict';
import { planFlora, FLORA_RULES } from '../src/shiretoko-phase1/vegetation-plan.ts';

const dryPlain=Object.freeze({
  height:()=>100,
  slope:()=>.11,
  wetness:()=>.15,
  routeDistance:()=>50,
  water:()=>false,
});

function census(quality){
  const instances=[],tiles=new Map();
  for(let z=0;z<8;z++)for(let x=0;x<8;x++){
    const chunk=planFlora(x,z,dryPlain,quality);
    assert(Object.isFrozen(chunk),'chunk plans are read-only');
    for(const p of chunk){
      assert.equal(p.y,100);
      const tx=Math.floor((p.x+FLORA_RULES.extent)/90);
      const tz=Math.floor((p.z+FLORA_RULES.extent)/90);
      const key=`${tx}:${tz}`;
      tiles.set(key,(tiles.get(key)||0)+1);
      instances.push(p);
    }
  }
  return {instances,tiles};
}

test('smooth deterministic 90m woodland stands yield real groves and glades without raising global budgets',()=>{
  const low=census('low'),balanced=census('balanced');
  assert(low.instances.length>8_000&&low.instances.length<20_000,
    '2.4km plain low mode stays bounded even before water/path exclusions');
  assert(balanced.instances.length>low.instances.length&&balanced.instances.length<58_000);
  const lowPositions=new Set(low.instances.map(p=>`${p.x}:${p.z}`));
  const balancedPositions=new Set(balanced.instances.map(p=>`${p.x}:${p.z}`));
  assert.equal(lowPositions.size,low.instances.length,'no chunk-boundary duplicates');
  for(const key of lowPositions)assert(balancedPositions.has(key),
    'low quality must be a strict spatial subset of balanced');
  // Compare inhabited 90m tiles: patchy density, not a repeated constant
  // percentage in every cell. This is measured on a uniform surface so
  // terrain exclusions cannot disguise missing clustering.
  const values=[...low.tiles.values()].sort((a,b)=>a-b);
  assert(values.at(-1)>values[Math.floor(values.length*.1)]*1.65,
    'near-view woodland requires genuine groves separated by lower-density glades');
  assert.deepEqual(planFlora(2,3,dryPlain,'low'),planFlora(2,3,dryPlain,'low'),
    'repeatable seed and no stateful cross-chunk RNG');
});

test('wetlands, paths, water, buildings and out-of-range chunks retain safety gates',()=>{
  const water={...dryPlain,water:()=>true};
  const narrowTrail={...dryPlain,routeDistance:()=>7.9};
  const occupiedSite={...dryPlain,structureDistance:()=>6.9};
  for(const surface of [water,narrowTrail,occupiedSite])
    assert.equal(planFlora(4,3,surface,'balanced').length,0);
  assert.throws(()=>planFlora(8,0,dryPlain,'low'),RangeError);
  assert.throws(()=>planFlora(0,0,dryPlain,'invalid'),RangeError);
});
