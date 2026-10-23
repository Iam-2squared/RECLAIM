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
