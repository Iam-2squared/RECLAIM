import { test, expect } from './browser-fixtures.mjs';
import { writeFile } from 'node:fs/promises';
import { fourFits, sheetFits, scrollEnd, contained, rects } from './layout-helpers.mjs';

const snapshot = page => page.evaluate(() => window.__RECLAIM__.snapshot());
const ready = async page => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  expect(response?.headers()['content-type']).toContain('text/html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#boot-notice')).toBeHidden();
  await expect(page.locator('#home-button')).toBeEnabled();
};
const home = async page => { await ready(page); await page.locator('#home-button').tap(); await expect(page.locator('#home-screen')).toBeVisible(); };
const open = async (page, name) => { await page.locator('#menu-toggle').tap(); await page.getByRole('button', { name, exact: true }).tap(); await expect(page.locator('#home-nav')).toBeHidden(); };
const fullSquad = fourFits;

test('a file-viewer-like module block gives a visible Safari instruction instead of an active dead HOME button', async ({ page }) => {
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#boot-notice')).toContainText('Preview URLをSafari');
  await expect(page.locator('#boot-notice')).toBeInViewport();
  await expect(page.locator('#home-button')).toBeDisabled();
  await expect(page.locator('#home-screen')).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('data-ready', 'true');
});

test('iPhone touch uses layered 2D title art without GPU draws and travels TITLE to HOME and back', async ({ page }) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-menu-presentation','atmospheric-title-2d');
  await page.locator('.title-atmosphere img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await expect(page.locator('#title-button')).toHaveAttribute('tabindex','-1');
  const frames=(await snapshot(page)).renderClock.rendererFrames;
  await page.waitForTimeout(100);
  expect((await snapshot(page)).renderClock.rendererFrames).toBe(frames);
  await expect(page.locator('body')).toHaveAttribute('data-reveal','false');
  await page.locator('#home-button').tap();
  await expect(page.locator('#title-screen')).toBeHidden();
  await expect(page.locator('#home-screen')).toBeVisible();
  await page.locator('#menu-toggle').tap(); await page.locator('#back-title').tap();
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.locator('#home-button').tap(); await page.reload();
  await expect(page.locator('#title-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Safari display dialog, reduced motion and quality remain touch operable', async ({ page }) => {
  await ready(page); await page.locator('#title-settings').tap();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.locator('#motion-toggle').check(); await page.locator('#quality-select').selectOption('low');
  await page.locator('#settings-dialog .close-button').tap();
  await expect(page.locator('#settings-dialog')).toBeHidden();
  expect((await snapshot(page)).reducedMotion).toBe(true);
  await page.locator('#home-button').tap(); await page.locator('#squad-button').tap(); await fullSquad(page);
  expect((await snapshot(page)).render.pixelRatio).toBeLessThanOrEqual(.75);
});

for (const [width, height] of [[375, 667], [390, 664], [390, 844], [430, 932]]) {
  test(`iPhone portrait ${width}x${height} shows fixed art and three local sample cards after toolbar-height changes`, async ({ page }, info) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height }); await home(page);
    await page.locator('#squad-button').tap(); await fullSquad(page);
    await expect(page.locator('#start-button')).toBeInViewport({ ratio: 1 });
    const imagePath=info.outputPath('portrait-four-survivors.png'), boundsPath=info.outputPath('portrait-model-bounds.json');
    await page.screenshot({path:imagePath}); await writeFile(boundsPath,JSON.stringify(await snapshot(page),null,2));
    await info.attach('portrait-four-survivors', { path:imagePath, contentType: 'image/png' });
    await info.attach('portrait-model-bounds', { path:boundsPath, contentType: 'application/json' });
    await page.setViewportSize({ width, height: height - 80 }); await fullSquad(page);
    // V2 gives a compact screen to a full sheet; verify all four again on close.
    await open(page, '武器'); await sheetFits(page);
    await page.locator('[data-slot="primary"][data-gun="sniper"]').tap(); await sheetFits(page);
    await page.locator('#panel-close').tap(); await fullSquad(page); await expect(page.locator('#start-button')).toBeInViewport({ ratio: 1 });
  });
}

test('iPhone touch operates every left-menu item, saves appearance, changes guns and opens the briefing', async ({ page }) => {
  test.setTimeout(90000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await home(page); await page.locator('#squad-button').tap();
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('知床の生存者');
  await page.locator('[data-palette="slate"]').tap(); await page.locator('#apply-character').tap();
  await expect(page.locator('#survivor-name')).toHaveText('知床の生存者'); await fullSquad(page);
  await open(page, '武器'); await page.locator('[data-slot="primary"][data-gun="sniper"]').tap();
  await page.locator('#hold-secondary').tap(); await page.locator('[data-slot="secondary"][data-gun="rifle"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle'); await page.locator('#panel-close').tap();
  await open(page, 'マップ'); await page.locator('#region-select').selectOption('17');
  await expect(page.locator('#region-name')).toHaveText('???'); await page.locator('#panel-close').tap();
  await open(page, '今のボス状況'); await expect(page.locator('.unknown-hp strong')).toHaveText('—'); await page.locator('#panel-close').tap();
  await open(page, 'ランキング'); await expect(page.locator('.empty-records')).toContainText('未接続'); await page.locator('#panel-close').tap();
  await page.locator('#start-button').tap(); await expect(page.locator('.mission-boundary')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#mission-launch')).toBeEnabled(); await page.locator('#briefing-back').tap();
  await page.reload(); await page.locator('#home-button').tap();
  await expect(page.locator('#survivor-name')).toHaveText('知床の生存者');
  await expect(page.locator('body')).toHaveAttribute('data-palette', 'slate');
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle');
  expect(errors).toEqual([]);
});

test('Safari without storage or WebGL still reaches HOME and permits local controls', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return String(type).includes('webgl') ? null : get.call(this, type, ...args); };
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await home(page); await expect(page.locator('body')).toHaveAttribute('data-renderer', 'fallback');
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('一時プレビュー'); await page.locator('#apply-character').tap();
  await expect(page.locator('#survivor-name')).toHaveText('一時プレビュー');
  await open(page, '武器'); await page.locator('[data-slot="primary"][data-gun="rifle"]').tap(); await page.locator('#panel-close').tap();
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle');
});

for(const [width,height] of [[390,844],[375,667],[844,390]]){
 test(`HOME V2 Safari sheet ${width}x${height}: every menu, fixed actions, focus and bottom reachability`,async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width,height});await home(page);await page.locator('#squad-button').tap();await fullSquad(page);
  for(const name of ['マップ','キャラ設定','武器','今のボス状況','ランキング']){
   await open(page,name);await sheetFits(page);
   const r=await rects(page);
   if(name==='マップ'){contained(r['#campaign-map'],r['#panel-content']);await expect(page.locator('#region-select')).toHaveValue('0');}
   if(name==='武器'){for(const card of await page.locator('.gun-option span').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};})))contained(card,r['#panel-content']);}
   if(name==='キャラ設定')for(const id of ['apply-character','cancel-character','reset-character'])await expect(page.locator(`#${id}`)).toBeInViewport({ratio:1});
   await scrollEnd(page);
   await page.locator('#panel-close').focus();await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.querySelector('#home-panel').contains(document.activeElement))).toBe(true);
   await page.locator('#panel-close').tap();await expect(page.locator('#menu-toggle')).toBeFocused();await fullSquad(page);
  }
  await open(page,'キャラ設定');await page.locator('#preview-name').fill('縦横を確認');
  // Emulates a reduced visual height; this does not claim a physical iOS keyboard.
  await page.setViewportSize({width,height:Math.max(300,height-220)});await expect(page.locator('#apply-character')).toBeInViewport({ratio:1});await expect(page.locator('#cancel-character')).toBeInViewport({ratio:1});
  await page.locator('#cancel-character').tap();await page.setViewportSize({width,height});await fullSquad(page);
 });
}

test('HOME V2 compact focus/background fallback works without native inert and restores original tab order',async({page})=>{
 await page.addInitScript(()=>{delete HTMLElement.prototype.inert;});
 await home(page);expect(await page.evaluate(()=> 'inert' in HTMLElement.prototype)).toBe(false);
 await open(page,'キャラ設定');await expect(page.locator('#panel-title')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#panel-close')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.locator('#reset-character')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#panel-close')).toBeFocused();
 expect(await page.locator('#squad-button').evaluate(n=>n.tabIndex)).toBe(-1);await page.locator('#squad-button').evaluate(n=>n.focus());await expect(page.locator('#panel-title')).toBeFocused();
 await page.locator('#panel-close').tap();await expect(page.locator('#menu-toggle')).toBeFocused();expect(await page.locator('#squad-button').evaluate(n=>n.tabIndex)).toBe(0);await expect(page.locator('.topbar')).not.toHaveAttribute('aria-hidden','true');await expect(page.locator('#start-button')).toBeEnabled();
});

test('HOME V2 safe-area substitutes keep the header, four models and sheet actions clear in both orientations',async({page})=>{
 await home(page);await page.locator('#squad-button').tap();
 for(const view of [{width:390,height:844,top:47,bottom:34,left:16,right:16},{width:844,height:390,top:16,bottom:21,left:47,right:47}]){
  await page.setViewportSize({width:view.width,height:view.height});
  // These CSS inset substitutes exercise geometry, not a physical notch/Safari UI.
  await page.evaluate(v=>{for(const [edge,px] of Object.entries(v).filter(([k])=>['top','bottom','left','right'].includes(k)))document.body.style.setProperty(`--home-safe-${edge}`,`${px}px`);document.body.style.setProperty('--sheet-safe-top',`${v.top}px`);document.body.style.setProperty('--sheet-safe-bottom',`${v.bottom}px`);},view);
  // Check the header at the top of the page, BEFORE the intentional START
  // scroll. Read both rectangles in one layout sample (WebKit rotation may
  // settle between separate protocol reads). Keep and strengthen the bounds.
  await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
  await expect.poll(()=>page.evaluate(v=>{const r=document.querySelector('.topbar').getBoundingClientRect(),h=document.querySelector('.home-location').getBoundingClientRect();return r.top>=v.top&&r.left>=v.left&&r.right<=innerWidth-v.right+1&&h.top>=r.bottom+8;},view)).toBe(true);
  await fullSquad(page);
  const start=await page.locator('#start-button').boundingBox();expect(start.x+start.width).toBeLessThanOrEqual(view.width-view.right+1);expect(start.y+start.height).toBeLessThanOrEqual(view.height-view.bottom+1);
  await open(page,'キャラ設定');
  // Linux mobile WebKit can retain the old IntersectionObserver root after
  // setViewportSize. Check the actual visual viewport, hit targets and tap.
  for(const id of ['apply-character','cancel-character','reset-character','panel-close']){
   const b=await page.locator(`#${id}`).boundingBox();contained({x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height},{x:0,y:0,right:view.width,bottom:view.height});
   expect(await page.locator(`#${id}`).evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  }
  const p=await page.locator('#home-panel').boundingBox();expect(p.y).toBeGreaterThanOrEqual(view.top);expect(p.y+p.height).toBeLessThanOrEqual(view.height-view.bottom+1);await page.locator('#cancel-character').tap();await expect(page.locator('#home-panel')).toBeHidden();
 }
});
