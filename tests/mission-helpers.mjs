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
 const deadline=Date.now()+maxMs;let unchanged=0,forwardHeld=false,state=null;
 const reached=state=>Math.hypot(target.x-state.player.x,target.z-state.player.z)<=radius;
 const terminal=state=>stopOnDeath&&state.paused&&state.player.hp===0;
 const inspect=state=>{
  if(!state)throw new Error('mission disappeared during actual walk');
  if(reached(state)||terminal(state))return true;
  if(state.paused)throw new Error(`mission paused during walk: ${JSON.stringify(state)}`);
  return false;
 };
 const stopForward=async()=>{if(forwardHeld){await page.keyboard.up('KeyW');forwardHeld=false;}};
 const startForward=async()=>{if(!forwardHeld){await page.keyboard.down('KeyW');forwardHeld=true;}};
 const settle=async state=>{
  if(!inspect(state))return null;
  await stopForward();
  // The release is a real input too. Verify its resulting position, rather
  // than reporting an earlier radius crossing if a slow response overshot it.
  const stopped=(await snapshot(page)).mission;
  state=stopped;
  return inspect(stopped)?stopped:null;
 };
 try{
  state=(await snapshot(page)).mission;
  const already=await settle(state);if(already)return already;
  if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(state)}`);
  await turnToward(page,target); // Initial aim is stationary, including the small cabin approach.
  state=(await snapshot(page)).mission;
  const aimed=await settle(state);if(aimed)return aimed;
  if(sprint)await page.keyboard.down('ShiftLeft');
  await startForward();
  while(true){
   state=(await snapshot(page)).mission;
   const finished=await settle(state);if(finished)return finished;
   // Test the unchanged exact radius before the unchanged wall deadline.
   if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(state)}`);
   const desired=Math.atan2(-(target.x-state.player.x),-(target.z-state.player.z));
   const delta=Math.atan2(Math.sin(desired-state.player.yaw),Math.cos(desired-state.player.yaw));
   if(Math.abs(delta)>Math.PI/3){
    // A near-target overshoot can require a large turn. Stop real forward input
    // for that turn, avoiding an uncontrolled arc, then resume genuine walking.
    await stopForward();await turnToward(page,target);
    state=(await snapshot(page)).mission;
    const turned=await settle(state);if(turned)return turned;
   }else{
    // Keep W/Shift held through small corrections and intermediate observations.
    // Recheck the actual pose after each arrow, so correction cannot hide arrival.
    const count=Math.min(3,Math.round(Math.abs(delta)/.0484));
    for(let i=0;i<count;i++){
     await page.keyboard.press(delta>0?'ArrowLeft':'ArrowRight');
     state=(await snapshot(page)).mission;
     const corrected=await settle(state);if(corrected)return corrected;
    }
   }
   if(Date.now()>=deadline)continue;
   await startForward();
   const before=state;
   const beforeProbe=await settle(before);if(beforeProbe)return beforeProbe;
   // Only actual arrival releases the held movement keys. A bounded probe
   // merely observes progress/physics, retaining input through IPC/GPU delays.
   const distance=Math.hypot(target.x-before.player.x,target.z-before.player.z);
   const milestone=Math.min(2,Math.max(.12,(distance-radius)*.7));
   let after=before;
   try{
    await expect.poll(async()=>{
     after=(await snapshot(page)).mission;
     if(inspect(after))return true;
     return after.player.distance-before.player.distance>=milestone||after.elapsed-before.elapsed>=.45;
    },{timeout:Math.min(5000,Math.max(1,deadline-Date.now())),intervals:[20,40,80,100]}).toBe(true);
   }catch(error){
    const final=(await snapshot(page)).mission;
    const observed=await settle(final);if(observed)return observed;
    if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(final)}`,{cause:error});
    throw error;
   }
   const arrived=await settle(after);if(arrived)return arrived;
   const simulated=after.elapsed-before.elapsed;
   if(simulated>=.4&&Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)<.035)unchanged++;else unchanged=0;
   if(unchanged>9)throw new Error(`actual walking blocked en route to ${JSON.stringify(target)}: ${JSON.stringify(after)}`);
  }
 }finally{
  try{await page.keyboard.up('KeyW');}finally{await page.keyboard.up('ShiftLeft');}
 }
}
