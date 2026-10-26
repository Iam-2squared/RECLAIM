import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const state = page => page.evaluate(()=>window.__RECLAIM_MOTION_PREVIEW__?.snapshot());
const evidenceDirectory = resolve('../motion/reports/preview/evidence');
const expected = {
  jonesy:['Aim','Death','Hit','Idle','Jump','Melee','Reload','Run','Shoot','Walk'],
  ramirez:['Aim','Death','Hit','Idle','Jump','Melee','Reload','Run','Shoot','Walk'],
  'humanoid-lv1':['Attack','Death','Hit','Idle','Run','Walk'],
  'drone-lv1':['Chase','Death','Hit','Hover','Patrol','Ram'],
  'humanoid-lv5':['Attack','Death','Hit','Idle','Run','Walk'],
  'drone-lv5':['Chase','Death','Hit','Hover','Patrol','Ram'],
};
async function evidence(page,name){
  await mkdir(evidenceDirectory,{recursive:true});
  await page.screenshot({path:resolve(evidenceDirectory,`${name}.png`)});
  await writeFile(resolve(evidenceDirectory,`${name}.json`),JSON.stringify(await state(page),null,2));
}
async function play(page){if(!(await state(page)).playing)await page.locator('#play-pause').click();}
async function pause(page){if((await state(page)).playing)await page.locator('#play-pause').click();}
async function ready(page,id){await expect.poll(async()=>{const s=await state(page);return s?.ready?s.model:null;},{timeout:90000}).toBe(id);}

test('actual offline file previews six skinned models, all 44 clips and playback controls without network assets',async({page})=>{
  const errors=[],remote=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});
  await page.goto(pathToFileURL(resolve('../motion/キャラ動作確認.html')).href,{waitUntil:'domcontentloaded'});
  await ready(page,'jonesy');await expect(page.locator('#loading')).toBeHidden();
  const initial=await state(page);expect(initial.totalClips).toBe(44);expect(initial.models).toHaveLength(6);expect(initial.skinned).toBeGreaterThan(0);expect(initial.triangles).toBeGreaterThan(10000);
  await expect.poll(async()=>(await state(page)).weapon,{timeout:60000}).toBe('assault');

  for(const clip of ['Walk','Run','Jump','Shoot','Reload','Death']){
    await page.locator(`[data-clip="${clip}"]`).click();await pause(page);await page.locator('#restart').click();
    expect((await state(page)).clip).toBe(clip);
    expect((await state(page)).time).toBeCloseTo(0,5);await play(page);
    // A one-shot may already finish before a busy browser returns a snapshot.
    // Starting from a verified zero makes nonzero terminal time valid evidence.
    await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.02);
  }
  await page.locator('[data-clip="Walk"]').click();await pause(page);await page.locator('#restart').click();
  expect((await state(page)).time).toBeCloseTo(0,5);
  await page.locator('#step-forward').click();expect((await state(page)).playing).toBe(false);expect((await state(page)).time).toBeCloseTo(1/30,5);
  await page.locator('#step-back').click();expect((await state(page)).time).toBeCloseTo(0,5);
  await page.locator('#step-back').click();expect((await state(page)).time).toBeCloseTo(0,5);
  await page.locator('#timeline').focus();await page.keyboard.press('End');
  expect((await state(page)).time).toBeCloseTo((await state(page)).duration,5);
  await page.locator('#step-forward').click();expect((await state(page)).time).toBeCloseTo((await state(page)).duration,5);
  await page.keyboard.press('Tab');await page.locator('#restart').click();
  const paused=(await state(page)).time;await page.waitForTimeout(300);expect((await state(page)).time).toBeCloseTo(paused,5);
  for(const speed of ['0.5','2']){
    await page.locator('#speed').selectOption(speed);expect((await state(page)).speed).toBe(Number(speed));
    await play(page);const before=(await state(page)).time;await expect.poll(async()=>Math.abs((await state(page)).time-before)).toBeGreaterThan(.02);await pause(page);
  }
  await page.locator('#speed').selectOption('1');await page.locator('#restart').click();
  for(let i=0;i<5;i++)await page.locator('#step-forward').click();
  await evidence(page,'jonesy-walk');
  await page.locator('#weapon-select').selectOption('sniper');await expect.poll(async()=>(await state(page)).weapon).toBe('sniper');
  await page.locator('#weapon-select').selectOption('knife');await expect.poll(async()=>(await state(page)).weapon).toBe('knife');
  await page.locator('#weapon-select').selectOption('none');await expect.poll(async()=>(await state(page)).weapon).toBe('none');

  let selectedClips=0;
  for(const [id,clips] of Object.entries(expected)){
    await page.locator(`[data-model="${id}"]`).click();await ready(page,id);await pause(page);
    expect([...(await state(page)).clips].sort()).toEqual(clips);
    expect((await state(page)).bones).toBeGreaterThan(0);expect((await state(page)).skinned).toBeGreaterThan(0);
    for(const clip of clips){
      await page.locator(`[data-clip="${clip}"]`).click();expect((await state(page)).clip).toBe(clip);
      await page.locator('#step-forward').click();const s=await state(page);expect(Number.isFinite(s.time)).toBe(true);expect(s.time).toBeGreaterThan(0);expect(s.time).toBeLessThanOrEqual(s.duration);selectedClips++;
    }
    if(id==='humanoid-lv5'){
      await page.locator('[data-clip="Attack"]').click();for(let i=0;i<7;i++)await page.locator('#step-forward').click();await evidence(page,'humanoid-lv5-attack');
    }
    if(id==='drone-lv5'){
      await page.locator('[data-clip="Ram"]').click();for(let i=0;i<6;i++)await page.locator('#step-forward').click();await evidence(page,'drone-lv5-ram');
    }
  }
  expect(selectedClips).toBe(44);expect(remote).toEqual([]);expect(errors).toEqual([]);
});
