import { test, expect } from './browser-fixtures.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { snapshot, rects, contained, intersects, fourFits, scrollEnd } from './layout-helpers.mjs';
const home=async page=>{await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#home-button').click();};
const panels=[['マップ','map'],['キャラ設定','character'],['武器','weapons'],['今のボス状況','boss'],['ランキング','ranking']];
for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1366,600],[1280,600],[1024,576]]){
 test(`HOME V2 desktop ${width}x${height}: all panels have usable content, reserved footer and visible own preview`,async({page},info)=>{
  // Five-panel geometry and the two low-height comparison captures are one user flow.
  test.setTimeout(60000);await page.setViewportSize({width,height});await home(page);await page.locator('#squad-button').click();await fourFits(page);
  const closed=await rects(page),viewport={x:0,y:0,right:width,bottom:height};
  expect(intersects(closed['#home-nav'],closed['.home-footnote'])).toBe(false);
  contained(closed['#back-title'],viewport);contained(closed['#start-button'],viewport);
  const measurements=[];
  for(const [name,id] of panels){
   const button=page.getByRole('button',{name,exact:true});await button.click();
   await expect(page.locator('#home-panel')).toHaveAttribute('aria-modal','false');
   await expect.poll(async()=>(await snapshot(page)).render.bounds.length).toBe(1);
   const r=await rects(page);contained(r['#home-panel'],viewport);contained(r['#panel-close'],r['#home-panel']);
   expect(r['#home-panel'].width).toBeGreaterThanOrEqual(560);expect(r['#home-panel'].height/height).toBeGreaterThan(.7);
   expect(r['#panel-content'].height).toBeGreaterThanOrEqual(height>=600?300:275);
   expect(intersects(r['.panel-header'],r['#panel-content'])).toBe(false);expect(intersects(r['#panel-footer'],r['#panel-content'])).toBe(false);
   expect(intersects(r['#home-nav'],r['.home-footnote'])).toBe(false);expect(intersects(r['#home-panel'],r['#lobby-stage'])).toBe(false);
   expect(await page.locator('#panel-content').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(14);
   await expect(page.locator('#start-button')).toBeDisabled();
   const own=(await snapshot(page)).render.bounds[0];contained({x:own.left,y:own.top,right:own.right,bottom:own.bottom},r['#lobby-stage']);
   if(id==='map'){contained(r['#campaign-map'],r['#panel-content']);await expect(page.locator('#campaign-map text').filter({hasText:'知床'})).toBeVisible();await expect(page.locator('#region-select')).toHaveValue('0');await expect(page.locator('#region-select option')).toHaveCount(18);}
   if(id==='weapons'){
    const cards=await page.locator('.gun-option').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    expect(cards).toHaveLength(6);for(const card of cards)contained(card,r['#panel-content']);
   }
   if(id==='character'){for(const id of ['apply-character','cancel-character','reset-character']){const b=await page.locator(`#${id}`).boundingBox();contained({x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height},r['#panel-footer']);expect(b.height).toBeGreaterThanOrEqual(44);}}
   if(height<=600&&['map','weapons'].includes(id)){await mkdir('test-results/visual-v2',{recursive:true});await page.screenshot({path:`test-results/visual-v2/${id}-${width}x${height}.png`});}
   measurements.push({panel:id,boxes:r,snapshot:await snapshot(page)});
   await scrollEnd(page);await page.locator('#panel-close').click();await expect(button).toBeFocused();await fourFits(page);
  }
  const path=info.outputPath('layout-measurements.json');await writeFile(path,JSON.stringify({width,height,dpr:await page.evaluate(()=>devicePixelRatio),visualViewport:await page.evaluate(()=>({width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale})),browser:await page.evaluate(()=>navigator.userAgent),measurements},null,2));await info.attach('layout-measurements',{path,contentType:'application/json'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
 });
}
test('HOME V2 desktop nonmodal keyboard changes panels, resets scrolling and never triggers START underneath',async({page})=>{
 await page.setViewportSize({width:1280,height:600});await home(page);
 const map=page.getByRole('button',{name:'マップ',exact:true});await map.focus();await page.keyboard.press('Enter');await scrollEnd(page);
 const character=page.getByRole('button',{name:'キャラ設定',exact:true});await character.focus();await page.keyboard.press('Space');
 expect(await page.locator('#panel-content').evaluate(n=>n.scrollTop)).toBe(0);await expect(page.locator('#panel-title')).toBeFocused();
 // The V2 header puts the title before its close button in natural DOM order.
 await page.keyboard.press('Tab');await expect(page.locator('#panel-close')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#preview-name')).toBeFocused();await page.keyboard.press('Escape');await expect(character).toBeFocused();
 await page.locator('#start-button').focus();await page.keyboard.press('Space');await expect(page.locator('#panel-title')).toHaveText('最初の出撃：知床');await expect(page.locator('.combat-disabled')).toBeDisabled();await page.locator('#briefing-back').click();
});
test('HOME V2 longest weapon and name fit after rotation; camera fitting stays idle between layout events',async({page})=>{
 await home(page);await page.locator('#squad-button').click();await page.getByRole('button',{name:'キャラ設定',exact:true}).click();await page.locator('#preview-name').fill('知床の生存者あいうえおかきくけこ');await page.locator('#apply-character').click();
 await page.getByRole('button',{name:'武器',exact:true}).click();await page.locator('[data-slot="primary"][data-gun="sniper"]').click();await page.locator('#weapon-done').click();await fourFits(page);
 const stable=(await snapshot(page)).render.layoutFits;await page.waitForTimeout(300);expect((await snapshot(page)).render.layoutFits).toBe(stable);
 for(const view of [{width:390,height:844},{width:844,height:390},{width:1280,height:600}]){await page.setViewportSize(view);await fourFits(page);}
});

test('HOME V2 title revisits refit the shared camera instead of reusing stale HOME diagnostics',async({page},info)=>{
 await home(page);
 for(const squad of [false,true,false]){
  if(squad)await page.locator('#squad-button').click();else await page.locator('#solo-button').click();
  await expect.poll(async()=>(await snapshot(page)).render.homeCamera).toBe(true);
  const count=(await snapshot(page)).render.layoutFits;
  await page.locator('#back-title').click();await expect.poll(async()=>(await snapshot(page)).render.homeCamera).toBe(false);
  await page.locator('#home-button').click();await expect.poll(async()=>(await snapshot(page)).render.homeCamera).toBe(true);
  expect((await snapshot(page)).render.layoutFits).toBeGreaterThan(count);
  if(squad)await fourFits(page);
 }
 await page.locator('#squad-button').click();await fourFits(page);await page.screenshot({path:info.outputPath('four-after-title-revisit.png')});
});

test('HOME V2 delayed compositor callbacks still draw UI changes and restore normal rendering',async({page},info)=>{
 await page.addInitScript(()=>{const request=window.requestAnimationFrame.bind(window);window.__DELAYED_FRAMES__=[];window.requestAnimationFrame=callback=>request(time=>{if(window.__PAUSE_COMPOSITOR__)window.__DELAYED_FRAMES__.push(()=>callback(time));else callback(time);});});
 await page.setViewportSize({width:1280,height:600});await home(page);await page.locator('#squad-button').click();await fourFits(page);
 const before=(await snapshot(page)).renderClock;await page.evaluate(()=>{window.__PAUSE_COMPOSITOR__=true;});
 await page.getByRole('button',{name:'マップ',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).render.bounds.length).toBe(1);
 await page.locator('#panel-close').click();await fourFits(page);
 await page.locator('#back-title').click();await expect.poll(async()=>(await snapshot(page)).render.homeCamera).toBe(false);
 await page.locator('#home-button').click();await fourFits(page);
 const stalled=(await snapshot(page)).renderClock;expect(stalled.fallbackFrames).toBeGreaterThan(before.fallbackFrames);expect(stalled.frames).toBeGreaterThan(before.frames);
 await page.evaluate(()=>{window.__PAUSE_COMPOSITOR__=false;const pending=window.__DELAYED_FRAMES__.splice(0);pending.forEach(callback=>callback());});await expect.poll(async()=>(await snapshot(page)).renderClock.rafTime).toBeGreaterThan(stalled.rafTime);
 await fourFits(page);await page.screenshot({path:info.outputPath('four-after-compositor-resumes.png')});
});
