import {expect} from './browser-fixtures.mjs';
export const snapshot=page=>page.evaluate(()=>window.__RECLAIM__.snapshot());
export async function enter(page,{low=true}={}) {
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 if(low){await page.locator('#settings-button').click();await page.locator('#quality-select').selectOption('low');await page.keyboard.press('Escape');}
 await page.locator('#home-button').click();await page.locator('#start-button').click();await page.locator('#mission-launch').click();await expect(page.locator('body')).toHaveAttribute('data-screen','mission');await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');
}
export async function lock(page){await page.locator('#mission-lock').click();await expect.poll(async()=>(await snapshot(page)).mission?.locked).toBe(true);await page.waitForTimeout(140);}
export async function turnToward(page,target){
 const {player}= (await snapshot(page)).mission;
 const desired=Math.atan2(-(target.x-player.x),-(target.z-player.z));let delta=Math.atan2(Math.sin(desired-player.yaw),Math.cos(desired-player.yaw));
 const count=Math.round(Math.abs(delta)/.0484);for(let i=0;i<count;i++)await page.keyboard.press(delta>0?'ArrowLeft':'ArrowRight');
 if(target.y!==undefined){const pitch=Math.atan2(target.y-(player.y+1.62),Math.hypot(target.x-player.x,target.z-player.z)),dp=pitch-player.pitch;for(let i=0;i<Math.round(Math.abs(dp)/.0484);i++)await page.keyboard.press(dp>0?'ArrowUp':'ArrowDown');}
}
export async function walkTo(page,target,{radius=1.3,sprint=true,maxMs=50000}={}){
 const start=Date.now();let unchanged=0,previous=null;
 while(Date.now()-start<maxMs){const state=(await snapshot(page)).mission;if(!state)throw new Error('mission disappeared during actual walk');const p=state.player,distance=Math.hypot(target.x-p.x,target.z-p.z);if(distance<=radius)return state;
  if(state.paused)throw new Error(`mission paused during walk: ${JSON.stringify(state)}`);
  await turnToward(page,target);if(sprint)await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await page.waitForTimeout(Math.min(420,Math.max(100,distance/5.8*700)));await page.keyboard.up('KeyW');if(sprint)await page.keyboard.up('ShiftLeft');
  if(previous&&Math.hypot(previous.x-p.x,previous.z-p.z)<.035)unchanged++;else unchanged=0;previous=p;if(unchanged>9)throw new Error(`actual walking blocked en route to ${JSON.stringify(target)}: ${JSON.stringify(state)}`);
 }
 throw new Error(`actual walking timed out at ${JSON.stringify((await snapshot(page)).mission)}`);
}
