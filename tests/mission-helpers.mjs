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

async function forwardInput(page,observe,{sprint=false,maxMs=5000,keepHeld=false}={}){
 let observed=false;
 if(sprint)await page.keyboard.down('ShiftLeft');
 await page.keyboard.down('KeyW');
 try{
  // A wall-time down/up pulse may fall entirely between frames on software WebGL.
  // Keep genuine keys held until read-only diagnostics observe the requested result.
  await expect.poll(async()=>observe((await snapshot(page)).mission),{timeout:maxMs,intervals:[20,40,80,100]}).toBe(true);
  observed=true;
 }finally{
  if(!keepHeld||!observed){await page.keyboard.up('KeyW');if(sprint)await page.keyboard.up('ShiftLeft');}
 }
 return(await snapshot(page)).mission;
}

export async function holdForward(page,metres,{sprint=false,maxMs=5000,keepHeld=false}={}){
 const before=(await snapshot(page)).mission;
 if(!before||before.paused)throw new Error('mission must be active before real forward input');
 return forwardInput(page,state=>{
  if(!state)throw new Error('mission disappeared during actual movement');
  if(state.paused)throw new Error(`mission paused during actual movement: ${JSON.stringify(state)}`);
  return state.player.distance-before.player.distance>=metres;
 },{sprint,maxMs,keepHeld});
}

export async function walkTo(page,target,{radius=1.3,sprint=true,maxMs=50000,stopOnDeath=false}={}){
 const deadline=Date.now()+maxMs;let unchanged=0;
 const reached=state=>Math.hypot(target.x-state.player.x,target.z-state.player.z)<=radius;
 const terminal=state=>stopOnDeath&&state.paused&&state.player.hp===0;
 const inspect=state=>{
  if(!state)throw new Error('mission disappeared during actual walk');
  if(reached(state)||terminal(state))return true;
  if(state.paused)throw new Error(`mission paused during walk: ${JSON.stringify(state)}`);
  return false;
 };
 while(true){
  const state=(await snapshot(page)).mission;
  // Read the exact geometric predicate before the deadline. The last real input
  // can reach the target while a slow GPU delays the following browser response.
  if(inspect(state))return state;
  if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(state)}`);
  await turnToward(page,target);
  const before=(await snapshot(page)).mission;if(inspect(before))return before;
  const distance=Math.hypot(target.x-before.player.x,target.z-before.player.z);
  const pulse=Math.min(2,Math.max(.12,(distance-radius)*.7));
  const remaining=deadline-Date.now();
  if(remaining<=0)continue;
  let after;
  try{
   after=await forwardInput(page,next=>{
    if(inspect(next))return true;
    // After a bounded amount of actual simulation, re-aim or report physical
    // blocking. Idle wall time and stalled rendering do not count as collision.
    return next.player.distance-before.player.distance>=pulse||next.elapsed-before.elapsed>=.45;
   },{sprint,maxMs:Math.min(5000,remaining)});
  }catch(error){
   const final=(await snapshot(page)).mission;
   if(inspect(final))return final;
   if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(final)}`,{cause:error});
   throw error;
  }
  if(inspect(after))return after;
  const simulated=after.elapsed-before.elapsed;
  if(simulated>=.4&&Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)<.035)unchanged++;else unchanged=0;
  if(unchanged>9)throw new Error(`actual walking blocked en route to ${JSON.stringify(target)}: ${JSON.stringify(after)}`);
 }
}
