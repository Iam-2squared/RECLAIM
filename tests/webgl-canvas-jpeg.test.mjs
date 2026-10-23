import test from 'node:test';
import assert from 'node:assert/strict';
import {withCanvasCaptureDeadline,readLiveWebGLCanvasJPEG} from '../scripts/webgl-canvas-jpeg.mjs';
const jpeg='data:image/jpeg;base64,/9j/2Q==';
function pageWithCanvas(canvas,{readError=null}={}) {
  return {evaluate:async f=>{
    const oldDocument=globalThis.document,oldReader=globalThis.FileReader;
    try {
      globalThis.document={querySelector:()=>canvas};
      globalThis.FileReader=class {
        result=null;error=readError;onload=null;onerror=null;
        readAsDataURL(){if(this.error)this.onerror();else{this.result=jpeg;this.onload();}}
      };
      return await f();
    } finally {globalThis.document=oldDocument;globalThis.FileReader=oldReader;}
  }};
}
function liveCanvas(onBlob) {
  return {width:1600,height:1000,getContext:x=>x==='webgl2'?{isContextLost:()=>false}:null,
    toDataURL:()=>{throw new Error('synchronous readback forbidden');},
    toBlob:onBlob};
}
test('returns real full-resolution WebGL JPEG via one async encode, not Playwright compositor or synchronous fallback',async()=>{
  let calls=0;
  const canvas=liveCanvas((callback,format,quality)=>{
    calls++;assert.equal(format,'image/jpeg');assert.equal(quality,.92);
    callback({type:'image/jpeg',size:12});
  });
  assert.equal(await readLiveWebGLCanvasJPEG(pageWithCanvas(canvas)),jpeg);
  assert.equal(calls,1);
});
test('fails closed for missing, lost or zero-sized WebGL buffers and invalid JPEG bytes',async()=>{
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(null)),/not available/);
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas({width:0,height:0,getContext:()=>({})})),/not available/);
  const lost=liveCanvas(()=>{throw Error('must not encode a lost buffer');});
  lost.getContext=()=>({isContextLost:()=>true});
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(lost)),/not available/);
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(liveCanvas(callback=>callback(null)))),/did not encode/);
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(liveCanvas(callback=>callback({type:'image/png',size:12})))),/did not encode/);
});
test('preserves original asynchronous encoding and file-reader errors without retries',async()=>{
  const gpuError=new Error('GPU encoder failed');
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(liveCanvas(()=>{throw gpuError;}))),e=>e===gpuError);
  const readError=new Error('FileReader failed');
  await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(liveCanvas(cb=>cb({type:'image/jpeg',size:12})),{readError})),e=>e===readError);
});
test('preserves 20s upper bound and surfaces original readback errors',async()=>{
  for(const t of [0,-1,20_001,Infinity,NaN])await assert.rejects(withCanvasCaptureDeadline(()=>true,t),RangeError);
  const cause=new Error('webgl lost');await assert.rejects(withCanvasCaptureDeadline(()=>Promise.reject(cause)),e=>e===cause);
});
test('does not silently retry a stalled software-GPU readback',async()=>{
  let calls=0;
  await assert.rejects(withCanvasCaptureDeadline(()=>{calls++;return new Promise(()=>{});},15),/original 20000ms/);
  assert.equal(calls,1);
});
