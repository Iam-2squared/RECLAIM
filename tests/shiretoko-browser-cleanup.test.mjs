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

test('retained GL handle, actual review page and explicit context close in order',async()=>{
  const events=[];
  const handle={async dispose(){events.push('handle');},async evaluate(){throw new Error('Must never invoke context-loss after renderer disposal');}};
  const page={async close(options){assert.deepEqual(options,{runBeforeUnload:false});events.push('page');}};
  const context={pages:()=>[page],async close(){events.push('context');}};
  const browser={async close(){events.push('browser');},isConnected:()=>false};
  await closeReviewBrowser(browser,context,handle);
  assert.deepEqual(events,['handle','page','context','browser']);
});
test('lost GPU context needs no extension evaluation and still disposes retained handle',async()=>{
  let disposed=false;
  const handle={async evaluate(){throw new Error('No post-disposal WEBGL extension calls');},async dispose(){disposed=true;}};
  await closeReviewBrowser({close:async()=>{},isConnected:()=>false},{pages:()=>[],close:async()=>{}},handle);
  assert(disposed);
});
test('GL handle release failure still closes page, context, browser and remains a failure',async()=>{
  const error=new Error('GPU handle release failed'),events=[];
  const page={async close(){events.push('page');}};
  const context={pages:()=>[page],async close(){events.push('context');}};
  const browser={async close(){events.push('browser');},isConnected:()=>false};
  await assert.rejects(closeReviewBrowser(browser,context,{async dispose(){throw error;}}),e=>e===error);
  assert.deepEqual(events,['page','context','browser']);
});
test('page close failure does not bypass context/browser cleanup or count as a pass', async () => {
  const error=new Error('page close failed'),events=[];
  const context={pages:()=>[{async close(){events.push('page');throw error;}}],async close(){events.push('context');}};
  const browser={async close(){events.push('browser');},isConnected:()=>false};
  await assert.rejects(closeReviewBrowser(browser,context),e=>e===error);
  assert.deepEqual(events,['page','context','browser']);
});
test('enumeration and browser close errors are both retained',async()=>{
  const enumerateError=new Error('pages listing failed'),browserError=new Error('browser close failed');
  await assert.rejects(closeReviewBrowser({async close(){throw browserError;}},
    {pages(){throw enumerateError;},async close(){}}),e=>e instanceof AggregateError&&e.errors[0]===enumerateError&&e.errors[1]===browserError);
});
