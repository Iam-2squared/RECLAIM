import { test, expect } from './browser-fixtures.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

async function enter(page) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.locator('#home-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
}
const snap = page => page.evaluate(() => window.__RECLAIM__.snapshot());

for (const [width,height] of [[1600,900],[1366,768],[1366,600],[1024,576]]) {
  test(`cinematic HOME ${width}x${height}: image, character and controls are usable`,async({page},info)=>{
    test.setTimeout(60000);
    await page.setViewportSize({width,height}); await enter(page);
    await expect(page.locator('body')).toHaveAttribute('data-home-view','cinematic');
    await expect.poll(async()=>(await snap(page)).home.presentation.backgroundDecoded).toBe(true);
    const s=(await snap(page)).home.presentation;
    expect(s.area).toBe('shiretoko');expect(s.art).toBe('shiretoko');
    expect(s.characterRepresentation).toBe('pre-rendered-2d');
    expect(s.actors).toHaveLength(1);
    expect(s.backgroundError).toBe(false);expect(s.actorError).toBe(false);
    expect(s.actors[0].left).toBeGreaterThanOrEqual(0);
    expect(s.actors[0].right).toBeLessThanOrEqual(width+1);
    await expect(page.locator('#start-button')).toBeInViewport();
    for(const label of ['マップ','キャラ設定','武器','今のボス状況','ランキング']){
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(page.locator('#panel-title')).toHaveText(label);
      await expect(page.locator('#start-button')).toBeDisabled();
      await page.locator('#panel-close').click();
    }
    await mkdir('test-results/home-v3',{recursive:true});
    await page.screenshot({path:`test-results/home-v3/home-${width}-${height}.png`});
    await writeFile(info.outputPath('home-cinematic-snapshot.json'),JSON.stringify(s,null,2));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
  });
}

test('cinematic HOME squad is only an offline visual preview',async({page})=>{
  await enter(page);await page.locator('#squad-button').click();
  await expect(page.locator('#squad-note')).toContainText('オンライン未接続');
  await expect.poll(async()=>(await snap(page)).home.presentation.actors.length).toBe(4);
  await page.getByRole('button',{name:'キャラ設定',exact:true}).click();
  await expect.poll(async()=>(await snap(page)).home.presentation.actors.length).toBe(1);
  await page.locator('#panel-close').click();
  await expect.poll(async()=>(await snap(page)).home.presentation.actors.length).toBe(4);
  await page.locator('#solo-button').click();
  await expect.poll(async()=>(await snap(page)).home.presentation.actors.length).toBe(1);
});

test('changing name, palette and selected gun updates live text without granting 3D cosmetic ownership',async({page})=>{
  await enter(page);await page.getByRole('button',{name:'キャラ設定',exact:true}).click();
  await page.locator('#preview-name').fill('知床の生存者');
  await page.locator('[data-palette="clay"]').click();
  await expect(page.locator('#cinematic-name')).toHaveText('知床の生存者');
  await expect(page.locator('.home-actor-0')).toHaveAttribute('data-palette','clay');
  await page.locator('#apply-character').click();
  await page.getByRole('button',{name:'武器',exact:true}).click();
  await page.locator('[data-slot="primary"][data-gun="rifle"]').click();
  await expect(page.locator('#home-weapon-art')).toHaveAttribute('data-weapon','rifle');
  await page.locator('#weapon-done').click();
  await expect(page.locator('#cinematic-gear')).toContainText('小銃');
  await page.reload();await page.locator('#home-button').click();
  await expect(page.locator('#cinematic-name')).toHaveText('知床の生存者');
});

test('HOME area selection is strictly restricted to unlocked areas',async({page})=>{
  await enter(page);
  await expect(page.locator('#home-area-select option')).toHaveCount(1);
  await expect(page.locator('#home-area-select')).toHaveValue('shiretoko');
  await page.getByRole('button',{name:'マップ',exact:true}).click();
  await expect(page.locator('#region-select option')).toHaveCount(18);
  await page.locator('#region-select').selectOption('5');
  await expect(page.locator('#region-name')).toHaveText('???');
  await expect(page.locator('body')).toHaveAttribute('data-home-area','shiretoko');
  await expect(page.locator('#home-area-select option')).toHaveCount(1);
  await page.locator('#panel-close').click();
});

test('reduced motion disables scenery animation; explicit 3D equipment preview can toggle',async({page})=>{
  await enter(page);
  await page.locator('#settings-button').click();await page.locator('#motion-toggle').check();await page.keyboard.press('Escape');
  await expect(page.locator('#home-screen')).toHaveAttribute('data-home-motion','stopped');
  if ((await page.locator('body').getAttribute('data-renderer')) === 'webgl') {
    await page.locator('#home-render-mode').click();
    await expect(page.locator('body')).toHaveAttribute('data-home-view','model');
    await expect.poll(async()=>(await snap(page)).home.presentation.rendered3D).toBe(true);
    await page.locator('#home-render-mode').click();
    await expect(page.locator('body')).toHaveAttribute('data-home-view','cinematic');
  } else {
    await expect(page.locator('#home-render-mode')).toBeDisabled();
  }
});
