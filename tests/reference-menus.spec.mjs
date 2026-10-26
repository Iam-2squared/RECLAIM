import {test,expect} from './browser-fixtures.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {compareReference,referenceReady} from './reference-helpers.mjs';
const ready=async page=>{await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await referenceReady(page);};
const evidence='test-results/reference-evidence';

for(const screen of ['home'])test(`owner ${screen} artwork: every channel within one code value at native 1536x864`,async({page})=>{
 await page.setViewportSize({width:1536,height:864});await page.emulateMedia({reducedMotion:'no-preference'});await ready(page);
 if(screen==='home')await page.locator('#home-button').click();
 await mkdir(evidence,{recursive:true});const proof=await compareReference(page,screen,`${evidence}/${screen}-1536x864.png`);
 await writeFile(`${evidence}/${screen}-pixel-comparison.json`,JSON.stringify(proof,null,2));
 // CSS compositing and Canvas JPEG decoding can round a channel by one value.
 // Every pixel must remain inside that exact bound; shifts/overlays fail here.
 expect(proof.maxChannelError).toBeLessThanOrEqual(1);expect(proof.overOnePixels).toBe(0);
 expect(proof.snapshot.menus.mode).toBe('reference-2d');expect(proof.snapshot.render.drawCalls).toBe(0);
});

test('new title loads its layered artwork instead of the retired reference JPEG',async({page})=>{
 await ready(page);await expect(page.locator('body')).toHaveAttribute('data-menu-presentation','atmospheric-title-2d');
 await expect(page.locator('#title-screen .reference-backplate')).toHaveCount(0);
 await expect(page.locator('#title-screen .title-atmosphere')).toBeVisible();
 const images=await page.locator('#title-screen .title-atmosphere img').evaluateAll(nodes=>nodes.map(image=>({loaded:image.complete&&image.naturalWidth>0,width:image.naturalWidth,height:image.naturalHeight})));
 expect(images).toHaveLength(4);expect(images.every(image=>image.loaded&&image.width>0&&image.height>0)).toBe(true);
 const initial=await page.evaluate(()=>window.__RECLAIM__.snapshot());expect(initial.renderer).toBe('deferred');expect(initial.render).toBeNull();
 await expect(page.locator('#scene canvas')).toHaveCount(0);
});

for(const [width,height]of [[1920,1080],[1366,768],[1280,720],[1024,576]])test(`responsive title, uncropped HOME and aligned real controls at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'no-preference'});await ready(page);await mkdir(evidence,{recursive:true});
 for(const screen of ['title','home']){
  if(screen==='home')await page.locator('#home-button').click();
  const stage=await page.locator(`#${screen}-screen`).boundingBox();
  if(screen==='home')expect(Math.abs(stage.width/stage.height-16/9)).toBeLessThan(.001);
  else {expect(Math.abs(stage.width-width)).toBeLessThanOrEqual(1);expect(Math.abs(stage.height-height)).toBeLessThanOrEqual(1);await expect(page.locator('.title-atmosphere__background')).toBeVisible();}
  expect(stage.x).toBeGreaterThanOrEqual(-1);expect(stage.y).toBeGreaterThanOrEqual(-1);expect(stage.x+stage.width).toBeLessThanOrEqual(width+1);expect(stage.y+stage.height).toBeLessThanOrEqual(height+1);
  await page.mouse.move(0,0);await page.screenshot({path:`${evidence}/${screen}-${width}x${height}.png`});
 }
 const frame=await page.locator('#home-screen').boundingBox(),start=await page.locator('#start-button').boundingBox();
 expect(Math.abs((start.x-frame.x)/frame.width-1073/1536)).toBeLessThan(.001);
 expect(Math.abs((start.y-frame.y)/frame.height-701/864)).toBeLessThan(.001);
 for(const name of ['マップ','キャラ設定','武器','今のボス状況','ランキング']){await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('#home-panel')).toBeVisible();await expect(page.locator('#panel-title')).toHaveText(name);await page.keyboard.press('Escape');}
 await page.locator('#start-button').click();await expect(page.locator('#mission-launch')).toBeEnabled();await expect(page.locator('#mission-screen')).toBeHidden();await page.locator('#briefing-back').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
});

test('image menu arrows/Enter, settings, extras, HOME gear/mail and Escape are native controls',async({page})=>{
 await ready(page);await expect(page.locator('#continue-button')).toBeDisabled();await page.keyboard.press('ArrowDown');await expect(page.locator('#home-button')).toBeFocused();
 await page.keyboard.press('ArrowDown');await expect(page.locator('#title-settings')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#settings-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#title-settings')).toBeFocused();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.locator('#reference-dialog')).toBeVisible();await expect(page.locator('#reference-dialog-text')).toContainText('この端末に保存');await page.keyboard.press('Escape');
 await page.locator('#home-button').click();await page.locator('#settings-button').click();await expect(page.locator('#settings-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('#reference-mail').click();await expect(page.locator('#reference-dialog-text')).toContainText('未接続');await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.locator('#title-screen')).toBeVisible();
});

test('no menu GPU draws, fake campaign awards or hidden mission start across ten title/HOME returns',async({page})=>{
 await ready(page);await page.locator('#home-button').click();await page.locator('#back-title').click();const before=await page.evaluate(()=>window.__RECLAIM__.snapshot());
 for(let i=0;i<10;i++){await page.locator('#home-button').click();await page.locator('#squad-button').click();await expect(page.locator('.sample-label:visible')).toHaveCount(3);await page.locator('#solo-button').click();await page.locator('#back-title').click();}
 const after=await page.evaluate(()=>window.__RECLAIM__.snapshot());expect(after.render.drawCalls).toBe(0);expect(after.campaign).toEqual(before.campaign);expect(after.mission).toBeNull();expect(after.render.geometries).toBe(before.render.geometries);expect(after.render.textures).toBe(before.render.textures);
});

test('saved names/equipment remain real data while fixed illustration is explicitly disclosed',async({page})=>{
 await ready(page);await page.locator('#home-button').click();await page.getByRole('button',{name:'キャラ設定',exact:true}).click();await expect(page.locator('.panel-intro')).toContainText('人物の絵は固定');
 await page.locator('#preview-name').fill('知床の旅人');await page.locator('[data-palette="slate"]').click();await page.locator('#apply-character').click();await expect(page.locator('#survivor-name')).toBeVisible();
 await page.getByRole('button',{name:'武器',exact:true}).click();await expect(page.locator('.panel-intro')).toContainText('装備の絵は固定');await page.locator('[data-slot="primary"][data-gun="sniper"]').click();await page.locator('#weapon-done').click();await expect(page.locator('#held-weapon')).toHaveText('スナイパー / 日本刀');
 await page.reload();await page.locator('#home-button').click();await expect(page.locator('#survivor-name')).toHaveText('知床の旅人');await expect(page.locator('body')).toHaveAttribute('data-palette','slate');await expect(page.locator('#held-weapon')).toHaveText('スナイパー / 日本刀');
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
 await page.getByRole('button',{name:'キャラ設定',exact:true}).click();await page.locator('#preview-name').fill('保存不可でも表示');await page.locator('#apply-character').click();
 await expect(page.locator('#local-save-status')).toBeVisible();await expect(page.locator('#local-save-status')).toContainText('保存できません');
 await page.reload();await page.locator('#home-button').click();await expect(page.locator('#survivor-name')).toHaveText('知床の旅人');
});
