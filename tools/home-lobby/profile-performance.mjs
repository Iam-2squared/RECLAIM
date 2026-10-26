import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.argv[2]??'http://127.0.0.1:5173/',label=process.argv[3]??'after';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label');
await mkdir('release/performance',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('body[data-ready="true"]').waitFor({timeout:120000});
 const setup=await page.evaluate(async()=>{
  const [T,{Mission},{loadAuthoredMapData},{createAuthoredMapWorld},{authoredCampaignStore},{defaults}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/mission/runtime.ts'),import('/src/world/authored-map-data.ts'),import('/src/world/authored-map-world.ts'),import('/src/campaign/authored-world.ts'),import('/src/home-state.ts')]);
  const started=performance.now(),data=await loadAuthoredMapData(),decoded=performance.now(),world=await createAuthoredMapWorld(data,'balanced'),built=performance.now();
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'1'});document.body.append(renderer.domElement);document.querySelector('#title-screen').hidden=true;document.querySelector('#home-screen').hidden=true;document.querySelector('#mission-screen').hidden=false;document.body.dataset.screen='mission';
  const m=new Mission(renderer,authoredCampaignStore(null),'shiretoko','balanced',defaults(),{returnHome(){},announce(){},invalidate(){},effect(){},stopEffects(){}},null,true,'jonesy',world);
  await m.actors.load();m.startMouseLook(true);m.takeDamage=()=>{};
  const p=m.horde.road.at(80),ahead=m.horde.road.at(120);m.controller.restore({...p,yaw:Math.atan2(p.x-ahead.x,p.z-ahead.z),pitch:-.08});
  m.loader.update(p.x,p.z);m.updateCamera();m.updateVisuals(0);renderer.render(world.scene,m.camera);renderer.getContext().finish();
  window.__performanceFixture={m,renderer,world,T};
  return{decodeMs:decoded-started,worldBuildMs:built-decoded,actorLoadMs:performance.now()-built,world:world.stats()};
 });
 const session=await page.context().newCDPSession(page);await session.send('Profiler.enable');await session.send('Profiler.start');
 const cases=await page.evaluate(()=>{
  const {m,renderer,world}=window.__performanceFixture,gl=renderer.getContext(),results=[];
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]??0;
  for(const count of [2,50]){
   if(count===50){
    for(let i=m.horde.units.length;i<50;i++){const kind=(i+1)%2?'humanoid':'drone',point=m.horde.road.at(90+i*.8);m.horde.addUnit(kind,point,i+1,false,90+i*.8);}
    m.horde.scheduled=50;
   }
   for(let i=0;i<m.horde.units.length;i++){const u=m.horde.units[i],p=m.horde.road.at(92+i*.8);u.machine.position={...p,y:world.terrain.heightAt(p.x,p.z,p.y)+(u.kind==='drone'?1.85:0)};u.roadDistance=92+i*.8;u.lane='road';Object.assign(u.machine.origin,p);}
   m.paused=false;for(let i=0;i<8;i++){m.step(1/60);m.updateCamera();m.updateVisuals(1/60);}
   const step=[],visual=[],camera=[],render=[],counts={emptyProjectileTicks:0,enemyVisualUpdates:0};
   const originalTick=m.projectiles.tick.bind(m.projectiles),originalEnemy=m.actors.setEnemyUnit.bind(m.actors);
   m.projectiles.tick=(...args)=>{counts.emptyProjectileTicks++;return originalTick(...args);};m.actors.setEnemyUnit=(...args)=>{counts.enemyVisualUpdates++;return originalEnemy(...args);};
   for(let frame=0;frame<90;frame++){let t=performance.now();m.step(1/60);step.push(performance.now()-t);t=performance.now();m.updateCamera();camera.push(performance.now()-t);t=performance.now();m.updateVisuals(1/60);visual.push(performance.now()-t);}
   m.projectiles.tick=originalTick;m.actors.setEnemyUnit=originalEnemy;
   for(let frame=0;frame<3;frame++){const t=performance.now();renderer.render(world.scene,m.camera);gl.finish();render.push(performance.now()-t);}
   results.push({enemies:count,stepMs:median(step),cameraMs:median(camera),visualMs:median(visual),renderAndGpuWaitMs:median(render),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,counts,world:world.stats(),actorUnits:m.actors.snapshot().enemyUnits.length});
  }
  m.pause(false);gl.finish();let visualCalls=0;const visual=m.updateVisuals.bind(m);m.updateVisuals=(...args)=>{visualCalls++;return visual(...args);};const frames=m.frames,t=performance.now();for(let i=0;i<30;i++)m.update(1/60);const paused={cpuMs:performance.now()-t,visualCalls,submittedFrames:m.frames-frames};m.updateVisuals=visual;
  return{results,paused,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null};
 });
 const profile=await session.send('Profiler.stop');await writeFile(`release/performance/${label}.cpuprofile`,JSON.stringify(profile.profile));
 await page.screenshot({path:`release/performance/${label}.png`});
 await writeFile(`release/performance/${label}.json`,JSON.stringify({base,label,setup,cases,errors,note:'Same map, models, camera, 1280x720/DPR1 balanced, synthetic fixed placement of 2/50 actors; CPU timings and draw calls are comparison probes, not end-user FPS.'},null,2));
 console.log(JSON.stringify({label,setup:{decodeMs:setup.decodeMs,worldBuildMs:setup.worldBuildMs},...cases,errors}));
 await page.evaluate(()=>window.__performanceFixture.m.dispose());
}finally{await browser.close();}
