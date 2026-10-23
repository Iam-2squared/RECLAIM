import test from 'node:test';
import assert from 'node:assert/strict';
import {captureShiretokoWalkFrame} from '../scripts/capture-shiretoko-walk-frame.mjs';
function fixture({after={},pixels={width:1600,height:900,min:2,max:250},capturePatch={}}={}){
  const d={mode:'walk',pointerLocked:true,player:{x:-170,y:108,z:849,grounded:true,distance:1},
    camera:{position:[-170,109.68,849],target:[-155,100,760],fov:66},
    inputKeys:[],contextLost:false,shaderError:false,viewport:[1600,900],dpr:1,
    renderCallsTotal:20,water:false,groundError:0};
  const c={width:1600,height:900,viewport:[1600,900],dpr:1,preserveDrawingBuffer:true,
    mode:'walk',pointerLocked:true,grounded:true,inputKeys:[],contextLost:false,
    shaderError:false,renderCallsTotal:20,groundError:0,yaw:0,pitch:0,
    cameraPosition:[-170,109.68,849],fov:66,glError:0,...capturePatch};
  let outerReads=0;const calls=[];
  return{calls,page:{async evaluate(fn,arg){
    const src=fn.toString();assert.doesNotMatch(src,/gl\.finish\(|canvas\.toDataURL\(/);
    if(src.includes('const api=window.__SHIRETOKO_TERRAIN__')){calls.push('mission');return structuredClone(++outerReads===1?d:{...d,...after});}
    if(src.includes('const api = window.__SHIRETOKO_TERRAIN__')){calls.push('capture-state');return structuredClone(c);}
    if(src.includes('canvas.toBlob')){calls.push('async-jpeg');return'data:image/jpeg;base64,/9j/2Q==';}
    if(src.includes('getImageData')){calls.push('pixels');assert.equal(arg,'/9j/2Q==');return pixels;}
    throw new Error('Unexpected non-read-only browser call');
  }}};
}
test('V4 keeps full real diagnostics and exact 1600x900 async WebGL capture',async()=>{
 const f=fixture();const r=await captureShiretokoWalkFrame(f.page);
 assert.equal(r.player.distance,1);assert.equal(r.player.grounded,true);
 assert.equal(r.water,false);assert.equal(r.groundError,0);assert.equal(r.glError,0);
 assert.equal(r.captureWidth,1600);assert.equal(r.captureHeight,900);
 assert.equal(r.image,'data:image/jpeg;base64,/9j/2Q==');
 assert.deepEqual(f.calls,['mission','capture-state','async-jpeg','capture-state','pixels','mission']);
});
test('V4 refuses wet or non-grounded locations and held keys',async()=>{
 for(const after of [{water:true},{player:{x:-170,y:109,z:849,grounded:false,distance:1}},
   {inputKeys:['Space']},{groundError:1}])await assert.rejects(captureShiretokoWalkFrame(fixture({after}).page));
});
test('V4 rejects actual player or camera change during a frame capture',async()=>{
 for(const after of [{player:{x:-169,y:108,z:849,grounded:true,distance:2}},
   {camera:{position:[-170,109.68,849],target:[0,0,0],fov:66}}])
   await assert.rejects(captureShiretokoWalkFrame(fixture({after}).page),/must not move/);
});
test('V4 rejects reduced resolution, blank pixels and WebGL failures',async()=>{
 for(const spec of [{pixels:{width:800,height:450,min:2,max:250}},
   {pixels:{width:1600,height:900,min:0,max:0}},{capturePatch:{glError:1282}}])
   await assert.rejects(captureShiretokoWalkFrame(fixture(spec).page));
});
test('V4 propagates original browser rejection rather than fabricating a frame',async()=>{
 const original=new Error('GPU disconnected');
 await assert.rejects(captureShiretokoWalkFrame({async evaluate(){throw original;}}),e=>e===original);
});
