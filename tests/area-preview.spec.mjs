import {test,expect} from './browser-fixtures.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {lock,snapshot,walkTo,turnToward} from './mission-helpers.mjs';
for(const[id,target,poi]of[
 ['shiretoko',{x:-13,z:60},{x:-46,y:.3,z:62}],
 ['ishikari-mountains',{x:-18,z:81},{x:-18,y:30.5,z:95}],
 ['hidaka-mountains',{x:-12,z:80},{x:6,y:85.5,z:132}],
 ['sapporo',{x:0,z:68},{x:0,y:18,z:190}],
])test(`development-only ${id} loads unique actual WebGL biome, walks to POI, unloads without campaign awards`,async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1366,height:768});await page.goto(`http://127.0.0.1:5173/?dev-area=${id}`);await expect(page.locator('body')).toHaveAttribute('data-screen','mission');await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');expect((await snapshot(page)).mission.areaId).toBe(id);expect((await snapshot(page)).mission.debug).toBe(true);
 await page.locator('#settings-button').click();await page.locator('#quality-select').selectOption('low');await page.keyboard.press('Escape');await lock(page);
 const route=id==='shiretoko'?[{x:0,z:8},{x:0,z:30},{x:-8,z:34},{x:-13,z:43},{x:-13,z:60}]:id==='ishikari-mountains'?[{x:8,z:45},{x:-18,z:81}]:id==='hidaka-mountains'?[{x:12,z:40},{x:-12,z:80}]:[{x:0,z:40},{x:0,z:68}];
 for(const point of route)await walkTo(page,point,{radius:2});await turnToward(page,poi);await page.waitForTimeout(160);const info=await snapshot(page);expect(info.mission.player.distance).toBeGreaterThan(20);expect(info.mission.player.recoveries).toBe(0);expect(info.mission.world.unloadedChunks).toBeGreaterThan(0);expect(info.campaign.completedAreaIds).toEqual([]);
 await mkdir('test-results/world-evidence',{recursive:true});await page.screenshot({path:`test-results/world-evidence/${id}-environment.png`});await writeFile(`test-results/world-evidence/${id}-environment.json`,JSON.stringify(info,null,2));await page.keyboard.press('Escape');await page.locator('#mission-home').click();await expect(page.locator('#home-screen')).toBeVisible();expect((await snapshot(page)).mission).toBeNull();
});
