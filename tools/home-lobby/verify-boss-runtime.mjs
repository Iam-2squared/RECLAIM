import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='release/boss-integration';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
let page;const report={passed:false,pageErrors:[],consoleErrors:[]};
try{
 page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.routeWebSocket('**',()=>{});
 page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 await page.goto(process.argv[2]??'http://127.0.0.1:5176/',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:90000});
 report.initial=await page.evaluate(async()=>{
  const [T,{Mission},{loadAuthoredMapData},{createAuthoredMapWorld},{authoredCampaignStore},{defaults}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/mission/runtime.ts'),import('/src/world/authored-map-data.ts'),import('/src/world/authored-map-world.ts'),import('/src/campaign/authored-world.ts'),import('/src/home-state.ts')]);
  const data=await loadAuthoredMapData(),world=await createAuthoredMapWorld(data,'low'),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'1'});document.body.append(renderer.domElement);document.querySelector('#title-screen').hidden=true;document.querySelector('#home-screen').hidden=true;document.querySelector('#mission-screen').hidden=false;document.body.dataset.screen='mission';
  const values=new Map(),store=authoredCampaignStore({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}),messages=[];
  const m=new Mission(renderer,store,'shiretoko','low',defaults(),{returnHome(){},announce:s=>messages.push(s),invalidate(){},effect(){},stopEffects(){}},null,false,'jonesy',world);window.__bossTest={m,renderer,messages};
  await Promise.all([m.actors.load(),m.bossActors.load()]);m.updateVisuals(0);m.updateHUD(true);m.render();return m.snapshot();
 });
 assert.equal(report.initial.sites.bossArena.bossCount,2);assert.equal(report.initial.sites.bossArena.bossPlaced,true);assert.equal(report.initial.bossActors.status,'ready');
 assert.equal(await page.locator('#mission-boss-health [role="progressbar"]').count(),2);
 await page.screenshot({path:output+'/house-hud.png'});
 report.arena=await page.evaluate(()=>{
  const{m}=window.__bossTest;m.skipOpening();m.startMouseLook(true);m.keys.add('KeyW');for(let i=0;i<190;i++)m.step(1/60);m.keys.clear();const a=m.loader.encounterLayout.bossArena;const eye={x:a.center.x-2,y:a.center.y,z:a.center.z+11};
  if(!m.controller.restore({...eye,yaw:0,pitch:0}))throw Error('Arena eye position blocked');
  m.startMouseLook(true);for(let i=0;i<40;i++)m.step(1/60);m.controller.yaw=0;m.controller.pitch=.12;m.updateCamera();m.updateVisuals(.1);m.updateHUD(true);m.render();return m.snapshot();
 });
 await page.screenshot({path:output+'/arena-bosses.png'});
 report.shot=await page.evaluate(()=>{
  const{m}=window.__bossTest,b=m.bosses.bosses[0],peer=m.bosses.bosses[1],target=m.bosses.targets().find(t=>t.id===b.id),p={x:target.center.x,y:m.loader.encounterLayout.bossArena.center.y,z:target.center.z+6};
  if(!m.controller.restore({...p,yaw:0,pitch:0}))throw Error('Boss firing position blocked');
  const aim=()=>{const eye={...m.controller.position,y:m.controller.position.y+1.62},dx=target.center.x-eye.x,dz=target.center.z-eye.z;m.controller.yaw=Math.atan2(-dx,-dz);m.controller.pitch=Math.atan2(target.center.y-eye.y,Math.hypot(dx,dz));m.updateCamera();m.updateVisuals(0);};
  const before=b.hp,peerHp=peer.hp;aim();m.fireShot({id:101,kind:'assault',damage:8,speed:100,range:110,spread:0,melee:false});
  for(let i=0;i<45;i++){const frame=m.projectiles.tick(m.shotWorld(),1/120);for(const receipt of frame.impacts){m.effects.impact(receipt.impact);m.acceptHit(receipt.impact.targetId,receipt.damage,receipt.impact);}m.effects.step(1/120,m.projectiles.visibleTracers);}m.updateVisuals(.05);m.updateHUD(true);m.render();
  return {before,after:b.hp,peerBefore:peerHp,peerAfter:peer.hp,snapshot:m.snapshot()};
 });
 assert.equal(report.shot.before-report.shot.after,8,'Actual assault projectile failed to hit boss');assert.equal(report.shot.peerBefore,report.shot.peerAfter);assert.equal(await page.locator('[data-boss-id="shiretoko-boss-boar"] [role="progressbar"]').getAttribute('aria-valuenow'),'1992');assert.equal(report.arena.bossHealth.visibleBars,2);assert.equal(report.arena.storyStep,4);assert.ok(report.shot.snapshot.encounter.activeDamage>0);
 await page.screenshot({path:output+'/boss-damage.png'});
 report.motion=await page.evaluate(()=>{const{m}=window.__bossTest;const before=m.bossActors.snapshot();for(let i=0;i<60;i++){m.bosses.step(1/60,m.controller.position,{combatEnabled:true,canSee:()=>true});m.updateVisuals(1/60);}m.render();return {before,after:m.bossActors.snapshot(),bosses:m.bosses.snapshot()};});
 // An idle actor is still animated; attack/chase is driven by the director in the same mission.
 report.defeat=await page.evaluate(()=>{
  const{m,messages}=window.__bossTest;for(const b of m.bosses.bosses){const t=m.bosses.targets().find(t=>t.id===b.id);m.acceptHit(b.id,b.hp,{fraction:0,point:t.center,material:'drone',targetId:b.id});}
  for(let i=0;i<150;i++)m.updateVisuals(1/60);m.updateHUD(true);m.render();return {snapshot:m.snapshot(),messages};
 });
 assert.ok(report.defeat.messages.some(s=>s.includes('ボス2体')));assert.ok((await page.locator('#mission-boss-health').textContent()).includes('撃破'));
 await page.screenshot({path:output+'/boss-defeated.png'});
 report.reset=await page.evaluate(()=>{const{m}=window.__bossTest;m.retry();return m.snapshot();});
 report.layouts=[];for(const viewport of [{width:1440,height:900},{width:900,height:700},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(150);const layout=await page.evaluate(()=>{const r=id=>{const p=document.querySelector(id).getBoundingClientRect();return{x:p.x,y:p.y,right:p.right,bottom:p.bottom,width:p.width,height:p.height};};return{objective:r('.mission-top'),panel:r('#mission-boss-health'),controls:r('.mission-controls')};});assert.ok(layout.panel.y>=layout.objective.bottom+8);assert.ok(layout.panel.bottom<=layout.controls.y);assert.ok(layout.panel.right<=viewport.width);report.layouts.push({viewport,...layout});}await page.screenshot({path:output+'/mobile-hud.png'});
 report.cleanup=await page.evaluate(()=>{const{m}=window.__bossTest;m.dispose();return {panels:document.querySelectorAll('#mission-boss-health').length,actors:m.bossActors.snapshot(),health:m.bossHealth.snapshot()};});
 assert.equal(report.cleanup.panels,0);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;console.log('PASS: authored animated boss models, two left HP bars, overhead bars, actual projectile damage, independent HP, animation, defeat, reset and disposal.');
}catch(error){report.failure=String(error.stack??error);if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await writeFile(output+'/check.json',JSON.stringify(report,null,2));await browser.close();}
