import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {closeReviewBrowser} from '../scripts/close-review-browser.mjs';
function fixture({onPageClose,onBrowserClose,handle}={}) {
 const context=new EventEmitter(),events=[];
 let pages=[{async close(options){assert.deepEqual(options,{runBeforeUnload:false});events.push('page');await onPageClose?.();pages=[];}}];
 context.pages=()=>pages;
 const browser={async close(){events.push('browser');await onBrowserClose?.();context.emit('close');},isConnected:()=>false};
 return {context,events,browser,handle:handle??{async dispose(){events.push('handle');}}};
}
test('WebGL handle and genuine review page close before browser, context close observed',async()=>{
 const x=fixture();await closeReviewBrowser(x.browser,x.context,x.handle);
 assert.deepEqual(x.events,['handle','page','browser']);
});
test('isolated context close event is mandatory for success',async()=>{
 const x=fixture();x.browser.close=async()=>{x.events.push('browser-no-event');};
 await assert.rejects(closeReviewBrowser(x.browser,x.context,x.handle),/did not emit close/);
 assert.deepEqual(x.events,['handle','page','browser-no-event']);
});
test('browser must disconnect even when close event was emitted',async()=>{
 const x=fixture();x.browser.isConnected=()=>true;
 await assert.rejects(closeReviewBrowser(x.browser,x.context,x.handle),/remained connected/);
});
test('failed page close is preserved, still attempts browser termination',async()=>{
 const failure=new Error('page could not close'),x=fixture({onPageClose:()=>{throw failure;}});
 await assert.rejects(closeReviewBrowser(x.browser,x.context,x.handle),e=>e instanceof AggregateError&&e.errors.includes(failure));
 assert.deepEqual(x.events,['handle','page','browser']);
});
test('GPU handle failure cannot become passing cleanup',async()=>{
 const failure=new Error('GPU handle failure'),x=fixture({handle:{async dispose(){throw failure;}}});
 await assert.rejects(closeReviewBrowser(x.browser,x.context,x.handle),e=>e===failure);
 assert.deepEqual(x.events,['page','browser']);
});
test('browser close failure is propagated with no retry or fallback',async()=>{
 const failure=new Error('browser failed'),x=fixture({onBrowserClose:()=>{throw failure;}});
 await assert.rejects(closeReviewBrowser(x.browser,x.context,x.handle),e=>e instanceof AggregateError&&e.errors.includes(failure));
 assert.deepEqual(x.events,['handle','page','browser']);
});
test('closed page enumeration must be empty; no context.close command issued',async()=>{
 const x=fixture();x.context.close=()=>{throw new Error('context.close must not be invoked during browser shutdown');};
 await closeReviewBrowser(x.browser,x.context,x.handle);
});
test('multiple failures retain their independent sources',async()=>{
 const first=new Error('GPU handle'),second=new Error('browser close');
 const x=fixture({handle:{async dispose(){throw first;}},onBrowserClose:()=>{throw second;}});
 await assert.rejects(closeReviewBrowser(x.browser,x.context,x.handle),e=>e instanceof AggregateError&&e.errors.includes(first)&&e.errors.includes(second));
});
test('browser with no open page still terminates and closes its context',async()=>{
 const x=fixture();x.context.pages=()=>[];
 await closeReviewBrowser(x.browser,x.context,x.handle);
 assert.deepEqual(x.events,['handle','browser']);
});
