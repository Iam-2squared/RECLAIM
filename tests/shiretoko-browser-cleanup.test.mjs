import test from 'node:test';
import assert from 'node:assert/strict';
import { closeReviewBrowser } from '../scripts/close-review-browser.mjs';

test('review context closes fully before browser termination', async () => {
  const events=[];let contextClosed=false;
  const context={async close(){events.push('context-start');await new Promise(r=>setImmediate(r));contextClosed=true;events.push('context-end');}};
  const browser={async close(){assert(contextClosed);events.push('browser');},isConnected:()=>false};
  await closeReviewBrowser(browser,context);
  assert.deepEqual(events,['context-start','context-end','browser']);
});
test('context failure still cleans browser and cannot be converted into success', async () => {
  const original=new Error('context close failed');let browserClosed=false;
  await assert.rejects(closeReviewBrowser({async close(){browserClosed=true;},isConnected:()=>false},{async close(){throw original;}}),e=>e===original);
  assert(browserClosed);
});
test('browser failure and persistent connection fail closed', async () => {
  const error=new Error('browser close failed');
  await assert.rejects(closeReviewBrowser({async close(){throw error;},isConnected:()=>true},{async close(){}}),e=>e===error);
  await assert.rejects(closeReviewBrowser({async close(){},isConnected:()=>true},{async close(){}}),/remained connected/);
});
test('both failures are preserved without a retry or fallback', async () => {
  const a=new Error('context'),b=new Error('browser');
  await assert.rejects(closeReviewBrowser({async close(){throw b;}},{async close(){throw a;}}),e=>e instanceof AggregateError&&e.errors[0]===a&&e.errors[1]===b);
});

test('retained fixture GL context and handle are released before native context close',async()=>{
 const events=[];const gl={isContextLost:()=>false,getExtension:name=>{assert.equal(name,'WEBGL_lose_context');return{loseContext(){events.push('lose-gl');}};}};
 const handle={evaluate:async fn=>fn(gl),dispose:async()=>events.push('handle')};
 await closeReviewBrowser({close:async()=>events.push('browser'),isConnected:()=>false},{close:async()=>events.push('context')},handle);
 assert.deepEqual(events,['lose-gl','handle','context','browser']);
});
test('already lost or unsupported fixture contexts do not request another loss',async()=>{
 for(const lost of [true,false]){
  let probes=0,disposed=false;
  const gl={isContextLost:()=>lost,getExtension(){probes++;return null;}};
  await closeReviewBrowser({close:async()=>{},isConnected:()=>false},{close:async()=>{}},{evaluate:async fn=>fn(gl),dispose:async()=>{disposed=true;}});
  assert.equal(probes,lost?0:1);assert(disposed);
 }
});
test('GL teardown failure still closes the owned handle, context and browser and remains failure',async()=>{
 const error=new Error('GPU release failed'),events=[];
 await assert.rejects(closeReviewBrowser({close:async()=>events.push('browser'),isConnected:()=>false},{close:async()=>events.push('context')},{evaluate:async()=>{throw error;},dispose:async()=>events.push('handle')}),e=>e===error);
 assert.deepEqual(events,['handle','context','browser']);
});
