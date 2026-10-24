import test from 'node:test';
import assert from 'node:assert/strict';
import {arrowSteps,ARROW_INPUT_LIMITS} from './native-arrow-input.mjs';

test('bounded native arrow batching sends the exact number and releases once',async()=>{
 for(const count of [0,1,7,8,9,48,65]){
  const events=[];let inFlight=0,maxFlight=0;
  const keyboard={
   async down(key){events.push(['down',key]);inFlight++;maxFlight=Math.max(maxFlight,inFlight);await new Promise(resolve=>setImmediate(resolve));inFlight--;},
   async up(key){assert.equal(inFlight,0);events.push(['up',key]);},
  };
  await arrowSteps(keyboard,'ArrowLeft',count);
  assert.equal(events.filter(e=>e[0]==='down').length,count);
  assert.equal(events.filter(e=>e[0]==='up').length,count?1:0);
  assert(maxFlight<=ARROW_INPUT_LIMITS.batch);
  if(count)assert.deepEqual(events.at(-1),['up','ArrowLeft']);
 }
});
test('dispatch rejection waits for the whole batch and still releases the key',async()=>{
 const error=new Error('native dispatch rejected');let started=0,completed=0,released=false;
 const keyboard={
  async down(){const index=++started;await new Promise(resolve=>setImmediate(resolve));completed++;if(index===3)throw error;},
  async up(){assert.equal(completed,8);released=true;},
 };
 await assert.rejects(arrowSteps(keyboard,'ArrowRight',30),e=>e===error);
 assert.equal(started,8);assert(released);
});
test('invalid arrow input cannot send any native event',async()=>{
 const keyboard={down(){assert.fail('unexpected keydown');},up(){assert.fail('unexpected keyup');}};
 for(const key of ['KeyW','Space','ShiftLeft'])await assert.rejects(arrowSteps(keyboard,key,1),RangeError);
 for(const n of [-1,.5,66,NaN,Infinity])await assert.rejects(arrowSteps(keyboard,'ArrowLeft',n),RangeError);
});
