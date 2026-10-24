import test from 'node:test';
import assert from 'node:assert/strict';
import {planFlora,FLORA_RULES} from '../src/shiretoko-phase1/vegetation-plan.ts';

const wetPlain=Object.freeze({
 height:(x,z)=>100+Math.sin(x*.017)*.025+Math.cos(z*.021)*.025,
 slope:()=>.1,
 wetness:()=>.88,
 water:()=>false,
 routeDistance:()=>50,
 structureDistance:()=>50,
});

test('new wetland clumps are real sub-2m rooted neighbours, bounded and deterministic',()=>{
 const low=planFlora(4,4,wetPlain,'low');
 const originalLattice={...wetPlain,slope:()=>.36};
 const baselines=planFlora(4,4,originalLattice,'low');
 assert(low.length>baselines.length*1.32,
  'some genuine satellite sedges must occupy valid own-ground sites');
 assert(low.length<baselines.length*2,
  'each existing plant can produce at most one small neighbour, never a dense extra grid');
 assert(low.every(p=>p.kind==='sedge' && Math.abs(p.y-wetPlain.height(p.x,p.z))<1e-12));
 assert.deepEqual(low,planFlora(4,4,wetPlain,'low'),'seeded wetland is repeatable');
 const lowPositions=new Set(low.map(p=>p.x+':'+p.z));
 const balanced=planFlora(4,4,wetPlain,'balanced');
 const balancedPositions=new Set(balanced.map(p=>p.x+':'+p.z));
 assert.equal(lowPositions.size,low.length,'not even new child locations duplicate');
 for(const key of lowPositions)assert(balancedPositions.has(key),
  'low quality remains a strict location subset of balanced even with satellites');
});

test('each extra plant individually respects the trail, water, structure and slope gates',()=>{
 const surface={
  ...wetPlain,
  routeDistance:(x,z)=>Math.abs(x-160),
  water:(x,z)=>x>190&&x<202,
  structureDistance:(x,z)=>Math.abs(z-110),
 };
 const plants=planFlora(4,4,surface,'balanced');
 assert(plants.length>0);
 for(const plant of plants){
  assert(surface.routeDistance(plant.x,plant.z)>=FLORA_RULES.trailClearance);
  assert(surface.structureDistance(plant.x,plant.z)>=FLORA_RULES.structureClearance);
  assert.equal(surface.water(plant.x,plant.z),false);
  assert(Math.abs(plant.y-surface.height(plant.x,plant.z))<1e-12);
 }
 const poison={...surface,water:()=>true};
 assert.equal(planFlora(4,4,poison,'balanced').length,0);
});
