import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTerrainFramebuffer} from '../scripts/capture-shiretoko-framebuffer.mjs';

function fixture(statuses=[2,3],options={}){
 const calls=[],prior={prior:true},buffer={buffer:true},fence={fence:true};let packed=prior,encoded;
 const pixels=Uint8Array.from([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
 const gl={PIXEL_PACK_BUFFER:1,PIXEL_PACK_BUFFER_BINDING:2,STREAM_READ:3,RGBA:4,UNSIGNED_BYTE:5,SYNC_GPU_COMMANDS_COMPLETE:6,
  ALREADY_SIGNALED:1,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:2,WAIT_FAILED:4,NO_ERROR:0,
  isContextLost:()=>false,getContextAttributes:()=>({preserveDrawingBuffer:options.preserve!==false}),
  getParameter:()=>prior,createBuffer:()=>buffer,
  bindBuffer(t,b){assert.equal(t,1);packed=b;calls.push(['bind',b]);},
  bufferData(t,n,u){assert.equal(packed,buffer);assert.equal(n,16);calls.push(['allocate',n]);},
  readPixels(x,y,w,h,f,t,offset){assert.equal(packed,buffer);assert.equal(offset,0);assert.equal(w,2);assert.equal(h,2);calls.push(['read']);},
  fenceSync:()=>fence,flush(){calls.push(['flush']);},
  clientWaitSync(s,f,t){assert.equal(s,fence);assert.equal(f,0);assert.equal(t,0);assert.equal(packed,prior);const v=statuses.length>1?statuses.shift():statuses[0];calls.push(['wait',v]);return v;},
  getBufferSubData(t,o,data){assert.equal(packed,buffer);assert.equal(calls.filter(c=>c[0]==='wait').at(-1)[1],3);data.set(pixels);calls.push(['copy']);},
  getError:()=>options.error??0,deleteSync(s){assert.equal(s,fence);calls.push(['deleteSync']);},deleteBuffer(b){assert.equal(b,buffer);calls.push(['deleteBuffer']);},
  finish(){assert.fail('Blocking gl.finish must not be used');},
 };
 const actual={width:2,height:2,getContext:()=>gl,toDataURL(){assert.fail('Must not read GL canvas again');}};
 const image={getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(16)}),putImageData:p=>{encoded=[...p.data];}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/'};
 const d={mode:'walk',pointerLocked:true,player:{x:0,y:5,z:0,grounded:true},camera:{fov:66},inputKeys:[],renderCallsTotal:9};
 const props={window:{__SHIRETOKO_TERRAIN__:{diagnostics:()=>d,terrain:{heightAt:()=>5,inWater:()=>false},walker:{yaw:0,pitch:-.06}}},
  document:{querySelector:()=>actual,createElement:()=>image},innerWidth:2,innerHeight:2,devicePixelRatio:1};
 const old=new Map(Object.keys(props).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const[k,v]of Object.entries(props))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 return{calls,prior,get packed(){return packed;},get encoded(){return encoded;},restore(){for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
}

test('async framebuffer waits for the GPU, encodes exact flipped rows and releases transfer resources',async()=>{
 const f=fixture();try{
  const r=await captureTerrainFramebuffer();
  assert.equal(r.groundError,0);assert.equal(r.glError,0);assert.equal(r.mode,'walk');assert.equal(r.min,1);assert.equal(r.max,12);
  assert.deepEqual(f.encoded,[7,8,9,255,10,11,12,255,1,2,3,255,4,5,6,255]);
  assert.equal(f.calls.filter(x=>x[0]==='copy').length,1);assert.equal(f.calls.filter(x=>x[0]==='deleteBuffer').length,1);assert.equal(f.calls.filter(x=>x[0]==='deleteSync').length,1);assert.equal(f.packed,f.prior);
 }finally{f.restore();}
});
test('failed fence fails closed without reading unready pixels and cleans up',async()=>{
 const f=fixture([4]);try{await assert.rejects(captureTerrainFramebuffer(),/fence failed/);assert(!f.calls.some(c=>c[0]==='copy'));assert.equal(f.packed,f.prior);assert.equal(f.calls.filter(c=>c[0]==='deleteBuffer').length,1);}finally{f.restore();}
});
test('unresponsive GPU has a finite deadline without turning an incomplete capture into success',async()=>{
 const f=fixture([2]);try{await assert.rejects(captureTerrainFramebuffer({timeoutMs:1}),/deadline exceeded/);assert(!f.calls.some(c=>c[0]==='copy'));assert.equal(f.calls.filter(c=>c[0]==='deleteSync').length,1);}finally{f.restore();}
});
test('readback preserves GL errors as failures and rejects unpreserved framebuffer',async()=>{
 const f=fixture([3],{error:1282});try{await assert.rejects(captureTerrainFramebuffer(),/GL error: 1282/);assert.equal(f.calls.filter(c=>c[0]==='deleteBuffer').length,1);}finally{f.restore();}
 const g=fixture([3],{preserve:false});try{await assert.rejects(captureTerrainFramebuffer(),/preserved actual/);assert.equal(g.calls.length,0);}finally{g.restore();}
});
