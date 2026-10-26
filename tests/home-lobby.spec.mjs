import { test, expect } from './browser-fixtures.mjs';

const state=page=>page.evaluate(()=>window.__RECLAIM__.snapshot());
// The two genuine GLBs include textures; wait for their real decoded state,
// within the existing overall test deadline, instead of the generic 5s poll.
const modelsReady=page=>expect.poll(async()=>(await state(page)).lobby.status,{timeout:20000}).toBe('ready');
async function title(page) {
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
}
async function home(page) {
  await title(page);await page.locator('#home-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-menu-presentation','home-3d-lobby');
  await modelsReady(page);
  await expect.poll(async()=>(await state(page)).lobby.frames).toBeGreaterThan(1);
}

test('approved title stays light and HOME renders four actual supplied characters',async({page})=>{
  const requests=[];const errors=[];page.on('request',r=>{if(/home-models\/.*\.glb/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await title(page);expect((await state(page)).renderer).toBe('deferred');await expect(page.locator('canvas')).toHaveCount(0);expect(requests).toEqual([]);
  await page.locator('#home-button').click();await modelsReady(page);
  await expect.poll(async()=>(await state(page)).lobby.frames).toBeGreaterThan(1);
  const s=await state(page);expect(s.lobby.models).toEqual(['jonesy','ramirez']);expect(s.lobby.modelCount).toBe(4);expect(s.lobby.resources.triangles).toBeGreaterThan(10000);expect(s.renderer).toBe('deferred');
  await expect(page.locator('#lobby-stage canvas')).toBeVisible();await expect(page.locator('.survivor-label:visible')).toHaveCount(4);expect(requests).toHaveLength(2);expect(errors).toEqual([]);
});

test('real operator choice and one to four roster slots persist without awarding progress',async({page})=>{
  await home(page);const campaign=(await state(page)).campaign;
  await page.locator('#solo-button').click();await expect.poll(async()=>(await state(page)).lobby.modelCount).toBe(1);
  for(let index=1;index<4;index++){await page.locator(`#party-add-${index}`).click();await expect.poll(async()=>(await state(page)).lobby.modelCount).toBe(index+1);}
  await page.locator('#home-character-select').selectOption('ramirez');await expect.poll(async()=>(await state(page)).lobby.slots[0].character).toBe('ramirez');
  expect((await state(page)).campaign).toEqual(campaign);
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#home-button').click();
  await modelsReady(page);await expect(page.locator('#home-character-select')).toHaveValue('ramirez');expect((await state(page)).lobby.modelCount).toBe(4);
});

test('top bar preserves real panels, route visibility and explicit departure confirmation',async({page})=>{
  await home(page);const before=(await state(page)).campaign;
  for(const [id,name]of [['map','マップ'],['character','キャラ設定'],['weapons','武器'],['boss','今のボス状況'],['ranking','ランキング']]){
    await page.locator(`[data-panel="${id}"]`).click();await expect(page.locator('#panel-title')).toHaveText(name);
    if(id==='map'){await expect(page.locator('#region-select option')).toHaveCount(18);expect(await page.locator('#region-select').textContent()).toContain('???');}
    await page.keyboard.press('Escape');await expect(page.locator('#home-panel')).toBeHidden();
  }
  await expect(page.locator('#home-lobby-tab')).toHaveAttribute('aria-current','page');
  await page.locator('#start-button').click();await expect(page.locator('#mission-launch')).toBeEnabled();await expect(page.locator('#mission-screen')).toBeHidden();
  expect((await state(page)).campaign).toEqual(before);await page.locator('#briefing-back').click();
});

test('settings and leaving HOME stop the idle renderer, then resume without reloading models',async({page})=>{
  await home(page);await page.locator('#settings-button').click();await page.locator('#motion-toggle').check();
  await expect.poll(async()=>(await state(page)).lobby.running).toBe(false);await page.waitForTimeout(100);
  const stopped=(await state(page)).lobby.frames;await page.waitForTimeout(250);expect((await state(page)).lobby.frames).toBe(stopped);
  await page.locator('#motion-toggle').uncheck();await page.keyboard.press('Escape');await expect.poll(async()=>(await state(page)).lobby.frames).toBeGreaterThan(stopped);
  await page.locator('#back-title').click();const off=(await state(page)).lobby.frames;await page.waitForTimeout(250);expect((await state(page)).lobby.frames).toBe(off);
  await page.locator('#home-button').click();await expect.poll(async()=>(await state(page)).lobby.frames).toBeGreaterThan(off);
  expect((await state(page)).lobby.models).toEqual(['jonesy','ramirez']);
});

test('model resources stay bounded across roster changes and title returns',async({page})=>{
  await home(page);await page.locator('#settings-button').click();await page.locator('#motion-toggle').check();await page.keyboard.press('Escape');
  await page.waitForTimeout(100);const before=(await state(page)).lobby.resources;
  for(let i=0;i<3;i++){await page.locator('#home-character-select').selectOption('ramirez');await page.locator('#home-character-select').selectOption('jonesy');await page.locator('#back-title').click();await page.locator('#home-button').click();}
  await page.waitForTimeout(100);const after=(await state(page)).lobby.resources;expect(after.geometries).toBe(before.geometries);expect(after.textures).toBe(before.textures);
});

for(const viewport of [{width:1366,height:768},{width:390,height:844}])test(`HOME keeps its actual roster and play control visible at ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await home(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  await expect(page.locator('#start-button')).toBeInViewport({ratio:1});await expect(page.locator('#home-character-select')).toBeInViewport({ratio:1});expect((await state(page)).lobby.slots.every(slot=>slot.x>0&&slot.x<1&&slot.footY>0&&slot.footY<1)).toBe(true);
});

test('a model load failure remains visible and does not disable menu controls',async({page})=>{
  await page.route('**/home-models/*.glb',route=>route.abort());await title(page);await page.locator('#home-button').click();
  await expect.poll(async()=>(await state(page)).lobby.status).toBe('error');await expect(page.locator('#lobby-loading')).toContainText('表示できません');
  await page.locator('[data-panel="map"]').click();await expect(page.locator('#region-select option')).toHaveCount(18);await page.keyboard.press('Escape');await page.locator('#back-title').click();await expect(page.locator('#title-screen')).toBeVisible();
});
