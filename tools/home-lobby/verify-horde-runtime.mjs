import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('release',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.RECLAIM_TEST_URL??process.argv.find(arg=>/^https?:/.test(arg))??'http://127.0.0.1:5176/',{waitUntil:'domcontentloaded',timeout:90000});
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
 assert.equal(initial.horde.spawned,0);assert.equal(initial.horde.units.length,0);assert.equal(initial.encounter.enemyBars,0);assert.equal(initial.encounter.deviceBars,4);assert.equal(initial.encounter.markers,1);assert.equal(initial.player.hp,100);assert.equal(initial.shield,0);
 assert.equal(initial.horde.devices.length,4);assert.ok(initial.horde.devices.every(device=>device.hp===500&&device.maxHp===500));assert.equal(initial.horde.target,50);assert.equal(initial.horde.nextSpawnIn,5);
 assert.deepEqual(initial.horde.sources.map(source=>source.target).sort((a,b)=>a-b),[20,30]);
 assert.ok(initial.horde.sources.every(source=>source.spawned===0));
 for(const source of initial.horde.sources)assert.deepEqual(initial.horde.devices.filter(device=>device.sourceId===source.id).map(device=>device.kind).sort(),['drone','humanoid']);
 assert.equal(initial.weapon.unlimitedReserve,true);assert.equal(initial.weapon.reserve,null);
 assert.ok((await page.locator('#mission-weapon').textContent()).includes('∞'),'Unlimited reserve is not visible in the HUD');
 assert.equal(await page.locator('#player-health-bar').getAttribute('aria-valuenow'),'100');
 assert.equal(await page.locator('#player-shield-bar').getAttribute('aria-valuenow'),'0');
 const combat=await page.evaluate(()=>{
  const {m}=window.__hordeTest;m.skipOpening();m.startMouseLook(true);m.keys.add('KeyW');for(let i=0;i<190;i++)m.step(1/60);m.keys.clear();
  // Initial roads are empty. Let a real human leave its warehouse along the
  // production route before moving the player nearby for a clear actual shot.
  let unit;
  for(let i=0;i<240&&!unit;i++){
   m.horde.step(.5,m.controller.position,{combatEnabled:false,canMove:(from,to,radius,kind)=>m.enemyCanMove(from,to,radius,kind==='drone')});
   unit=m.horde.units.find(u=>u.kind==='humanoid'&&u.hp>0&&u.lane==='road');
  }
  if(!unit)throw Error('No living human emerged from either warehouse within120 active seconds');
  const p=m.horde.road.at(Math.max(1,unit.roadDistance-4));
  if(!m.controller.restore({...p,y:m.loader.terrain.heightAt(p.x,p.z,p.y),yaw:0,pitch:0}))throw Error('Road shooting position blocked');
  const aim={x:unit.position.x,y:unit.position.y+1,z:unit.position.z},eye={...m.controller.position,y:m.controller.position.y+1.62},dx=aim.x-eye.x,dz=aim.z-eye.z;
  m.controller.yaw=Math.atan2(-dx,-dz);m.controller.pitch=Math.atan2(aim.y-eye.y,Math.hypot(dx,dz));m.updateCamera();m.updateVisuals(0);
  const hp=unit.hp;m.fireShot({id:101,kind:'assault',damage:8,speed:250,range:85,spread:0});
  m.weapons.clearInput();for(let i=0;i<15;i++)m.step(1/60);m.updateVisuals(.01);m.updateHUD(true);m.render();
  return {before:hp,after:unit.hp,unit:unit.snapshot(),snapshot:m.snapshot()};
 });
 assert.ok(combat.snapshot.horde.elapsed>5);assert.equal(combat.unit.initial,false);assert.equal(combat.unit.lane,'road');
 assert.equal(combat.snapshot.storyStep,4);assert.equal(combat.before-combat.after,8,'Actual projectile missed intended humanoid');assert.ok(combat.snapshot.encounter.activeDamage>0);assert.equal(combat.snapshot.hits,1);
 await page.screenshot({path:'release/HORDE-road-damage.png'});
 const devices=await page.evaluate(()=>{
  const {m}=window.__hordeTest;m.startMouseLook(true);
  const device=m.horde.devices.find(d=>d.kind==='humanoid'),peer=m.horde.devices.find(d=>d.kind===device.kind&&d.sourceId!==device.sourceId),before=m.horde.devices.map(d=>({id:d.id,hp:d.hp})),p={x:device.position.x,y:device.position.y,z:device.position.z-6};
  if(!peer)throw Error('Missing same-kind device in the other warehouse');
  if(!m.controller.restore({...p,yaw:Math.PI,pitch:0}))throw Error('Warehouse shooting position blocked');
  m.controller.yaw=Math.PI;m.controller.pitch=-.07;m.updateCamera();m.updateVisuals(0);
  let afterTen=0;const shotsToDestroy=Math.ceil(device.maxHp/8);
  // Isolate projectile damage from enemy scheduling here. Production scheduling
  // is independently tested at its real 5-second interval and150-second cap.
  for(let shot=0;shot<shotsToDestroy;shot++){
   m.fireShot({id:200+shot,kind:'assault',damage:8,speed:250,range:85,spread:0});
   for(let i=0;i<12;i++){const frame=m.projectiles.tick(m.shotWorld(),1/120);for(const receipt of frame.impacts){m.effects.impact(receipt.impact);m.acceptHit(receipt.impact.targetId,receipt.damage,receipt.impact);}m.effects.step(1/120,m.projectiles.visibleTracers);}
   if(shot===9)afterTen=device.hp;
  }
  m.updateVisuals(.01);m.updateHUD(true);m.render();return {targetId:device.id,peerId:peer.id,before,shotsToDestroy,afterTen,snapshot:m.snapshot(),messages:window.__hordeTest.messages};
 });
 assert.equal(devices.shotsToDestroy,63);assert.equal(devices.afterTen,420);
 assert.equal(devices.snapshot.horde.devices.find(d=>d.id===devices.targetId).hp,0,'Actual gunfire did not destroy device');
 assert.equal(devices.snapshot.horde.devices.find(d=>d.id===devices.peerId).hp,500,'Destroying one machine damaged the other warehouse same-kind machine');
 for(const device of devices.snapshot.horde.devices.filter(d=>d.id!==devices.targetId))assert.equal(device.hp,devices.before.find(d=>d.id===device.id).hp,'Gunfire damaged an unrelated spawn device');
 assert.ok(devices.messages.some(s=>s.includes('製造装置を破壊')));
 await page.screenshot({path:'release/HORDE-warehouse-device.png'});
 const death=await page.evaluate(()=>{
  const {m,values}=window.__hordeTest;m.takeDamage(100);m.updateHUD(true);const down={snapshot:m.snapshot(),saved:[...values.values()].map(v=>JSON.parse(v))};
  for(let i=0;i<25;i++)m.update(.1);const returned=m.snapshot();return{down,returned,saved:[...values.values()].map(v=>JSON.parse(v))};
 });
 assert.equal(death.down.snapshot.player.hp,0);assert.equal(death.down.saved[0].introStep,0);assert.equal(death.down.saved[0].checkpoint,null);
 assert.equal(death.returned.player.hp,100);assert.equal(death.returned.storyStep,0);assert.equal(death.returned.horde.elapsed,0);assert.equal(death.returned.horde.spawned,0);assert.equal(death.returned.encounter.enemyBars,0);assert.equal(death.returned.horde.devices.length,4);assert.ok(death.returned.horde.devices.every(d=>d.hp===500&&d.maxHp===500));assert.ok(Math.abs(death.returned.player.z-597)<.1);assert.ok(death.returned.paused);
 assert.equal(death.returned.weapon.unlimitedReserve,true);assert.equal(death.returned.weapon.reserve,null);
 await page.screenshot({path:'release/HORDE-return-home.png'});
 const cap=await page.evaluate(visualOnly=>{
  const {m}=window.__hordeTest;
  // Advance the same production director, bypassing wall time only in this test.
  const checkpoints=[];
  if(!visualOnly)for(const seconds of [4.9,.1,5,90,50]){m.horde.step(seconds,m.controller.position,{combatEnabled:false});checkpoints.push(m.horde.snapshot());}
  m.updateVisuals(0);m.render();const full=m.snapshot();m.dispose();return{checkpoints,full,disposed:m.encounter.snapshot(),actors:m.actors.snapshot()};
 },process.argv.includes('--visual-only'));
 if(!process.argv.includes('--visual-only')){
  const [beforeFive,first,fifthPair,hundred,full]=cap.checkpoints;
  assert.equal(beforeFive.spawned,0);assert.equal(first.spawned,2);assert.ok(first.sources.every(source=>source.spawned===1));assert.ok(first.units.every(unit=>unit.kind==='humanoid'&&unit.sourceSlot===1&&!unit.initial));
  assert.equal(fifthPair.spawned,4);assert.equal(hundred.spawned,40);assert.ok(Math.abs(full.elapsed-150)<1e-6);
  for(const checkpoint of cap.checkpoints){
   const expected=checkpoint.sources.reduce((total,source)=>total+Math.min(source.target,Math.floor((checkpoint.elapsed+1e-6)/5)),0);assert.equal(checkpoint.spawned,expected);
   for(const source of checkpoint.sources){const units=checkpoint.units.filter(unit=>unit.sourceId===source.id);assert.equal(source.spawned,Math.min(source.target,Math.floor((checkpoint.elapsed+1e-6)/5)));assert.equal(units.length,source.spawned);for(const unit of units)assert.equal(unit.kind,unit.sourceSlot%2?'humanoid':'drone');}
  }
  assert.equal(cap.full.horde.spawned,50);assert.deepEqual(cap.full.horde.sources.map(source=>source.spawned).sort((a,b)=>a-b),[20,30]);assert.equal(cap.full.actors.enemyUnits.length,50);assert.equal(cap.full.encounter.enemyBars,50);assert.ok(cap.full.actors.enemyUnits.every(u=>u.loaded&&!u.fallback));
 }assert.equal(cap.disposed.resources.textures,0);assert.deepEqual(errors,[]);
 await writeFile(process.argv.includes('--visual-only')?'release/HORDE-visual-check.json':'release/HORDE-runtime-check.json',JSON.stringify({errors,initial,combat,devices,death,cap},null,2));
 console.log(process.argv.includes('--visual-only')?'PASS: empty initial roads, four500HP devices, unlimited reserve HUD, actual projectile damage, isolated device destruction, automatic house return and bounded disposal.':'PASS: empty initial roads, two warehouse sources with20/30 caps, alternating5-second spawns to50 at150seconds, four500HP devices, unlimited reserve HUD, real projectiles, isolated63-shot device destruction, house reset, real actor models and bounded disposal.');
}finally{await browser.close();}

