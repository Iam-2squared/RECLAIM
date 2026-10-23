import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planRegionTiles,tileKey,REGION_TILE_RULES} from '../src/world/region-tiles.ts';

test('low and balanced are bounded deterministic local grids, never entire Japan',()=>{
 const p=planRegionTiles('01',0,0,'low',[]),p2=planRegionTiles('01',0,0,'low',[]),b=planRegionTiles('01',0,0,'balanced',[]);
 assert.deepEqual(p,p2);assert.equal(p.desired.length,9);assert.equal(b.desired.length,25);
 assert.deepEqual(p.load.map(t=>t.key),['01:0:0','01:0:-1']);
 assert.equal(b.load.length,REGION_TILE_RULES.loadLimit);
 assert(p.desired.every(t=>t.code==='01'));
});
test('negative metre coordinates floor consistently, and cross-prefecture swap evicts old cells first',()=>{
 assert.equal(planRegionTiles('13',-.1,-256,'low',[]).desired[0].key,'13:-1:-1');
 const old=planRegionTiles('01',0,0,'balanced',[]).desired.map(t=>t.key);
 const next=planRegionTiles('47',0,0,'low',old);
 assert.equal(next.evict.length,REGION_TILE_RULES.evictLimit);assert.equal(next.load.length,0);
 assert(next.retained.every(k=>k.startsWith('01:')));
});
test('planner accepts completed loads but never marks queued ones completed',()=>{
 const a=planRegionTiles('01',0,0,'low',[]);
 const b=planRegionTiles('01',0,0,'low',a.load.map(t=>t.key));
 assert.equal(b.retained.length,2);assert.equal(b.load.length,2);assert(!b.load.some(t=>b.retained.includes(t.key)));
});
test('unsafe addresses are rejected deterministically',()=>{
 assert.throws(()=>tileKey('99',0,0),RangeError);
 assert.throws(()=>tileKey('01',1.5,0),RangeError);
 assert.throws(()=>planRegionTiles('13',Infinity,0,'low',[]),RangeError);
 assert.throws(()=>planRegionTiles('13',0,0,'ultra',[]),RangeError);
});
