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
test('dry woodland can grow rare deadfall, but steep, wet and highland ground cannot',()=>{
 const forest=planFlora(3,4,base,'balanced');
 const fallen=forest.filter(x=>x.kind==='deadwood');
 assert(fallen.length>5&&fallen.length<forest.length*.2,'deadfall must be sparse and visible');
 assert(planFlora(3,4,{...base,slope:()=>.4},'balanced').every(x=>x.kind!=='deadwood'));
 assert(planFlora(3,4,{...base,wetness:()=>.5},'balanced').every(x=>x.kind!=='deadwood'));
 assert(planFlora(3,4,{...base,height:()=>420},'balanced').every(x=>x.kind!=='deadwood'));
 assert(planFlora(3,4,{...base,routeDistance:()=>0},'balanced').length===0);
});

test('invalid chunk index or detail does not generate uncontrolled geometry',()=>{
 assert.throws(()=>planFlora(8,0,base,'low'),RangeError);
 assert.throws(()=>planFlora(0,-1,base,'low'),RangeError);
 assert.throws(()=>planFlora(0,0,base,'ultra'),RangeError);
});

test('highland density makes natural 50m shrub-rock patches without changing the valley or safety clearances',()=>{
 const high={...base,height:()=>420};
 const valleyLow=planFlora(3,4,base,'low');
 const hillLow=planFlora(3,4,high,'low');
 const hillBalanced=planFlora(3,4,high,'balanced');
 assert(hillLow.length>valleyLow.length*1.2,'open highland gains meaningful, bounded silhouette density');
 assert(hillLow.length<450,'the 300m highland low-density budget stays sparse');
 assert(hillLow.every(x=>x.kind==='alpine-shrub'||x.kind==='stone'));
 const highKeys=new Set(hillBalanced.map(x=>`${x.x},${x.z}`));
 assert(hillLow.every(x=>highKeys.has(`${x.x},${x.z}`)),'balanced retains every low-density alpine sample');
 const valleyKeys=new Set(valleyLow.map(x=>`${x.x},${x.z}`));
 assert(valleyLow.every(x=>highKeys.has(`${x.x},${x.z}`)),'old lower-altitude samples remain present');
 assert.equal(planFlora(3,4,{...high,routeDistance:()=>7.9},'low').length,0);
 assert.equal(planFlora(3,4,{...high,structureDistance:()=>6.9},'balanced').length,0);
 assert.equal(planFlora(3,4,{...high,water:()=>true},'balanced').length,0);
 assert.equal(planFlora(3,4,{...high,wetness:()=>.9},'low').length,valleyLow.length,
   'open wet highland retains the old sedge density');
 assert.equal(planFlora(3,4,{...high,slope:()=>1.2},'low').length,valleyLow.length,
   'very steep highland keeps only existing sparse stone positions');
 const repeat=planFlora(3,4,high,'low'); assert.deepEqual(repeat,hillLow);
});

test('short meadow grass replaces a bounded portion of existing lowland flora without multiplying instances',()=>{
 const dry=planFlora(3,4,base,'low');
 const dryBalanced=planFlora(3,4,base,'balanced');
 const meadow=dry.filter(p=>p.kind==='meadow-grass');
 assert(meadow.length>0&&meadow.length<dry.length*.25,'open woodland carries sparse low ground grasses');
 const moderate={...base,wetness:()=>.55};
 const bank=planFlora(3,4,moderate,'low');
 assert(bank.some(p=>p.kind==='meadow-grass'),'damp margins also have shorter grass');
 assert(bank.every(p=>p.kind==='sasa'||p.kind==='birch'||p.kind==='meadow-grass'));
 assert.deepEqual(dry.map(({x,z})=>[x,z]),bank.map(({x,z})=>[x,z]),
   'grass and sedge transitions must not create an extra scatter lattice');
 const balancedKeys=new Set(dryBalanced.map(p=>`${p.x},${p.z}`));
 assert(meadow.every(p=>balancedKeys.has(`${p.x},${p.z}`)),'low remains a subset of balanced');
 for(const surface of [{...moderate,water:()=>true},{...moderate,routeDistance:()=>7.9},
     {...moderate,structureDistance:()=>6.9}])
   assert.equal(planFlora(3,4,surface,'balanced').length,0,'existing route/water/site exclusions win');
 assert(planFlora(3,4,{...moderate,wetness:()=>.9},'low').every(p=>p.kind==='sedge'));
 assert(planFlora(3,4,{...moderate,height:()=>420},'low').every(p=>p.kind!=='meadow-grass'));
});
