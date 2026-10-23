import test from 'node:test';
import assert from 'node:assert/strict';
import {withCanvasCaptureDeadline,readLiveWebGLCanvasJPEG} from '../scripts/webgl-canvas-jpeg.mjs';
const jpeg='data:image/jpeg;base64,/9j/2Q==';
function pageWithCanvas(canvas) {return {evaluate:async f=>{const old=globalThis.document;try{globalThis.document={querySelector:()=>canvas};return f();}finally{globalThis.document=old;}}};}
test('returns actual WebGL canvas JPEG rather than Playwright compositor or fake fallback',async()=>{
 let read=0;const canvas={width:1600,height:1000,getContext:x=>x==='webgl2'?{}:null,toDataURL:(fmt,q)=>{read++;assert.equal(fmt,'image/jpeg');assert.equal(q,.92);return jpeg;}};
 assert.equal(await readLiveWebGLCanvasJPEG(pageWithCanvas(canvas)),jpeg);assert.equal(read,1);
});
test('fails closed for missing context and blank WebGL buffer',async()=>{
 await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas(null)),/not available/);
 await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas({width:0,height:0,getContext:()=>({})})),/not available/);
 await assert.rejects(readLiveWebGLCanvasJPEG(pageWithCanvas({width:1600,height:1000,getContext:()=>({}),toDataURL:()=> 'data:,'})),/did not encode/);
});
test('preserves 20s upper bound and surfaces original readback errors',async()=>{
 for(const t of [0,-1,20_001,Infinity,NaN])await assert.rejects(withCanvasCaptureDeadline(()=>true,t),RangeError);
 const cause=new Error('webgl lost');await assert.rejects(withCanvasCaptureDeadline(()=>Promise.reject(cause)),e=>e===cause);
});
test('does not silently retry slow software-GPU readback',async()=>{
 let calls=0;
 await assert.rejects(withCanvasCaptureDeadline(()=>{calls++;return new Promise(()=>{});},15),/original 20000ms/);
 assert.equal(calls,1);
});
