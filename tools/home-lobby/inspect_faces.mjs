import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory=resolve('release/animation-audit');await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
 const page=await browser.newPage({viewport:{width:600,height:600},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.argv[2]??'http://127.0.0.1:5173/');
 await page.locator('body[data-ready="true"]').waitFor();
 await page.evaluate(async()=>{
  const {HomeLobbyScene}=await import('/src/home-lobby-scene.ts');
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:9999;background:#264a6b';document.body.append(host);
  const scene=new HomeLobbyScene(host);window.__FACE_AUDIT__=scene;scene.setFormation(1);scene.setCharacter('ramirez');scene.setReducedMotion(true);scene.setActive(true);await scene.ready();
  scene.camera.position.set(-.65,1.62,1.27);scene.camera.lookAt(-.65,1.62,.35);scene.camera.updateMatrixWorld();scene.invalidate();
 });
 await page.waitForFunction(()=>window.__FACE_AUDIT__?.snapshot().frames>0);
 await page.screenshot({path:resolve(directory,'ramirez-normal.png')});
 for(const mode of ['recomputed-normals','no-normal-map','front-side','no-normal-front-side','bind-pose','uv1','flat-white','flip-v']){
  await page.evaluate(mode=>{
   const scene=window.__FACE_AUDIT__;
   let matched=0;scene.scene.traverse(object=>{
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
     if(!/head/i.test(material.name))continue;
     matched++;
     if(!material.userData.savedFace)material.userData.savedFace={normalMap:material.normalMap,side:material.side};
     material.normalMap=['recomputed-normals','front-side','bind-pose','uv1'].includes(mode)?material.userData.savedFace.normalMap:null;
     material.side=['recomputed-normals','no-normal-map','bind-pose','uv1'].includes(mode)?material.userData.savedFace.side:0;
     if(mode==='recomputed-normals')object.geometry.computeVertexNormals();
     if(mode==='uv1'&&material.map)material.map.channel=1;
     if(mode==='flat-white'){material.userData.faceMap=material.map;material.map=null;material.metalness=0;material.roughness=1;}
     if(mode==='flip-v'){material.map=material.userData.faceMap;material.map.channel=0;const uv=object.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));uv.needsUpdate=true;}
     material.needsUpdate=true;
    }
   });
   if(mode==='bind-pose')for(const actor of scene.actors)actor.mixer.stopAllAction();
   if(mode==='uv1')for(const actor of scene.actors){actor.action.reset().play();actor.mixer.setTime(0);}
   scene.invalidate();window.__FACE_TRACE__??=[];window.__FACE_TRACE__.push({mode,matched,frames:scene.snapshot().frames});
  },mode);
  await page.waitForTimeout(150);await page.screenshot({path:resolve(directory,`ramirez-${mode}.png`)});
 }
 await writeFile(resolve(directory,'face-check.json'),JSON.stringify({errors,lobby:await page.evaluate(()=>window.__FACE_AUDIT__.snapshot()),trace:await page.evaluate(()=>window.__FACE_TRACE__)},null,2));
 if(errors.length)throw Error(errors.join('\n'));
} finally {await browser.close();}
