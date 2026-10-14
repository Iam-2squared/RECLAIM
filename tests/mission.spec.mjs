import {test,expect} from './browser-fixtures.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {enter,lock,snapshot,walkTo,turnToward} from './mission-helpers.mjs';
const evidence='test-results/world-evidence';
async function capture(page,name){await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/${name}.png`});await writeFile(`${evidence}/${name}.json`,JSON.stringify(await snapshot(page),null,2));}

test('initial map and all panels hide future places; reset has explicit confirmation and keeps cosmetics',async({page})=>{
 await page.goto('/');await page.locator('#home-button').click();await page.getByRole('button',{name:'キャラ設定',exact:true}).click();await page.locator('#preview-name').fill('北の旅人');await page.locator('#apply-character').click();
 await page.getByRole('button',{name:'マップ',exact:true}).click();expect(await page.locator('#region-select option').count()).toBe(18);
 for(let i=0;i<18;i++){await page.locator('#region-select').selectOption(String(i));await expect(page.locator('#region-name')).toHaveText(i===0?'知床':'???');}
 const text=await page.locator('#home-panel').innerText();for(const name of ['札幌','石狩山地','日高山脈','函館','撤退','再突入','名古屋'])expect(text).not.toContain(name);
 await page.locator('#campaign-reset').click();await expect(page.locator('#campaign-reset-confirm')).toBeVisible();await page.locator('#campaign-reset-no').click();await expect(page.locator('#campaign-reset-confirm')).toBeHidden();await page.locator('#campaign-reset').click();await page.locator('#campaign-reset-yes').click();await page.locator('#panel-close').click();await expect(page.locator('#survivor-name')).toHaveText('北の旅人');expect((await snapshot(page)).campaign.completedAreaIds).toEqual([]);
 await page.getByRole('button',{name:'今のボス状況',exact:true}).click();expect(await page.locator('#home-panel').innerText()).not.toMatch(/名古屋|京都|大阪/);
});

for(const[width,height]of[[1920,1080],[1366,768],[1280,720],[1024,576]])test(`mission actual WebGL ${width}x${height} shows wake house and reachable PC controls`,async({page})=>{
 await page.setViewportSize({width,height});await enter(page);await expect(page.locator('#mission-story')).toBeVisible();await expect(page.locator('#mission-continue')).toBeInViewport({ratio:1});await expect(page.locator('#mission-skip')).toBeInViewport({ratio:1});await capture(page,`wake-${width}x${height}`);
 expect((await snapshot(page)).mission.locked).toBe(false);await page.locator('#mission-continue').click();await expect(page.locator('#mission-lock')).toBeInViewport({ratio:1});const anchor=await page.locator('#mission-lock').boundingBox();await lock(page);
 const before=(await snapshot(page)).mission.player;
 // Observe real mouse-driven angles throughout the input. The packaged Linux
 // shell can emit a compensating recenter event after a genuine relative move,
 // so a final-angle-only assertion accidentally measured cursor re-centering.
 await page.evaluate(()=>{window.__LOOK_SAMPLES=[];document.addEventListener('mousemove',()=>window.__LOOK_SAMPLES.push(window.__RECLAIM__.snapshot().mission?.player.yaw));});
 await page.mouse.move((anchor?.x??width/2)+(anchor?.width??0)/2+35,(anchor?.y??height/2)+(anchor?.height??0)/2,{steps:4});
 let changed=await page.evaluate(yaw=>window.__LOOK_SAMPLES.some(v=>typeof v==='number'&&Math.abs(Math.atan2(Math.sin(v-yaw),Math.cos(v-yaw)))>.02),before.yaw);
 if(!changed){await page.mouse.move(35,0);changed=await page.evaluate(yaw=>window.__LOOK_SAMPLES.some(v=>typeof v==='number'&&Math.abs(Math.atan2(Math.sin(v-yaw),Math.cos(v-yaw)))>.02),before.yaw);}
 expect(changed).toBe(true);await turnToward(page,{x:0,z:5,y:1.62});
 await page.keyboard.down('KeyW');await page.waitForTimeout(380);await page.keyboard.up('KeyW');const moved=(await snapshot(page)).mission.player;expect(moved.distance).toBeGreaterThan(before.distance);expect(Math.abs(moved.y)).toBeLessThan(.2);
 await page.keyboard.press('Space');await expect.poll(async()=>(await snapshot(page)).mission.player.grounded).toBe(false);await expect.poll(async()=>(await snapshot(page)).mission.player.grounded).toBe(true);
 await page.keyboard.press('Escape');await expect.poll(async()=>(await snapshot(page)).mission.locked).toBe(false);await expect(page.locator('#mission-home')).toBeInViewport({ratio:1});const stopped=(await snapshot(page)).mission.player;await page.waitForTimeout(220);expect((await snapshot(page)).mission.player).toEqual(stopped);await page.locator('#mission-home').click();await expect(page.locator('#home-screen')).toBeVisible();expect((await snapshot(page)).mission).toBeNull();
});

test('real wake-radio-contact-leave, moving drone, ray hits/stop, trail exit and one-step unlock survive resume',async({page})=>{
 test.setTimeout(300000);const errors=[],requests=[],sockets=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('websocket',s=>sockets.push(s.url()));await page.setViewportSize({width:1366,height:768});await enter(page);
 await page.locator('#mission-continue').click();await lock(page);await walkTo(page,{x:-1.4,z:-2.8},{radius:.5,sprint:false});await turnToward(page,{x:-3,y:1.2,z:-3});await capture(page,'cabin-radio');await page.keyboard.press('KeyE');await expect(page.locator('#mission-story-title')).toContainText('AIが暴走');await capture(page,'radio-report');await page.locator('#mission-continue').click();await expect(page.locator('#mission-story-title')).toContainText('東京の親友');await capture(page,'friend-contact');await page.locator('#mission-continue').click();await lock(page);
 await walkTo(page,{x:0,z:3.8},{radius:.6});await walkTo(page,{x:0,z:10},{radius:1});expect((await snapshot(page)).campaign.introStep).toBe(4);
 await turnToward(page,{x:0,y:2.5,z:0});await capture(page,'house-exterior');await turnToward(page,{x:0,y:2.7,z:25});await capture(page,'cabin-outside-and-drone');const enemyBefore=(await snapshot(page)).mission.enemy.position;await page.waitForTimeout(1000);expect((await snapshot(page)).mission.enemy.position.z).toBeLessThan(enemyBefore.z);
 await walkTo(page,{x:0,z:16},{radius:1});for(let i=0;i<6&&(await snapshot(page)).mission.enemy.hp>0;i++){const enemy=(await snapshot(page)).mission.enemy;await turnToward(page,enemy.position);await page.mouse.down();await page.mouse.up();await page.waitForTimeout(260);}
 await expect.poll(async()=>(await snapshot(page)).mission.enemy.hp).toBe(0);expect((await snapshot(page)).mission.enemy.hits).toBe(3);expect((await snapshot(page)).campaign.droneDefeated).toBe(true);await capture(page,'drone-stopped');
 await walkTo(page,{x:0,z:30});await walkTo(page,{x:12,z:64},{radius:2});await capture(page,'shiretoko-trail');await page.keyboard.press('Escape');const saved=(await snapshot(page)).mission.player;await page.locator('#mission-home').click();await page.locator('#start-button').click();await page.locator('#mission-resume').click();await expect(page.locator('body')).toHaveAttribute('data-screen','mission');expect((await snapshot(page)).mission.player.x).toBeCloseTo(saved.x,2);expect((await snapshot(page)).mission.enemy.state).toBe('stopped');await lock(page);
 await walkTo(page,{x:4,z:104},{radius:5});await expect(page.locator('#mission-end')).toBeVisible();expect((await snapshot(page)).campaign.completedAreaIds).toEqual(['shiretoko']);await capture(page,'shiretoko-exit');await page.locator('#mission-next').click();await page.getByRole('button',{name:'マップ',exact:true}).click();const revealed=await page.locator('#home-panel').innerText();expect(revealed).toContain('石狩山地');expect(revealed).not.toMatch(/日高山脈|札幌|函館|撤退|再突入/);await capture(page,'home-unlocked-ishikari');await page.locator('#panel-close').click();
 // Continue the same saved campaign with genuine traversal through all prototypes.
 // The longer case covers extra real walks; all five-second UI predicates remain.
 for(const [area,points,expected]of[
   ['ishikari-mountains',[{x:8,z:45},{x:-18,z:84},{x:-6,z:132}],['shiretoko','ishikari-mountains']],
   ['hidaka-mountains',[{x:12,z:40},{x:-12,z:80},{x:6,z:132}],['shiretoko','ishikari-mountains','hidaka-mountains']],
   ['sapporo',[{x:0,z:40},{x:0,z:85},{x:0,z:132}],['shiretoko','ishikari-mountains','hidaka-mountains']],
 ]){
   await page.locator('#start-button').click();await page.locator('#mission-area-select').selectOption(area);await expect(page.locator('#panel-title')).toHaveText(`出撃確認：${area==='ishikari-mountains'?'石狩山地':area==='hidaka-mountains'?'日高山脈':'札幌'}`);await expect(page.locator('#combat-reason')).toContainText('正式任務・敵は開発中');await page.locator('#mission-launch').click();await lock(page);
   for(let i=0;i<points.length;i++)await walkTo(page,points[i],{radius:i===points.length-1?5:2});
   await expect(page.locator('#mission-end')).toBeVisible();expect((await snapshot(page)).campaign.completedAreaIds).toEqual(expected);await capture(page,`${area}-passage`);
   if(area==='sapporo')await expect(page.locator('#mission-end-title')).toHaveText('プレイ可能な範囲はここまで');
   await page.locator('#mission-next').click();await page.getByRole('button',{name:'マップ',exact:true}).click();const map=await page.locator('#home-panel').innerText();
   if(area==='ishikari-mountains'){expect(map).toContain('日高山脈');expect(map).not.toContain('札幌');}
   if(area==='hidaka-mountains'||area==='sapporo')expect(map).toContain('札幌');
   expect(map).not.toMatch(/函館|撤退|再突入/);await page.locator('#panel-close').click();
 }
 await page.reload();await expect(page.locator('#title-screen')).toBeVisible();expect((await snapshot(page)).campaign.completedAreaIds).toEqual(['shiretoko','ishikari-mountains','hidaka-mountains']);expect(errors).toEqual([]);expect(sockets).toEqual([]);expect(requests.filter(u=>/^https?:/.test(u)&&!u.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
});

test('10 actual HOME-mission returns dispose resources, input and pointer lock without growth',async({page})=>{
 test.setTimeout(120000);await enter(page);await page.locator('#mission-skip').click();await page.locator('#mission-home').click();let baseline=null;const samples=[];
 for(let i=0;i<10;i++){await page.locator('#start-button').click();await page.locator('#mission-launch').click();await lock(page);await page.keyboard.down('KeyW');await page.waitForTimeout(100);await page.keyboard.up('KeyW');await page.keyboard.press('Escape');await page.locator('#mission-home').click();await expect.poll(async()=>(await snapshot(page)).render.homeCamera).toBe(true);await page.waitForTimeout(60);const render=(await snapshot(page)).render;samples.push(render);if(!baseline)baseline=render;else{expect(render.geometries).toBe(baseline.geometries);expect(render.textures).toBe(baseline.textures);}expect((await snapshot(page)).mission).toBeNull();expect(await page.evaluate(()=>document.pointerLockElement)).toBeNull();}
 await mkdir(evidence,{recursive:true});await writeFile(`${evidence}/ten-returns.json`,JSON.stringify(samples,null,2));
});

test('mission quality changes LOD, corrupted storage and WebGL loss keep safe HOME navigation',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('reclaim.campaign.v1','{corrupted');});await enter(page,{low:false});await page.locator('#mission-skip').click();const balanced=(await snapshot(page)).mission.world;await page.locator('#settings-button').click();await page.locator('#quality-select').selectOption('low');await page.keyboard.press('Escape');const low=(await snapshot(page)).mission.world;expect(low.activeChunks).toBeLessThan(balanced.activeChunks);expect(low.trees).toBeLessThan(balanced.trees);await capture(page,'quality-low');
 await page.locator('#scene canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await expect(page.locator('body')).toHaveAttribute('data-renderer','fallback');await expect(page.locator('#home-screen')).toBeVisible();await page.locator('#start-button').click();await expect(page.locator('#mission-launch')).toBeDisabled();await expect(page.locator('#mission-unavailable')).toBeVisible();
});

test('public production build ignores developer area URL and never bypasses title or unlock',async({page})=>{await page.goto('/?dev-area=sapporo');await expect(page.locator('#title-screen')).toBeVisible();expect((await snapshot(page)).mission).toBeNull();await page.locator('#home-button').click();await page.locator('#start-button').click();await expect(page.locator('#mission-area-select option')).toHaveCount(1);await expect(page.locator('#mission-area-select')).toHaveValue('shiretoko');});

test('visibility pause clears input, freezes enemy/movement and requires explicit resume',async({page})=>{
 await enter(page);await page.locator('#mission-skip').click();await lock(page);await page.keyboard.down('KeyW');await page.waitForTimeout(120);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});const before=(await snapshot(page)).mission;expect(before.paused).toBe(true);await page.waitForTimeout(180);const after=(await snapshot(page)).mission;expect(after.player).toEqual(before.player);expect(after.enemy).toEqual(before.enemy);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#mission-lock')).toBeVisible();expect((await snapshot(page)).mission.paused).toBe(true);await page.keyboard.up('KeyW');await lock(page);const pos=(await snapshot(page)).mission.player;await page.waitForTimeout(180);expect((await snapshot(page)).mission.player.x).toBe(pos.x);expect((await snapshot(page)).mission.player.z).toBe(pos.z);await page.keyboard.press('Escape');await page.locator('#mission-home').click();
});

test('a restored low-health checkpoint takes actual drone damage, reaches HP0 and retries safely',async({page})=>{
 test.setTimeout(60000);await page.addInitScript(()=>{localStorage.setItem('reclaim.campaign.v1',JSON.stringify({version:1,introStep:4,droneDefeated:false,completedAreaIds:[],passages:[],checkpoint:{areaId:'shiretoko',x:0,y:0,z:8,yaw:Math.PI,pitch:0,hp:4},traversal:{areaId:'shiretoko',distance:9.5,lastPosition:{x:0,y:0,z:8},passedCheckpointIds:[]}}));});
 await page.goto('/');await page.locator('#settings-button').click();await page.locator('#quality-select').selectOption('low');await page.keyboard.press('Escape');await page.locator('#home-button').click();await page.locator('#start-button').click();await page.locator('#mission-resume').click();await lock(page);expect((await snapshot(page)).mission.player.hp).toBe(4);await walkTo(page,{x:0,z:16},{radius:1});await expect(page.locator('#mission-retry')).toBeVisible({timeout:20000});expect((await snapshot(page)).mission.player.hp).toBe(0);expect((await snapshot(page)).campaign.droneDefeated).toBe(false);await page.locator('#mission-retry').click();expect((await snapshot(page)).mission.player.hp).toBe(100);expect((await snapshot(page)).mission.player.z).toBe(-1.5);await expect(page.locator('#mission-lock')).toBeVisible();
});

test('story/pause buttons accept Space; storage quota updates the idle save status honestly',async({page})=>{
 await enter(page);await page.locator('#mission-continue').focus();await page.keyboard.press('Space');await expect(page.locator('#mission-story')).toBeHidden();await page.locator('#mission-lock').focus();await page.keyboard.press('Space');await expect.poll(async()=>(await snapshot(page)).mission.locked).toBe(true);
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});await expect(page.locator('#mission-save')).toContainText('このセッション');await page.keyboard.press('Escape');await page.locator('#mission-home').click();
});

test('a delayed pointer-lock request cannot lock HOME after mission disposal',async({page})=>{
 await page.addInitScript(()=>{const request=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=function(...args){return new Promise((resolve,reject)=>setTimeout(()=>{try{Promise.resolve(request.apply(this,args)).then(resolve,reject);}catch(e){reject(e);}},250));};});await enter(page);await page.locator('#mission-skip').click();await page.locator('#mission-lock').click();await page.locator('#mission-home').click();await page.waitForTimeout(400);await expect(page.locator('body')).toHaveAttribute('data-screen','home');expect(await page.evaluate(()=>document.pointerLockElement)).toBeNull();expect((await snapshot(page)).mission).toBeNull();await expect(page.locator('#start-button')).toBeEnabled();
});
