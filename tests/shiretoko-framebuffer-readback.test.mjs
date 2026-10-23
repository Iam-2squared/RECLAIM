import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTerrainFramebuffer } from '../scripts/capture-terrain-framebuffer.mjs';

function fixture(t, statuses = [4, 5]) {
  const restore = new Map(['window','document','innerWidth','innerHeight','devicePixelRatio','ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(() => { for (const [k, d] of restore) d ? Object.defineProperty(globalThis,k,d) : delete globalThis[k]; });
  const calls = [], previous = {}, buffer = {}, sync = {};
  let binding = previous, encoded, encoding, submitted = false, signaled = false;
  const gl = {
    PIXEL_PACK_BUFFER:1, PIXEL_PACK_BUFFER_BINDING:2, STREAM_READ:3, TIMEOUT_EXPIRED:4,
    CONDITION_SATISFIED:5, ALREADY_SIGNALED:6, WAIT_FAILED:7, SYNC_GPU_COMMANDS_COMPLETE:8,
    RGBA:9, UNSIGNED_BYTE:10, NO_ERROR:0,
    isContextLost: () => false, getContextAttributes: () => ({preserveDrawingBuffer:true}),
    getParameter: () => binding, createBuffer: () => buffer,
    bindBuffer: (target, b) => { assert.equal(target,1); binding = b; },
    bufferData: (target, bytes) => { assert.equal(binding,buffer); assert.equal(bytes,16); },
    readPixels: (x,y,w,h,format,type,offset) => { assert.equal(binding,buffer); assert.equal(offset,0); assert.equal(w,2); assert.equal(h,2); submitted=true; calls.push('read'); },
    fenceSync: () => { assert.equal(binding,previous); assert.ok(submitted); calls.push('fence'); return sync; },
    flush: () => calls.push('flush'),
    clientWaitSync: (s,flags,timeout) => { assert.equal(s,sync); assert.equal(flags,0); assert.equal(timeout,0); const status=statuses.length>1?statuses.shift():statuses[0]; signaled=status===5||status===6; calls.push('poll'); return status; },
    getBufferSubData: (target, offset, out) => { assert.ok(signaled,'must not synchronously read before fence'); out.set([1,2,3,255,4,5,6,255,21,22,23,255,24,25,26,255]); calls.push('copy'); },
    getError: () => 0, deleteBuffer: b => {assert.equal(b,buffer); calls.push('delete-buffer');},
    deleteSync: s => {assert.equal(s,sync); calls.push('delete-sync');},
    finish: () => {throw new Error('synchronous GPU finish forbidden');},
  };
  const source = {width:2,height:2,getContext:()=>gl,toDataURL:()=>{throw new Error('second GPU read forbidden');}};
  globalThis.document = {
    querySelector: () => source,
    createElement: () => ({getContext:()=>({putImageData:data=>{encoded=data;}}),toDataURL:(format,quality)=>{encoding={format,quality};return 'data:image/jpeg;base64,/9j/2Q==';}}),
  };
  const metadata = {mode:'walk',pointerLocked:true,player:{x:1,y:10,z:2,grounded:true},inputKeys:[],contextLost:false,shaderError:false,renderCallsTotal:12,camera:{position:[1,12,2],fov:66}};
  globalThis.window = {__SHIRETOKO_TERRAIN__:{diagnostics:()=>metadata,terrain:{heightAt:()=>10,inWater:()=>false},walker:{yaw:0,pitch:-.06}}};
  globalThis.innerWidth=2;globalThis.innerHeight=2;globalThis.devicePixelRatio=1;
  globalThis.ImageData=class {constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
  return {gl,calls,metadata,previous,getBinding:()=>binding,getEncoded:()=>encoded,getEncoding:()=>encoding};
}

test('asynchronous framebuffer reads actual pixels once, flips rows and releases GPU resources', async t => {
  const f=fixture(t);const result=await captureTerrainFramebuffer({pollMs:1});
  assert.deepEqual(f.calls,['read','fence','flush','poll','poll','copy','delete-sync','delete-buffer']);
  assert.equal(f.getBinding(),f.previous);assert.equal(result.min,1);assert.equal(result.max,26);
  assert.equal(result.mode,'walk');assert.equal(result.groundError,0);assert.equal(result.renderCallsTotal,12);
  assert.deepEqual(result.player,{x:1,y:10,z:2,grounded:true});assert.equal(result.water,false);
  assert.deepEqual([...f.getEncoded().data],[21,22,23,255,24,25,26,255,1,2,3,255,4,5,6,255]);
  assert.equal(result.width,2);assert.equal(result.height,2);assert.equal(result.fov,66);
});
test('V4 uses the original .94 JPEG quality without a second WebGL readback', async t => {
  const f=fixture(t,[5]);const frame=await captureTerrainFramebuffer({jpegQuality:.94});
  assert.deepEqual(f.getEncoding(),{format:'image/jpeg',quality:.94});
  assert.ok(frame.image.startsWith('data:image/jpeg;base64,/9j'));
  assert.equal(f.calls.filter(x=>x==='read').length,1);
  assert.equal(frame.glError,0);assert.equal(frame.groundError,0);
});
test('failed fence fails closed and releases every allocation', async t => {
  const f=fixture(t,[7]);await assert.rejects(captureTerrainFramebuffer(),/fence failed/);
  assert.equal(f.getBinding(),f.previous);assert.ok(!f.calls.includes('copy'));
  assert.deepEqual(f.calls.slice(-2),['delete-sync','delete-buffer']);
});
test('non-signaling fence stays bounded without a synchronous fallback', async t => {
  const f=fixture(t,[4]);await assert.rejects(captureTerrainFramebuffer({timeoutMs:5,pollMs:1}),/timed out/);
  assert.ok(!f.calls.includes('copy'));assert.deepEqual(f.calls.slice(-2),['delete-sync','delete-buffer']);
});
test('lost context and read errors are not converted into passing images', async t => {
  const f=fixture(t,[5]);f.gl.getError=()=>1282;
  await assert.rejects(captureTerrainFramebuffer(),/readback error: 1282/);
  assert.deepEqual(f.calls.slice(-2),['delete-sync','delete-buffer']);
  f.gl.isContextLost=()=>true;await assert.rejects(captureTerrainFramebuffer(),/unavailable/);
});
test('metadata remains tied to the submitted frame while scene keeps running', async t => {
  const f=fixture(t,[4,5]);setTimeout(()=>{f.metadata.renderCallsTotal=90;f.metadata.camera.position[0]=200;},0);
  const result=await captureTerrainFramebuffer({pollMs:1});
  assert.equal(result.renderCallsTotal,12);assert.deepEqual(result.cameraPosition,[1,12,2]);
});
test('invalid time budgets are rejected before touching WebGL', async () => {
  for (const options of [{timeoutMs:0},{timeoutMs:Infinity},{timeoutMs:20001},{pollMs:0},{pollMs:NaN},{jpegQuality:-.01},{jpegQuality:1.01},{jpegQuality:NaN},{jpegQuality:Infinity}])
    await assert.rejects(captureTerrainFramebuffer(options),RangeError);
});
