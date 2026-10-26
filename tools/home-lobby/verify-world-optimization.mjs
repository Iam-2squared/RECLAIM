import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const directory=resolve('release/performance/world');await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}),report={};
try{
 for(const [mode,origin]of[['before','http://127.0.0.1:5175'],['after','http://127.0.0.1:5176']]){
  const context=await browser.newContext({viewport:{width:900,height:600}}),page=await context.newPage();
  await page.route('**/__world-optimization-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
  await page.goto(`${origin}/__world-optimization-check`);
  const captures=await page.evaluate(async()=>{
   const T=await import('/node_modules/.vite/deps/three.js'),{loadAuthoredMapData}=await import('/src/world/authored-map-data.ts'),{createAuthoredMapWorld}=await import('/src/world/authored-map-world.ts');
   const started=performance.now(),world=await createAuthoredMapWorld(await loadAuthoredMapData(),'balanced'),loadMs=performance.now()-started;
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,600);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
   const camera=new T.PerspectiveCamera(68,1.5,.055,3000),captures=[];
   for(const[id,position,target]of[['cabin',[-169,83.52,597],[-169,83.3,590]],['yard',[-165,84,577],[-170,84,604]],['warehouse',[-191,112,-99],[-201,111.3,-90]],['panorama',[-196,98,654],[-100,105,180]],['mountain',[-156,109,-180],[-120,130,-300]]]){
    world.update(position[0],position[2]);camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();
    renderer.render(world.scene,camera);const begin=performance.now();renderer.render(world.scene,camera);const renderMs=performance.now()-begin;
    captures.push({id,position,target,renderMs,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,image:renderer.domElement.toDataURL('image/png')});
   }
   const stats=world.stats();world.dispose();renderer.dispose();renderer.forceContextLoss();return{loadMs,stats,captures};
  });
  for(const capture of captures.captures){await writeFile(resolve(directory,`${mode}-${capture.id}.png`),Buffer.from(capture.image.split(',')[1],'base64'));delete capture.image;}
  report[mode]=captures;await context.close();
 }
 report.parity=[];
 for(const shot of report.before.captures){const before=await readFile(resolve(directory,`before-${shot.id}.png`)),after=await readFile(resolve(directory,`after-${shot.id}.png`));report.parity.push({id:shot.id,identical:before.equals(after),sha256:createHash('sha256').update(after).digest('hex'),beforeCalls:shot.calls,afterCalls:report.after.captures.find(capture=>capture.id===shot.id).calls});}
 await writeFile(resolve(directory,'check.json'),JSON.stringify(report,null,2));assert.ok(report.parity.every(shot=>shot.identical),'A source-map view changed pixels.');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
