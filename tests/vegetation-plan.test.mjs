import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planFlora,FLORA_RULES} from '../src/shiretoko-phase1/vegetation-plan.ts';
const base={height:()=>120,slope:()=>.13,wetness:()=>.1,routeDistance:()=>99,water:()=>false};
test('vegetation positions deterministic and no seam duplicates across adjacent 300m chunks',()=>{
 const a=planFlora(3,5,base,'balanced'),b=planFlora(3,5,base,'balanced'),next=planFlora(4,5,base,'balanced');
 assert.deepEqual(a,b);assert(a.length>100&&a.length<900);
 assert(a.every(x=>x.x>=-300&&x.x<0));assert(next.every(x=>x.x>=0&&x.x<300));
 assert(new Set([...a,...next].map(v=>v.x+','+v.z)).size===a.length+next.length);
});
test('low is a stable subset of balanced and both are bounded',()=>{
 const low=planFlora(3,4,base,'low'),hi=planFlora(3,4,base,'balanced');
 assert(low.length<hi.length);assert(low.length<FLORA_RULES.chunkMetres**2/FLORA_RULES.cellMetres**2);
 const hiKeys=new Set(hi.map(x=>x.x+','+x.z));assert(low.every(x=>hiKeys.has(x.x+','+x.z)));
});
test('route, water, wetland, steep slope and alpine zone shape species distribution',()=>{
 assert.equal(planFlora(3,4,{...base,water:()=>true},'balanced').length,0);
 assert.equal(planFlora(3,4,{...base,routeDistance:()=>2},'balanced').length,0);
 assert(planFlora(3,4,{...base,wetness:()=>.9},'balanced').every(x=>x.kind==='sedge'));
 assert(planFlora(3,4,{...base,slope:()=>1.2},'balanced').every(x=>x.kind==='stone'));
 assert(planFlora(3,4,{...base,height:()=>420},'balanced').every(x=>x.kind==='alpine-shrub'||x.kind==='stone'));
});
test('invalid chunk index or detail does not generate uncontrolled geometry',()=>{
 assert.throws(()=>planFlora(8,0,base,'low'),RangeError);
 assert.throws(()=>planFlora(0,-1,base,'low'),RangeError);
 assert.throws(()=>planFlora(0,0,base,'ultra'),RangeError);
});
