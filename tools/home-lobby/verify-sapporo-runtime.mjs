import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

// Run against Vite, so the checks exercise the actual Mission, city physics,
// decoded character models and projectile pipeline instead of test doubles.
const output='release/sapporo-integration/runtime';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const report={passed:false,pageErrors:[],consoleErrors:[],failedRequests:[]};
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(120000);
 // Disable Vite HMR only; /@vite/client is still needed by CSS imports.
 await page.routeWebSocket('**',()=>{});
 page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
 page.on('response',response=>{if(response.status()>=400)report.failedRequests.push({url:response.url(),status:response.status()});});
 await page.goto(process.argv[2]??'http://127.0.0.1:5182/',{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('body[data-ready="true"]').waitFor();
 report.initial=await page.evaluate(async()=>{
  const [T,{Mission},{loadSapporoMapWorld},{authoredCampaignStore,AUTHORED_CAMPAIGN_KEY},{AUTHORED_MAP_META},{defaults},{resolveAimImpact}]=await Promise.all([
   import('/node_modules/.vite/deps/three.js'),import('/src/mission/runtime.ts'),import('/src/world/sapporo-map-world.ts'),import('/src/campaign/authored-world.ts'),import('/src/world/authored-map-meta.ts'),import('/src/home-state.ts'),import('/src/mission/trajectory-effects.ts'),
  ]);
  const world=await loadSapporoMapWorld('low'),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'1'});document.body.append(renderer.domElement);
  document.querySelector('#title-screen').hidden=true;document.querySelector('#home-screen').hidden=true;document.querySelector('#mission-screen').hidden=false;document.body.dataset.screen='mission';
  // Isolated storage with a real, valid Shiretoko passage receipt. Testing retry
  // must not overwrite the player's local save or erase their previous region.
  const values=new Map([[AUTHORED_CAMPAIGN_KEY,JSON.stringify({version:1,introStep:4,droneDefeated:true,completedAreaIds:['shiretoko'],passages:[{areaId:'shiretoko',position:{x:AUTHORED_MAP_META.exit.x,y:AUTHORED_MAP_META.spawn.y,z:AUTHORED_MAP_META.exit.z},distance:1000,passedCheckpointIds:[AUTHORED_MAP_META.checkpoint.id],provisional:true}],checkpoint:null,traversal:null})]]);
  const store=authoredCampaignStore({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}),messages=[];
  const protectedProgress=()=>{const value=store.value;return {introStep:value.introStep,droneDefeated:value.droneDefeated,completedAreaIds:value.completedAreaIds,passages:value.passages};};
  const before=protectedProgress();
  const m=new Mission(renderer,store,'sapporo','low',defaults(),{returnHome(){},announce:text=>messages.push(text),invalidate(){},effect(){},stopEffects(){}},null,false,'jonesy',world);
  window.__sapporoTest={m,renderer,messages,protectedProgress,before,T,resolveAimImpact};
  await Promise.all([m.actors.load(),m.bossActors.load()]);
  m.updateCamera();m.updateVisuals(0);m.updateHUD(true);m.render();
  return {snapshot:m.snapshot(),protectedProgress:before,initialBossPanelHidden:document.querySelector('#mission-boss-health').hidden,blueLine:!!world.scene.getObjectByName('sapporo:blue-checkpoint-line')};
 });
 const initial=report.initial.snapshot;
 assert.equal(initial.areaId,'sapporo');assert.equal(initial.player.hp,100);
 assert.equal(initial.city.phase,1);assert.equal(initial.city.phaseSeconds,300);assert.equal(initial.city.spawned,50);assert.equal(initial.city.alive,50);
 assert.equal(initial.enemies.filter(unit=>unit.kind==='drone').length,25);assert.equal(initial.enemies.filter(unit=>unit.kind==='humanoid').length,25);
 assert.equal(initial.bosses.bosses.length,0);assert.equal(initial.bossActors.status,'ready');assert.deepEqual(initial.bossActors.errors,[]);
 assert.equal(report.initial.initialBossPanelHidden,true);assert.equal(report.initial.blueLine,true);
 assert.equal(initial.city.route.line,true);assert.equal(initial.city.route.color,'blue');assert.equal(initial.city.route.checkpoints,6);assert.equal(initial.city.route.arenas,2);assert.ok(initial.city.route.points>6);
 assert.deepEqual(report.initial.protectedProgress.completedAreaIds,['shiretoko']);
 await page.evaluate(()=>{const{m}=window.__sapporoTest;m.startMouseLook(true);m.render();});
 await page.screenshot({path:`${output}/arrival.png`});

 report.route=await page.evaluate(()=>{
  const{m}=window.__sapporoTest,route=m.loader.sapporoLayout.route,checkpoints=m.loader.sapporoLayout.checkpoints,samples=[];
  const segmentDistance=(point,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t);};
  const checkpointDistances=checkpoints.map(point=>({id:point.id,radius:point.radius,distance:Math.min(...route.slice(1).map((b,index)=>segmentDistance(point,route[index],b)))}));
  // Spread the real CharacterController checks over the whole path, including
  // turns and the park approach, rather than walking only a convenient origin.
  const used=new Set();
  for(let n=0;n<10;n++){
   let index=Math.min(route.length-2,Math.floor((route.length-1)*(n+.3)/10));
   for(let tries=0;tries<route.length;tries++,index=(index+1)%(route.length-1)){
    const a=route[index],b=route[index+1],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<3||used.has(index))continue;
    const start={x:a.x+(b.x-a.x)*.2,z:a.z+(b.z-a.z)*.2};start.y=m.loader.terrain.heightAt(start.x,start.z,a.y);
    const yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));
    if(!m.controller.restore({...start,yaw,pitch:0}))throw Error(`Blue route point ${index} cannot restore on dry, clear ground`);
    const recoveries=m.controller.recoveries,distance=m.controller.distance,expected=Math.min(3,length*.55),steps=Math.floor(expected/3.1*60);
    for(let i=0;i<steps;i++)m.controller.step({forward:1,right:0,sprint:false,jump:false},1/60);
    samples.push({index,start,end:{...m.controller.position},expected:steps*3.1/60,travelled:m.controller.distance-distance,grounded:m.controller.grounded,recoveries:m.controller.recoveries-recoveries,water:!!m.loader.terrain.inWater?.(m.controller.position.x,m.controller.position.z,m.controller.position.y)});used.add(index);break;
   }
  }
  m.controller.recover();m.controller.yaw=m.loader.area.spawn.yaw;m.controller.pitch=0;m.loader.update(m.controller.position.x,m.controller.position.z);m.updateCamera();m.updateVisuals(0);m.updateHUD(true);m.render();
  return {points:route.length,checkpointDistances,samples};
 });
 assert.equal(report.route.samples.length,10);
 for(const point of report.route.checkpointDistances)assert.ok(point.distance<=point.radius,`Route misses ${point.id}`);
 for(const sample of report.route.samples){assert.ok(sample.travelled>=sample.expected*.9,`Controller blocked on blue route segment ${sample.index}`);assert.equal(sample.recoveries,0);assert.equal(sample.water,false);assert.equal(sample.grounded,true);}

 report.pause=await page.evaluate(()=>{
  const{m}=window.__sapporoTest;m.pause();const before={city:m.sapporo.elapsed,boss:m.bosses.elapsed,elapsed:m.elapsed};
  for(let i=0;i<60;i++)m.update(.1);
  return {before,after:{city:m.sapporo.elapsed,boss:m.bosses.elapsed,elapsed:m.elapsed},paused:m.paused};
 });
 assert.equal(report.pause.paused,true);assert.deepEqual(report.pause.before,report.pause.after);

 const phase=async number=>page.evaluate(number=>{
  const{m}=window.__sapporoTest,target=(number-1)*300+.001;
  // Inject elapsed active-play time; pause behavior is tested separately above.
  // The production 300-second schedule stays unchanged for this verification.
  m.sapporo.step(Math.max(0,target-m.sapporo.elapsed),{x:10000,y:0,z:10000},{combatEnabled:false});
  m.startMouseLook(true);m.step(1/30);m.updateCamera();m.updateVisuals(0);m.updateHUD(true);m.render();return m.snapshot();
 },number);
 report.phase2=await phase(2);assert.equal(report.phase2.city.phase,2);assert.equal(report.phase2.city.spawned,100);assert.equal(report.phase2.bosses.bosses.length,0);
 report.phase3=await phase(3);assert.equal(report.phase3.city.phase,3);assert.equal(report.phase3.city.spawned,100);assert.deepEqual(report.phase3.bosses.bosses.map(b=>b.kind),['spider']);

 const fire=async kind=>page.evaluate(kind=>{
  const{m,T,resolveAimImpact}=window.__sapporoTest,boss=m.bosses.bosses.find(b=>b.kind===kind);if(!boss)throw Error(`${kind} is not active`);
  const targets=m.bosses.targets().filter(target=>target.id===boss.id),peers=m.bosses.bosses.filter(b=>b!==boss).map(b=>({id:b.id,hp:b.hp}));let firing=null;
  for(const radius of [8,12,16,20,25]){
   for(let index=0;index<24;index++){
    const angle=index*Math.PI/12,x=boss.position.x+Math.sin(angle)*radius,z=boss.position.z+Math.cos(angle)*radius,y=m.loader.terrain.heightAt(x,z,boss.position.y);
    if(!m.controller.restore({x,y,z,yaw:0,pitch:0}))continue;
    m.loader.update(x,z);
    for(const target of targets){
     const eye=new T.Vector3(x,y+1.62,z),to=new T.Vector3(target.center.x,target.center.y,target.center.z),impact=resolveAimImpact(eye,to,m.shotWorld());
     if(impact?.targetId!==boss.id)continue;
     const dx=to.x-eye.x,dz=to.z-eye.z;m.controller.yaw=Math.atan2(-dx,-dz);m.controller.pitch=Math.atan2(to.y-eye.y,Math.hypot(dx,dz));firing={position:{x,y,z},target:{...target.center}};break;
    }
    if(firing)break;
   }
   if(firing)break;
  }
  if(!firing)throw Error(`No safe unobstructed firing position for ${kind}`);
  m.startMouseLook(true);m.updateCamera();m.updateVisuals(0);const before=boss.hp;
  m.fireShot({id:kind==='spider'?101:102,kind:'assault',damage:8,speed:100,range:110,spread:0,melee:false});
  const receipts=[];for(let i=0;i<45;i++){
   const frame=m.projectiles.tick(m.shotWorld(),1/120);for(const receipt of frame.impacts){receipts.push({targetId:receipt.impact.targetId,damage:receipt.damage,material:receipt.impact.material});m.effects.impact(receipt.impact);m.acceptHit(receipt.impact.targetId,receipt.damage,receipt.impact);}
   m.effects.step(1/120,m.projectiles.visibleTracers);
  }
  m.updateVisuals(.05);m.updateHUD(true);m.render();
  return {kind,id:boss.id,firing,before,after:boss.hp,peersBefore:peers,peersAfter:m.bosses.bosses.filter(b=>b!==boss).map(b=>({id:b.id,hp:b.hp})),receipts,snapshot:m.snapshot()};
 },kind);
 report.spiderShot=await fire('spider');
 assert.equal(report.spiderShot.before,1000);assert.equal(report.spiderShot.after,992);assert.ok(report.spiderShot.snapshot.encounter.activeDamage>0);assert.ok(report.spiderShot.snapshot.bossHealth.visibleBars>=1);
 assert.equal(await page.locator(`[data-boss-id="${report.spiderShot.id}"] [role="progressbar"]`).getAttribute('aria-valuenow'),'992');
 await page.screenshot({path:`${output}/tower-boss-damage.png`});
 report.spiderMotion=await page.evaluate(()=>{const{m}=window.__sapporoTest;const before=m.bossActors.snapshot();for(let i=0;i<30;i++)m.updateVisuals(1/60);m.render();return{before,after:m.bossActors.snapshot()};});
 const spiderActor=report.spiderMotion.after.bosses.find(b=>b.kind==='spider');assert.equal(spiderActor.loaded,true);assert.equal(spiderActor.visible,true);assert.equal(spiderActor.clips.length,6);

 await page.evaluate(()=>{const{m}=window.__sapporoTest,b=m.bosses.bosses.find(b=>b.kind==='spider'),target=m.bosses.targets().find(t=>t.id===b.id);m.acceptHit(b.id,b.hp,{fraction:0,point:target.center,material:'drone',targetId:b.id});m.updateVisuals(.1);m.updateHUD(true);m.render();});
 report.phase4=await phase(4);assert.equal(report.phase4.city.phase,4);assert.equal(report.phase4.city.spawned,100);assert.deepEqual(report.phase4.bosses.bosses.map(b=>b.kind),['spider','snowblower']);
 report.snowblowerShot=await fire('snowblower');
 assert.equal(report.snowblowerShot.before,1000);assert.equal(report.snowblowerShot.after,992);assert.deepEqual(report.snowblowerShot.peersBefore,report.snowblowerShot.peersAfter);assert.ok(report.snowblowerShot.snapshot.encounter.activeDamage>0);
 assert.equal(await page.locator(`[data-boss-id="${report.snowblowerShot.id}"] [role="progressbar"]`).getAttribute('aria-valuenow'),'992');
 const bossModels=report.snowblowerShot.snapshot.bossActors;assert.equal(bossModels.status,'ready');assert.deepEqual(bossModels.errors,[]);
 for(const kind of ['spider','snowblower']){const actor=bossModels.bosses.find(b=>b.kind===kind);assert.equal(actor.loaded,true);assert.equal(actor.clips.length,6);assert.ok(actor.dimensions.height>2);}
 assert.equal(await page.locator('#mission-boss-health [role="progressbar"]').count(),2);
 await page.screenshot({path:`${output}/station-boss-damage.png`});

 report.layouts=[];
 for(const viewport of [{width:1440,height:900},{width:900,height:700},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>{const{m}=window.__sapporoTest;m.resize();m.updateCamera();m.updateVisuals(0);m.updateHUD(true);m.render();const rect=selector=>{const p=document.querySelector(selector).getBoundingClientRect();return{x:p.x,y:p.y,right:p.right,bottom:p.bottom,width:p.width,height:p.height};};return{objective:rect('.mission-top'),panel:rect('#mission-boss-health'),controls:rect('.mission-controls')};});
  assert.ok(layout.panel.width>0);assert.ok(layout.panel.x>=0);assert.ok(layout.panel.right<=viewport.width+1);assert.ok(layout.panel.y>=layout.objective.bottom+8);assert.ok(layout.panel.bottom<=layout.controls.y+1);
  report.layouts.push({viewport,...layout});
 }
 await page.screenshot({path:`${output}/mobile-hud.png`});
 await page.setViewportSize({width:1440,height:900});
 report.victory=await page.evaluate(()=>{const{m,messages}=window.__sapporoTest,b=m.bosses.bosses.find(b=>b.kind==='snowblower'),target=m.bosses.targets().find(t=>t.id===b.id);m.acceptHit(b.id,b.hp,{fraction:0,point:target.center,material:'drone',targetId:b.id});m.startMouseLook(true);m.step(1/30);m.resize();m.updateVisuals(.1);m.updateHUD(true);m.render();return{snapshot:m.snapshot(),title:document.querySelector('#mission-end-title').textContent,endShowing:m.endShowing,messages};});
 assert.equal(report.victory.snapshot.bosses.defeated,true);assert.equal(report.victory.endShowing,true);assert.equal(report.victory.snapshot.paused,true);assert.match(report.victory.title,/札幌駅.*制圧/);
 await page.screenshot({path:`${output}/station-victory.png`});
 report.retry=await page.evaluate(()=>{const{m,protectedProgress,before}=window.__sapporoTest;m.retry();return{snapshot:m.snapshot(),protectedBefore:before,protectedAfter:protectedProgress(),rows:document.querySelectorAll('#mission-boss-health [role="progressbar"]').length};});
 assert.equal(report.retry.snapshot.city.phase,1);assert.equal(report.retry.snapshot.city.elapsed,0);assert.equal(report.retry.snapshot.city.spawned,50);assert.equal(report.retry.snapshot.player.hp,100);assert.equal(report.retry.snapshot.bosses.bosses.length,0);assert.equal(report.retry.rows,0);assert.deepEqual(report.retry.protectedBefore,report.retry.protectedAfter);
 report.cleanup=await page.evaluate(()=>{const{m,renderer}=window.__sapporoTest;m.dispose();const result={disposed:m.disposed,world:m.loader.stats(),bossActors:m.bossActors.snapshot(),bossHealth:m.bossHealth.snapshot(),panels:document.querySelectorAll('#mission-boss-health').length};renderer.dispose();renderer.domElement.remove();return result;});
 assert.equal(report.cleanup.disposed,true);assert.equal(report.cleanup.world.disposed,true);assert.equal(report.cleanup.bossActors.status,'disposed');assert.equal(report.cleanup.panels,0);assert.equal(report.cleanup.bossHealth.capacity,0);
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.failedRequests,[]);
 report.passed=true;
 console.log('PASS: actual Sapporo world, 10 route controller samples, paused timer, 50→100→tower boss→station boss, animated GLBs, real projectile damage, HP bars, floating numbers, responsive HUD, victory, retry preserving Shiretoko and disposal.');
}catch(error){report.failure=String(error.stack??error);if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${output}/check.json`,JSON.stringify(report,null,2));await browser.close();}
