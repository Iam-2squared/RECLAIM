import {test,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:40000});
import {mkdir,writeFile} from 'node:fs/promises';
const state=page=>page.evaluate(()=>({mission:window.__RECLAIM__.missionSnapshot(),campaign:window.__RECLAIM__.snapshot().campaign}));
const mission=page=>page.evaluate(()=>window.__RECLAIM__.missionSnapshot());
async function evidence(page,name){await mkdir('test-results/combat-motion',{recursive:true});await page.screenshot({path:`test-results/combat-motion/${name}.png`});await writeFile(`test-results/combat-motion/${name}.json`,JSON.stringify(await state(page),null,2));}
async function prepare(page,hp=100,z=12){
 await page.addInitScript(({hp,z})=>{
  localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:false}));
  localStorage.setItem('reclaim.lobby.v1',JSON.stringify({version:1,character:'ramirez',partySize:1}));
  localStorage.setItem('reclaim.campaign.v1',JSON.stringify({version:1,introStep:4,droneDefeated:false,completedAreaIds:[],passages:[],checkpoint:{areaId:'shiretoko',x:0,y:0,z,yaw:Math.PI,pitch:0,hp},traversal:{areaId:'shiretoko',distance:12,lastPosition:{x:0,y:0,z},passedCheckpointIds:[]}}));
 },{hp,z});
 await page.goto('/');await page.locator('#home-button').click();await page.locator('#start-button').click();await page.locator('#mission-resume').click();
 await expect.poll(async()=>(await mission(page))?.actors.ready,{timeout:90000}).toBe(true);
 expect((await mission(page)).actors.failed).toEqual([]);
 await page.locator('#mission-lock').click();await expect.poll(async()=>(await mission(page)).locked).toBe(true);
}
test('actual selected character moves, fires all three weapons, reloads and pauses cleanly',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await prepare(page);
 expect((await mission(page)).actors.character).toBe('ramirez');await evidence(page,'first-person-assault');
 await page.keyboard.press('KeyV');await expect.poll(async()=>(await mission(page)).thirdPerson).toBe(true);
 await page.keyboard.down('KeyW');await expect.poll(async()=>(await mission(page)).actors.player.clip).toBe('Walk');await page.keyboard.down('ShiftLeft');await expect.poll(async()=>(await mission(page)).actors.player.clip).toBe('Run');
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
 await page.evaluate(()=>{const baseline=window.__RECLAIM__.missionSnapshot().player.y;const log={air:false,landed:false,baseline,maxY:baseline,active:true};window.__combatJump=log;function sample(){if(!log.active)return;const p=window.__RECLAIM__.missionSnapshot()?.player;if(p){log.maxY=Math.max(log.maxY,p.y);if(!p.grounded&&p.y>baseline+.01)log.air=true;if(log.air&&p.grounded)log.landed=true;}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>window.__combatJump.air)).toBe(true);await expect.poll(()=>page.evaluate(()=>window.__combatJump.landed)).toBe(true);await page.evaluate(()=>{window.__combatJump.active=false;});
 await page.mouse.down({button:'right'});await expect.poll(async()=>(await mission(page)).weapon.aiming).toBe(true);
 await page.mouse.down();await expect.poll(async()=>(await mission(page)).shots).toBeGreaterThanOrEqual(3);await page.mouse.up();await page.mouse.up({button:'right'});
 await expect.poll(async()=>(await mission(page)).effects.impacts).toBeGreaterThan(0);const ammo=(await mission(page)).weapon.ammo;expect(ammo).toBeLessThan(24);
 await page.keyboard.press('KeyR');await expect.poll(async()=>(await mission(page)).weapon.reloading).toBe(true);await evidence(page,'ramirez-reload');await expect.poll(async()=>(await mission(page)).weapon.ammo,{timeout:15000}).toBe(24);
 await page.keyboard.press('Digit2');await page.keyboard.press('KeyV');await page.mouse.down({button:'right'});await expect.poll(async()=>(await mission(page)).weapon.aiming).toBe(true);await expect(page.locator('#mission-scope')).toBeVisible();await evidence(page,'first-person-sniper');await page.mouse.up({button:'right'});expect((await mission(page)).weapon.kind).toBe('sniper');const before=(await mission(page)).shots;await page.mouse.down();await expect.poll(async()=>(await mission(page)).shots).toBe(before+1);const start=(await mission(page)).elapsed;await expect.poll(async()=>(await mission(page)).elapsed).toBeGreaterThan(start+1);expect((await mission(page)).shots).toBe(before+1);await page.mouse.up();
 await page.evaluate(()=>{window.__combatObservedMelee=false;let remaining=180;function sample(){window.__combatObservedMelee ||= window.__RECLAIM__.missionSnapshot()?.actors.player?.clip==='Melee';if(--remaining>0)requestAnimationFrame(sample);}requestAnimationFrame(sample);});await page.keyboard.press('KeyV');await page.keyboard.press('Digit3');await page.mouse.down();await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.__combatObservedMelee)).toBe(true);await evidence(page,'ramirez-knife');
 await page.keyboard.press('Escape');const paused=(await mission(page));expect(paused.weapon.triggerHeld).toBe(false);expect(paused.projectiles.active).toBe(0);expect(paused.recoil.cameraPitch).toBe(0);await page.waitForTimeout(250);expect((await mission(page)).elapsed).toBe(paused.elapsed);await page.locator('#mission-home').click();expect((await mission(page))).toBeNull();expect(errors).toEqual([]);
});
test('weaponless drone dives into actual contact, player dies and retry resets equipment',async({page})=>{
 await prepare(page,4,21);await page.keyboard.press('KeyV');
 await expect(page.locator('#mission-retry')).toBeVisible({timeout:30000});const dead=(await mission(page));expect(dead.player.hp).toBe(0);expect(dead.enemy.hits).toBe(0);expect(dead.actors.player.clip).toBe('Death');await evidence(page,'contact-death');
 await page.locator('#mission-retry').click();const retried=(await mission(page));expect(retried.player.hp).toBe(100);expect(retried.weapon.ammo).toBe(24);expect(retried.projectiles.active).toBe(0);expect((await state(page)).campaign.droneDefeated).toBe(false);
});
test('Lv5 variants load in the isolated preview and leave campaign progress untouched',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:false})));
 await page.goto('/?dev-area=shiretoko&combat-preview=1&enemy-level=5');
 await expect.poll(async()=>(await mission(page))?.actors.models??[],{timeout:90000}).toEqual(expect.arrayContaining(['jonesy','drone-lv5','humanoid-lv5']));
 const before=JSON.stringify((await state(page)).campaign);await page.locator('#mission-lock').click();await page.keyboard.press('KeyV');await page.keyboard.down('KeyW');const distance=(await mission(page)).player.distance;await expect.poll(async()=>(await mission(page)).player.distance).toBeGreaterThan(distance+.4);await page.keyboard.up('KeyW');await evidence(page,'lv5-motion');expect((await mission(page)).enemies.every(e=>e.level===5)).toBe(true);await page.keyboard.press('Escape');await page.locator('#mission-home').click();expect(JSON.stringify((await state(page)).campaign)).toBe(before);
});
test('first-person scope stays clear and weapon returns after aiming',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await prepare(page);
 await page.keyboard.press('Digit2');await page.mouse.down({button:'right'});
 await expect.poll(async()=>(await mission(page)).recoil.aim).toBeGreaterThan(.95);
 await expect(page.locator('#mission-scope')).toBeVisible();
 expect((await mission(page)).actors.viewmodelVisible).toBe(false);
 await evidence(page,'sniper-scope-clear');await page.mouse.up({button:'right'});
 await expect(page.locator('#mission-scope')).toBeHidden();
 await expect.poll(async()=>(await mission(page)).actors.viewmodelVisible).toBe(true);
 await evidence(page,'sniper-unscoped');await page.keyboard.press('Escape');await page.locator('#mission-home').click();expect(errors).toEqual([]);
});
