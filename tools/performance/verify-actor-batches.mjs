import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/__actor-batch-audit__.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#18212a"></body></html>'}));
 await page.goto(`${process.env.RECLAIM_ACTOR_TEST_URL??'http://127.0.0.1:5176'}/__actor-batch-audit__.html`);
 const proof=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {GLTFLoader}=await import('/node_modules/.vite/deps/three_addons_loaders_GLTFLoader__js.js');
  const {batchActorMeshes}=await import('/src/mission/actor-mesh-batches.ts');
  const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
  document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color('#18212a');scene.add(new T.HemisphereLight(0xeaf4ff,0x6d7458,2.0));const light=new T.DirectionalLight(0xffead3,2.3);light.position.set(4,7,5);scene.add(light);
  const camera=new T.PerspectiveCamera(40,1,.01,100),rows=[];
  const pixels=()=>{const result=new Uint8Array(512*512*4);renderer.getContext().readPixels(0,0,512,512,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,result);return result;};
  for(const id of ['humanoid-lv1','drone-lv1']){
   const original=await new GLTFLoader().loadAsync(`/mission-models/${id}.glb`),optimized=await new GLTFLoader().loadAsync(`/mission-models/${id}.glb`);
   const bounds=new T.Box3().setFromObject(original.scene,true),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),distance=Math.max(size.x,size.y,size.z)*2.3;
   camera.position.copy(center).add(new T.Vector3(distance*.45,distance*.18,distance));camera.lookAt(center);camera.updateMatrixWorld(true);
   for(const object of [original.scene,optimized.scene])object.traverse(node=>{if(node.isSkinnedMesh)node.frustumCulled=false;});
   optimized.scene.updateMatrixWorld(true);const batch=batchActorMeshes(optimized.scene,optimized.animations);
   const a=new T.AnimationMixer(original.scene),b=new T.AnimationMixer(optimized.scene);
   for(const motion of [id.startsWith('drone')?'Patrol':'Walk','Death']){
    a.stopAllAction();b.stopAllAction();a.clipAction(original.animations.find(clip=>clip.name===motion)).play();b.clipAction(optimized.animations.find(clip=>clip.name===motion)).play();a.update(.43);b.update(.43);
    scene.add(original.scene);renderer.render(scene,camera);const before=pixels(),beforePng=renderer.domElement.toDataURL('image/png'),beforeCalls=renderer.info.render.calls,beforeTriangles=renderer.info.render.triangles;scene.remove(original.scene);
    scene.add(optimized.scene);renderer.render(scene,camera);const after=pixels(),afterPng=renderer.domElement.toDataURL('image/png'),afterCalls=renderer.info.render.calls,afterTriangles=renderer.info.render.triangles;scene.remove(optimized.scene);
    let differentChannels=0,changedPixels=0,maxChannelDelta=0,totalDelta=0;const deltaCanvas=document.createElement('canvas');deltaCanvas.width=deltaCanvas.height=512;const deltaContext=deltaCanvas.getContext('2d'),deltaImage=deltaContext.createImageData(512,512);
    for(let i=0;i<before.length;i+=4){let changed=false;const pixel=i/4,x=pixel%512,y=511-Math.floor(pixel/512),target=(y*512+x)*4;for(let c=0;c<4;c++){const delta=Math.abs(before[i+c]-after[i+c]);if(delta){differentChannels++;maxChannelDelta=Math.max(maxChannelDelta,delta);totalDelta+=delta;changed=true;}if(c<3)deltaImage.data[target+c]=Math.min(255,delta*12);}deltaImage.data[target+3]=255;if(changed)changedPixels++;}deltaContext.putImageData(deltaImage,0,0);
    rows.push({id,motion,batch,beforeCalls,afterCalls,beforeTriangles,afterTriangles,differentChannels,changedPixels,changedPixelPercent:changedPixels/(512*512)*100,maxChannelDelta,meanChannelDelta:totalDelta/before.length,images:{before:beforePng,after:afterPng,diff:deltaCanvas.toDataURL('image/png')}});
   }
  }
  renderer.dispose();return rows;
 });
 await mkdir('release/performance',{recursive:true});for(const row of proof){for(const [kind,url]of Object.entries(row.images))await writeFile(`release/performance/actor-${row.id}-${row.motion}-${kind}.png`,Buffer.from(url.split(',')[1],'base64'));delete row.images;}
 await writeFile('release/performance/actor-batches.json',JSON.stringify({errors,proof},null,2));console.log(JSON.stringify({proof},null,2));
 assert.deepEqual(errors,[]);for(const row of proof){assert.equal(row.beforeTriangles,row.afterTriangles);assert.ok(row.afterCalls<row.beforeCalls/5);assert.ok(row.changedPixelPercent<.1&&row.meanChannelDelta<.05,`${row.id}/${row.motion} changed beyond coplanar-edge tolerance`);}
 console.log('PASS: authored actor batching framebuffer and draw calls.');
}finally{await browser.close();}
