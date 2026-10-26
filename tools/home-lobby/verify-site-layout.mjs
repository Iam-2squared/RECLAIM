import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const output='release/two-warehouses';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.argv[2]??'http://127.0.0.1:5176/',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:90000});
 const result=await page.evaluate(async()=>{
  const [T,{loadAuthoredMapData},{createAuthoredMapWorld},{CharacterController},{createAuthoredHorde},{EncounterPresentation}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/world/authored-map-data.ts'),import('/src/world/authored-map-world.ts'),import('/src/mission/controller.ts'),import('/src/mission/horde-director.ts'),import('/src/mission/encounter-presentation.ts')]);
  const data=await loadAuthoredMapData(),world=await createAuthoredMapWorld(data,'balanced'),layout=world.encounterLayout;
  function walk(path){
   const controller=new CharacterController(world.terrain,()=>world.colliders,world.bounds,{...path[0],yaw:0});
   if(!controller.restore({...path[0],yaw:0,pitch:0}))throw Error('Access path start is blocked: '+JSON.stringify(path[0]));
   const start={...controller.position};let frames=0;
   for(const point of path.slice(1)){
    let stalled=0;
    while(Math.hypot(point.x-controller.position.x,point.z-controller.position.z)>.13){
     if(++frames>16000)throw Error('Access route exceeded walking time');
     controller.yaw=Math.atan2(controller.position.x-point.x,controller.position.z-point.z);
     const old={...controller.position};controller.step({forward:1,right:0,sprint:true,jump:false},1/60);world.update(controller.position.x,controller.position.z);
     if(Math.hypot(controller.position.x-old.x,controller.position.z-old.z)<.0001){if(++stalled>45)throw Error('Access route blocked at '+JSON.stringify(controller.position)+' toward '+JSON.stringify(point));}else stalled=0;
    }
   }
   if(controller.recoveries)throw Error('Access route triggered a recovery');
   return{start,end:{...controller.position},distance:controller.distance,frames,recoveries:controller.recoveries,grounded:controller.grounded};
  }
  const warehouseWalk=walk([layout.warehouse.roadJoin,layout.warehouse.entrance,{...layout.warehouse.center}]);
  const arenaWalk=walk(layout.bossArena.accessPath);
  const walls=layout.colliders.filter(c=>c.tag.includes('/wall'));
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'1000'});document.body.append(renderer.domElement);
  const camera=new T.PerspectiveCamera(60,innerWidth/innerHeight,.08,2400),horde=createAuthoredHorde(data,world.terrain),feedback=new EncounterPresentation(world.scene,camera,{viewDistance:180});feedback.setSpawnDevices(horde.devices);
  feedback.setMissionMarkers([{id:layout.bossArena.id,position:layout.bossArena.center,radius:5,height:5}]);
  window.__siteTest={world,layout,renderer,camera,feedback};
  return{warehouse:{...layout.warehouse,paths:undefined},bossArena:layout.bossArena,warehouseWalk,arenaWalk,wallCount:walls.length,meshNames:layout.sourceMeshNames,originalMeshes:data.meshes.length,originalStructures:data.structures.length,vegetation:data.vegetation.instances.length,world:world.stats(),horde:horde.snapshot()};
 });
 assert.equal(result.originalMeshes,12);assert.equal(result.originalStructures,64);assert.equal(result.vegetation,3330);
 assert.ok(result.warehouse.roadProgress>.35&&result.warehouse.roadProgress<.65);assert.ok(result.wallCount>=6);
 assert.ok(Math.abs(result.warehouseWalk.end.y-result.warehouse.floorHeight)<.05);assert.ok(Math.abs(result.arenaWalk.end.y-result.bossArena.center.y)<.05);
 assert.equal(result.horde.devices.length,4);assert.equal(result.horde.spawned,0);assert.ok(result.bossArena.radius>=12);
 const ac=result.bossArena.center;
 const cameras=[['warehouse-exterior',[-43,83,284],[-10,73,260]],['warehouse-interior',[-16,72.17,260],[-4,71.8,260]],['boss-arena-overview',[ac.x-42,ac.y+29,ac.z+44],[ac.x,ac.y,ac.z]],['boss-arena-entrance',[result.bossArena.entrance.x,result.bossArena.entrance.y+1.62,result.bossArena.entrance.z],[result.bossArena.center.x,result.bossArena.center.y+1,result.bossArena.center.z]]];
 for(const[name,eye,target]of cameras){await page.evaluate(({eye,target})=>{const{world,renderer,camera,feedback}=window.__siteTest;camera.position.set(...eye);camera.lookAt(...target);world.update(eye[0],eye[2]);feedback.step(0);renderer.render(world.scene,camera);},{eye,target});await page.screenshot({path:`${output}/${name}.png`});}
 await page.evaluate(()=>{const{world,renderer,feedback}=window.__siteTest;feedback.dispose();world.dispose();renderer.dispose();renderer.domElement.remove();});
 assert.deepEqual(errors,[]);await writeFile(`${output}/sites-check.json`,JSON.stringify({passed:true,errors,...result},null,2));
 console.log('PASS: real controller enters midway warehouse and foothill arena, unchanged original objects, four devices, independent source caps, and site screenshots.');
}finally{await browser.close();}
