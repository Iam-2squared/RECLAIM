import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const output=resolve('release/deployment-background');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1800,height:1000}});
 // An isolated document keeps source captures independent of application HMR
 // and avoids allocating the HOME renderer alongside this one-off photo.
 await page.route('**/__deployment-capture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><title>Shiretoko deployment photo</title></head><body></body></html>'}));
 await page.goto('http://127.0.0.1:5173/__deployment-capture');
 const shots=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {loadAuthoredMapData}=await import('/src/world/authored-map-data.ts');
  const {createAuthoredMapWorld}=await import('/src/world/authored-map-world.ts');
  const world=await createAuthoredMapWorld(await loadAuthoredMapData(),'balanced');
  world.scene.traverse(object=>{if(object.isInstancedMesh&&object.name.startsWith('authored:'))object.parent.visible=true;});
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1800,1000);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const camera=new T.PerspectiveCamera(55,1.8,.1,3000),shots=[];
  for(const [id,position,target,fov] of [['g',[-196,98,654],[-100,105,180],55],['h',[-202,98,650],[-100,105,170],55]]){
   camera.fov=fov;camera.updateProjectionMatrix();
   camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();renderer.render(world.scene,camera);
   shots.push({id,position,target,fov,image:renderer.domElement.toDataURL('image/webp',.92)});
  }
  world.dispose();renderer.dispose();renderer.forceContextLoss();return shots;
 });
 for(const shot of shots){await writeFile(resolve(output,`${shot.id}.webp`),Buffer.from(shot.image.split(',')[1],'base64'));delete shot.image;}
 await writeFile(resolve(output,'camera.json'),JSON.stringify(shots,null,2));
 const selected=shots.find(shot=>shot.id==='g'),asset=resolve('src/ui-mission/shiretoko-deployment.webp');
 await mkdir(resolve('src/ui-mission'),{recursive:true});await copyFile(resolve(output,'g.webp'),asset);
 const bytes=await readFile(asset),manifest=JSON.parse(await readFile(resolve('public/home-map/manifest.json'),'utf8'));
 const metadata={kind:'static photograph rendered from the authored Shiretoko world',source:'public/home-map/shiretoko.html',sourceDataSha256:manifest.sourceData.sha256,sourceModelSha256:manifest.sourceModel.sha256,camera:selected,resolution:[1800,1000],renderer:{quality:'balanced',toneMapping:'ACESFilmicToneMapping',exposure:1.05,outputColorSpace:'SRGBColorSpace',pixelRatio:1},image:{path:'src/ui-mission/shiretoko-deployment.webp',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},runtime:'Inline static photo; no additional 3D scene is created for the loading dialog.'};
 await writeFile(resolve('src/ui-mission/shiretoko-deployment.metadata.json'),JSON.stringify(metadata,null,2)+'\n');
 console.log(JSON.stringify(metadata));
 const styles=(await readFile(resolve('src/style.css'),'utf8'))+'\n'+await readFile(resolve('src/mission/mission.css'),'utf8');
 await page.setContent(`<style>${styles}</style><dialog id="deployment-loading" class="deployment-loading" aria-labelledby="deployment-title"><section><span>DEPLOY / SHIRETOKO</span><h2 id="deployment-title">知床へ出撃</h2><p id="deployment-message" role="status">新しい地形・家・山道を読み込んでいます…</p><small class="deployment-note">準備が整うと、始まりの家から探索が始まります。</small><button type="button">HOMEに戻る</button></section></dialog>`);
 await page.evaluate(async image=>{const dialog=document.getElementById('deployment-loading');dialog.style.setProperty('--deployment-image',`url("${image}")`);dialog.showModal();const preview=new Image();preview.src=image;await preview.decode();},`data:image/webp;base64,${bytes.toString('base64')}`);
 await page.screenshot({path:resolve(output,'loading-desktop.png')});
 await page.close();
}finally{await browser.close();}
