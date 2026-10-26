import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('release',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:90000});
 const initial=await page.evaluate(async()=>{
  const [T,{Mission},{loadAuthoredMapData},{createAuthoredMapWorld},{authoredCampaignStore},{defaults}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/mission/runtime.ts'),import('/src/world/authored-map-data.ts'),import('/src/world/authored-map-world.ts'),import('/src/campaign/authored-world.ts'),import('/src/home-state.ts')]);
  const data=await loadAuthoredMapData(),world=await createAuthoredMapWorld(data,'low'),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'1'});document.body.append(renderer.domElement);
  document.querySelector('#title-screen').hidden=true;document.querySelector('#home-screen').hidden=true;document.querySelector('#mission-screen').hidden=false;document.body.dataset.screen='mission';
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},store=authoredCampaignStore(storage),messages=[];
  const m=new Mission(renderer,store,'shiretoko','low',defaults(),{returnHome(){},announce:s=>messages.push(s),invalidate(){},effect(){},stopEffects(){}},null,false,'jonesy',world);
  window.__hordeTest={m,renderer,values,messages};
  await m.actors.load();m.updateVisuals(0);m.render();return m.snapshot();
 });
 assert.equal(initial.horde.spawned,2);assert.equal(initial.encounter.enemyBars,2);assert.equal(initial.encounter.deviceBars,2);assert.equal(initial.encounter.markers,1);assert.equal(initial.player.hp,100);assert.equal(initial.shield,0);
 assert.ok(initial.horde.devices.every(device=>device.hp===500&&device.maxHp===500));assert.equal(initial.horde.target,50);assert.equal(initial.horde.nextSpawnIn,5);
 assert.equal(await page.locator('#player-health-bar').getAttribute('aria-valuenow'),'100');
 assert.equal(await page.locator('#player-shield-bar').getAttribute('aria-valuenow'),'0');
 const combat=await page.evaluate(()=>{
  const {m}=window.__hordeTest;m.skipOpening();m.startMouseLook(true);m.keys.add('KeyW');for(let i=0;i<190;i++)m.step(1/60);m.keys.clear();
  const unit=m.horde.units.find(u=>u.kind==='humanoid'),p=m.horde.road.at(Math.max(1,unit.roadDistance-5));m.controller.restore({...p,y:m.loader.terrain.heightAt(p.x,p.z,p.y),yaw:0,pitch:0});
  const aim={x:unit.position.x,y:unit.position.y+1,z:unit.position.z},eye={...m.controller.position,y:m.controller.position.y+1.62},dx=aim.x-eye.x,dz=aim.z-eye.z;
  m.controller.yaw=Math.atan2(-dx,-dz);m.controller.pitch=Math.atan2(aim.y-eye.y,Math.hypot(dx,dz));m.updateCamera();m.updateVisuals(0);
  const hp=unit.hp;m.fireShot({id:101,kind:'assault',damage:8,speed:250,range:85,spread:0});
  m.weapons.clearInput();for(let i=0;i<15;i++)m.step(1/60);m.updateVisuals(.01);m.updateHUD(true);m.render();
  return {before:hp,after:unit.hp,unit:unit.snapshot(),snapshot:m.snapshot()};
 });
 assert.equal(combat.snapshot.storyStep,4);assert.equal(combat.before-combat.after,8,'Actual projectile missed intended humanoid');assert.ok(combat.snapshot.encounter.activeDamage>0);assert.equal(combat.snapshot.hits,1);
 await page.screenshot({path:'release/HORDE-road-damage.png'});
 const devices=await page.evaluate(()=>{
  const {m}=window.__hordeTest;m.startMouseLook(true);
  const device=m.horde.devices.find(d=>d.kind==='humanoid'),p={x:device.position.x,y:device.position.y,z:device.position.z-6};
  if(!m.controller.restore({...p,yaw:Math.PI,pitch:0}))throw Error('Warehouse shooting position blocked');
  m.controller.yaw=Math.PI;m.controller.pitch=-.07;m.updateCamera();m.updateVisuals(0);
  let afterTen=0;const shotsToDestroy=Math.ceil(device.maxHp/8);
  // Isolate projectile damage from enemy scheduling here. Production scheduling
  // is independently tested at its real 5-second interval and 240-second cap.
  for(let shot=0;shot<shotsToDestroy;shot++){
   m.fireShot({id:200+shot,kind:'assault',damage:8,speed:250,range:85,spread:0});
   for(let i=0;i<12;i++){const frame=m.projectiles.tick(m.shotWorld(),1/120);for(const receipt of frame.impacts){m.effects.impact(receipt.impact);m.acceptHit(receipt.impact.targetId,receipt.damage,receipt.impact);}m.effects.step(1/120,m.projectiles.visibleTracers);}
   if(shot===9)afterTen=device.hp;
  }
  m.updateVisuals(.01);m.updateHUD(true);m.render();return {shotsToDestroy,afterTen,snapshot:m.snapshot(),messages:window.__hordeTest.messages};
 });
 assert.equal(devices.shotsToDestroy,63);assert.equal(devices.afterTen,420);assert.equal(devices.snapshot.horde.devices.find(d=>d.kind==='drone').hp,500);
 assert.equal(devices.snapshot.horde.devices.find(d=>d.kind==='humanoid').hp,0,'Actual gunfire did not destroy device');assert.ok(devices.messages.some(s=>s.includes('製造装置を破壊')));
 await page.screenshot({path:'release/HORDE-warehouse-device.png'});
 const death=await page.evaluate(()=>{
  const {m,values}=window.__hordeTest;m.takeDamage(100);m.updateHUD(true);const down={snapshot:m.snapshot(),saved:[...values.values()].map(v=>JSON.parse(v))};
  for(let i=0;i<25;i++)m.update(.1);const returned=m.snapshot();return{down,returned,saved:[...values.values()].map(v=>JSON.parse(v))};
 });
 assert.equal(death.down.snapshot.player.hp,0);assert.equal(death.down.saved[0].introStep,0);assert.equal(death.down.saved[0].checkpoint,null);
 assert.equal(death.returned.player.hp,100);assert.equal(death.returned.storyStep,0);assert.equal(death.returned.horde.elapsed,0);assert.equal(death.returned.horde.spawned,2);assert.ok(death.returned.horde.devices.every(d=>d.hp===d.maxHp));assert.ok(Math.abs(death.returned.player.z-597)<.1);assert.ok(death.returned.paused);
 await page.screenshot({path:'release/HORDE-return-home.png'});
 const cap=await page.evaluate(visualOnly=>{
  const {m}=window.__hordeTest;
  // Advance the same production director, bypassing wall time only in this test.
  if(!visualOnly)m.horde.step(241,m.controller.position,{combatEnabled:false});m.updateVisuals(0);m.render();const full=m.snapshot();m.dispose();return{full,disposed:m.encounter.snapshot(),actors:m.actors.snapshot()};
 },process.argv.includes('--visual-only'));
 if(!process.argv.includes('--visual-only')){assert.equal(cap.full.horde.spawned,50);assert.equal(cap.full.actors.enemyUnits.length,50);assert.equal(cap.full.encounter.enemyBars,50);assert.ok(cap.full.actors.enemyUnits.every(u=>u.loaded&&!u.fallback));}assert.equal(cap.disposed.resources.textures,0);assert.deepEqual(errors,[]);
 await writeFile(process.argv.includes('--visual-only')?'release/HORDE-visual-check.json':'release/HORDE-runtime-check.json',JSON.stringify({errors,initial,combat,devices,death,cap},null,2));
 console.log(process.argv.includes('--visual-only')?'PASS: final health-bar visuals, actual projectile damage, device destruction, automatic house return and bounded disposal.':'PASS: actual map, 2 initial enemies, overhead health, projectile damage numbers, destructible warehouse device, death save reset and automatic house return, production 50-unit schedule and real actor models, bounded disposal.');
}finally{await browser.close();}

