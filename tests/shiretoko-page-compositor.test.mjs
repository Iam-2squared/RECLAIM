import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTerrainScreenshot} from '../scripts/capture-shiretoko-page-frame.mjs';
function fixtures({after={},pixels={width:1600,height:1000,min:0,max:252},jpeg=Buffer.from([255,216,255,217])}={}) {
 const original={width:1600,height:1000,viewport:[1600,1000],dpr:1,preserveDrawingBuffer:true,
  mode:'walk',pointerLocked:true,grounded:true,inputKeys:[],contextLost:false,shaderError:false,
  renderCallsTotal:17,groundError:0,yaw:0,pitch:-.06,cameraPosition:[20,30,40],fov:66,glError:0};
 const calls=[];let reads=0;
 const page={evaluate:async(fn,arg)=>{const name=fn.toString();if(name.includes('const api = window.__SHIRETOKO_TERRAIN__')){
  calls.push('state');reads++;return reads===1?{...original}:{...original,...after};
 }if(name.includes('canvas.toBlob(')){
  calls.push('webgl-canvas');
  // The encoder receives the requested quality as the real evaluate argument.
  // Assert both that the live JPEG path uses the parameter and that this
  // original walking capture still sends exactly 0.92, never a weaker mock.
  assert.ok(name.includes("'image/jpeg',quality"));
  assert.equal(arg,0.92);
  return 'data:image/jpeg;base64,'+jpeg.toString('base64');
 }calls.push('decode');assert.ok(name.includes('getImageData'));assert.ok(arg?.startsWith('/9j'));return pixels;},
 screenshot:async()=>{throw new Error('Walking capture must not resubmit the page compositor');}};
 return{page,calls};
}
test('captures an unchanged nonblank real WebGL canvas frame without mutating native camera or input',async()=>{
 const f=fixtures();const r=await captureTerrainScreenshot(f.page);
 assert.deepEqual(f.calls,['state','webgl-canvas','state','decode']);
 for(const [key,val] of Object.entries({mode:'walk',pointerLocked:true,grounded:true,groundError:0,yaw:0,pitch:-.06,fov:66,
  width:1600,height:1000,glError:0,renderCallsTotal:17,min:0,max:252,preserveDrawingBuffer:true}))assert.deepEqual(r[key],val,key);
 assert.deepEqual(r.inputKeys,[]);assert.equal(r.image,'data:image/jpeg;base64,/9j/2Q==');
});
test('rejects actual camera movement mid-capture rather than attributing another frame to pose',async()=>{
 const f=fixtures({after:{yaw:0.4}});await assert.rejects(captureTerrainScreenshot(f.page),/state changed: yaw/);
 assert.deepEqual(f.calls,['state','webgl-canvas','state']);
});
test('rejects lost context, GL errors and mismatched screenshot dimensions',async()=>{
 for(const [after,pixels,re] of [[{glError:1282},undefined,/WebGL after screenshot error/],[{contextLost:true},undefined,/WebGL after screenshot error/],[{}, {width:1024,height:768,min:1,max:2},/resolution differs/]]){
  const f=fixtures({after,pixels});await assert.rejects(captureTerrainScreenshot(f.page),re);
 }
});
test('flat frame or missing JPEG does not satisfy original WebGL scene proof',async()=>{
 await assert.rejects(captureTerrainScreenshot(fixtures({pixels:{width:1600,height:1000,min:12,max:12}}).page),/blank/);
 await assert.rejects(captureTerrainScreenshot(fixtures({jpeg:Buffer.from([2,2,2,2])}).page),/did not return JPEG/);
});

test('rejects a changed actual camera position or input after the screenshot',async()=>{
 for(const after of [{cameraPosition:[21,30,40]},{inputKeys:['KeyW']}]) {
  const f=fixtures({after});
  await assert.rejects(captureTerrainScreenshot(f.page),/camera or input changed/);
 }
});
