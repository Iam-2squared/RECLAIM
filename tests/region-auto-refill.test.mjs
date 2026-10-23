import test from 'node:test';
import assert from 'node:assert/strict';
import {RegionTileStream} from '../src/world/region-stream.ts';
import {planRegionTiles} from '../src/world/region-tiles.ts';

const flush=async()=>{for(let i=0;i<800;i++)await Promise.resolve();};
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('opt-in automatic refill completes the bounded local neighborhood without new focus input',async()=>{
  const stream=new RegionTileStream(async coord=>({key:coord.key}),()=>{}, {autoRefill:true});
  const report=stream.focus('01',0,0,'low');
  assert.equal(report.started.length,2,'physical concurrency stays at two');
  assert.equal(report.inFlight,2);
  await flush();
  assert.equal(stream.loadedKeys.length,planRegionTiles('01',0,0,'low',[]).desired.length);
  assert.equal(stream.pendingKeys.length,0);
  assert.equal(stream.outstandingLoads,0);
  assert.equal(stream.refillFailure,null);
  stream.close();
});

test('an aborted old region frees capacity for the NEW focus when the old loader settles',async()=>{
  const old=gate(),events=[];
  const stream=new RegionTileStream(async (coord,signal)=>{
    events.push({key:coord.key,signal});
    if(coord.code==='01')await old.promise;
    return {key:coord.key};
  },()=>{}, {autoRefill:true});
  stream.focus('01',0,0,'low');await flush();
  assert.equal(stream.outstandingLoads,2);
  const switched=stream.focus('02',0,0,'low');
  assert.equal(switched.started.length,0,'obsolete loads retain real physical slots');
  assert.equal(stream.outstandingLoads,2);
  old.resolve();await flush();
  assert.equal(stream.outstandingLoads,0);
  assert.equal(stream.loadedKeys.length,9);
  assert(stream.loadedKeys.every(k=>k.startsWith('02:')));
  assert(events.filter(x=>x.key.startsWith('01:')).every(x=>x.signal.aborted));
  stream.close();await flush();
});

test('a permanently empty or failing loader never causes an automatic retry loop',async()=>{
  let attempts=0;
  const stream=new RegionTileStream(async()=>{
    attempts++;
    return undefined;
  },()=>{}, {autoRefill:true});
  stream.focus('01',0,0,'low');await flush();
  assert.equal(attempts,2);
  assert.equal(stream.loadedKeys.length,0);
  assert.equal(stream.outstandingLoads,0);
  stream.focus('01',0,0,'low');await flush();
  assert.equal(attempts,4,'a later explicit focus is allowed to retry');
  assert.equal(stream.refillFailure,null);
  stream.close();
});

test('default manual streaming semantics and terminal close remain unchanged',async()=>{
  const stream=new RegionTileStream(async coord=>({key:coord.key}),()=>{});
  stream.focus('01',0,0,'low');await flush();
  assert.equal(stream.loadedKeys.length,2);
  assert.equal(stream.outstandingLoads,0);
  stream.close();
  assert.throws(()=>stream.focus('01',0,0,'low'),/disposed/);
});

test('a mixed empty loader is not silently retried after healthy sibling tiles settle',async()=>{
  const desired=planRegionTiles('01',0,0,'low',[]).desired;
  const emptyKey=desired[0].key;
  const attempts=new Map();
  const stream=new RegionTileStream(async coord=>{
    attempts.set(coord.key,(attempts.get(coord.key)??0)+1);
    return coord.key===emptyKey?undefined:{key:coord.key};
  },()=>{}, {autoRefill:true});
  stream.focus('01',0,0,'low');await flush();
  assert.equal(stream.loadedKeys.length,desired.length-1,'unrelated tiles must still load');
  assert.equal(stream.outstandingLoads,0);
  assert.equal(attempts.get(emptyKey),1,'successful siblings must not requeue an empty tile');
  assert(desired.every(t=>attempts.get(t.key)===1),'each tile has exactly one automatic attempt');
  stream.focus('01',0,0,'low');await flush();
  assert.equal(attempts.get(emptyKey),2,'only a fresh explicit focus retries the empty tile');
  assert.equal(stream.loadedKeys.length,desired.length-1);
  stream.close();
});

test('a mixed rejecting loader is not silently retried after healthy sibling tiles settle',async()=>{
  const desired=planRegionTiles('01',0,0,'low',[]).desired;
  const badKey=desired[0].key;
  const attempts=new Map();
  const stream=new RegionTileStream(async coord=>{
    attempts.set(coord.key,(attempts.get(coord.key)??0)+1);
    if(coord.key===badKey)throw new Error('terrain mesh provider offline');
    return {key:coord.key};
  },()=>{}, {autoRefill:true});
  stream.focus('01',0,0,'low');await flush();
  assert.equal(stream.loadedKeys.length,desired.length-1);
  assert.equal(stream.outstandingLoads,0);
  assert.equal(attempts.get(badKey),1);
  stream.focus('01',0,0,'low');await flush();
  assert.equal(attempts.get(badKey),2);
  stream.close();
});
