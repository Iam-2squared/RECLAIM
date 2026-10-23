import test from 'node:test';
import assert from 'node:assert/strict';
import {RegionTileStream} from '../src/world/region-stream.ts';

const flush = async () => { for (let i=0; i<100; i++) await Promise.resolve(); };
const gate = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };

test('a disposer-driven new region wins over a superseded outer focus', async () => {
  let stream; let redirected=false; const disposed=[];
  stream=new RegionTileStream(async coord=>({key:coord.key}),resource=>{
    disposed.push(resource.key);
    if(!redirected){redirected=true;stream.focus('02',0,0,'low');}
  });
  stream.focus('01',0,0,'low'); await flush();
  assert.equal(stream.loadedKeys.length,2);
  assert.throws(()=>stream.focus('03',0,0,'low'),/superseded/);
  await flush();
  assert.equal(redirected,true);
  assert.equal(stream.focus('02',0,0,'low').region,'02');
  assert(stream.loadedKeys.every(key=>key.startsWith('02:')));
  assert(stream.pendingKeys.every(key=>key.startsWith('02:')));
  assert(!stream.loadedKeys.some(key=>key.startsWith('03:')));
  stream.close();await flush();
  assert.equal(stream.outstandingLoads,0);
});

test('abort listener refocusing cannot be overwritten by an obsolete regional transition',async()=>{
  const delay=gate();let stream;let redirected=false;
  stream=new RegionTileStream(async (coord,signal)=>{
    signal.addEventListener('abort',()=>{
      if(!redirected){redirected=true;stream.focus('02',0,0,'low');}
    });
    await delay.promise;
    return {key:coord.key};
  },()=>{});
  stream.focus('01',0,0,'low');await flush();
  assert.equal(stream.outstandingLoads,2);
  assert.throws(()=>stream.focus('03',0,0,'low'),/superseded/);
  assert(redirected);
  delay.resolve();await flush();
  assert.equal(stream.focus('02',0,0,'low').region,'02');
  await flush();
  assert(stream.loadedKeys.every(key=>key.startsWith('02:')));
  assert(stream.pendingKeys.every(key=>key.startsWith('02:')));
  assert(!stream.loadedKeys.some(key=>key.startsWith('03:')));
  stream.close();await flush();
});

test('close is terminal before any external synchronous resource disposal callback',async()=>{
  let stream;const rejected=[];
  stream=new RegionTileStream(async coord=>({key:coord.key}),()=>{
    try{stream.focus('02',0,0,'low');}catch(error){rejected.push(String(error));}
  });
  stream.focus('01',0,0,'low');await flush();
  assert.equal(stream.loadedKeys.length,2);
  stream.close();await flush();
  assert.equal(rejected.length,2);
  assert(rejected.every(e=>e.includes('disposed')));
  assert.deepEqual(stream.loadedKeys,[]);
  assert.deepEqual(stream.pendingKeys,[]);
  assert.equal(stream.outstandingLoads,0);
  assert.throws(()=>stream.focus('01',0,0,'low'),/disposed/);
});
