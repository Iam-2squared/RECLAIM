import {expect} from '@playwright/test';
import {arrowSteps} from './native-arrow-input.mjs';
import {walkObserverOptions} from './walk-observer-options.mjs';
import {waitForDriverWalkObservation} from './driver-walk-observer.mjs';
import {withNativePrecisionInputGuard} from './native-precision-input-guard.mjs';
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
 const count=Math.round(Math.abs(delta)/.0484);await arrowSteps(page.keyboard,delta>0?'ArrowLeft':'ArrowRight',count);
 if(target.y!==undefined){const pitch=Math.atan2(target.y-(player.y+1.62),Math.hypot(target.x-player.x,target.z-player.z)),dp=pitch-player.pitch;await arrowSteps(page.keyboard,dp>0?'ArrowUp':'ArrowDown',Math.round(Math.abs(dp)/.0484));}
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
 const deadline=Date.now()+maxMs,nearRange=8,precisionRange=Math.min(nearRange,radius+2);let unchanged=0,forwardHeld=false,sprintHeld=false,state=null;
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
 const setSprint=async on=>{if(on===sprintHeld)return;if(on)await page.keyboard.down('ShiftLeft');else await page.keyboard.up('ShiftLeft');sprintHeld=on;};
 const settle=async state=>{
  if(!inspect(state))return null;
  await stopForward();
  // The release is a real input too. Verify its resulting position, rather
  // than reporting an earlier radius crossing if a slow response overshot it.
  const stopped=(await snapshot(page)).mission;
  state=stopped;
  return inspect(stopped)?stopped:null;
 };
 const probe=async(simSeconds,mode,initialTargetDistance,firstElapsed)=>{
  const remaining=deadline-Date.now();if(remaining<=0)return;
  const stopRange=mode==='far'?nearRange:mode==='walk'?precisionRange:null;
  let keepForward=false;
  try{
   // Schedule read-only observations from the driver, not a timer inside
   // the busy WebGL page. Native input, genuine Mission snapshots, original
   // geometric predicates and the five-second segment deadline stay intact.
   // Anchor elapsed simulation to the actual pre-keydown Mission snapshot.
   // A software-GPU stall may delay the first read until after real movement;
   // restarting elapsed time at that read loses genuine simulation progress.
   // Native input, arrival radius, and the 5s/50s budgets are unchanged.
   const reason=await waitForDriverWalkObservation(page,{
    target,radius,stopRange,firstElapsed,simSeconds,initialTargetDistance,
    // Observation checkpoints are not arrival tolerances; all exact
    // geometric criteria and 5s/50s deadlines remain unchanged.
    progressMetres:mode==='far'?.6:mode==='walk'?.25:null,
   },walkObserverOptions(remaining));
   // Release sprint at eight metres but keep genuine walking continuous until
   // the final precision zone. Arrival still requires the fresh stopped pose.
   if(mode!=='precision'){
    if(mode==='far'&&reason==='near')await setSprint(false);
    keepForward=reason==='elapsed'||reason==='progress'||(mode==='far'&&reason==='near');
   }
  }finally{
   // Release the real near-target key before the next sampled observation.
   if(!keepForward)await stopForward();
  }
 };
 try{
  state=(await snapshot(page)).mission;
  const already=await settle(state);if(already)return already;
  if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(state)}`);
  await turnToward(page,target); // Initial aim is stationary, including the small cabin approach.
  state=(await snapshot(page)).mission;
  const aimed=await settle(state);if(aimed)return aimed;
  while(true){
   state=(await snapshot(page)).mission;
   const finished=await settle(state);if(finished)return finished;
   // Test the unchanged exact radius before the unchanged wall deadline.
   if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(state)}`);
   let distance=Math.hypot(target.x-state.player.x,target.z-state.player.z);
   let precision=distance<=precisionRange;
   if(precision){
    // Only the final two metres beyond the exact radius use short pulses.
    // Stationary re-aim here controls overshoot under delayed GPU replies.
    await stopForward();await setSprint(false);await turnToward(page,target);
   }else{
    await setSprint(sprint&&distance>nearRange);
    const desired=Math.atan2(-(target.x-state.player.x),-(target.z-state.player.z));
    const delta=Math.atan2(Math.sin(desired-state.player.yaw),Math.cos(desired-state.player.yaw));
    if(Math.abs(delta)>Math.PI/3){await stopForward();await turnToward(page,target);}
    else for(let i=0;i<Math.min(2,Math.round(Math.abs(delta)/.0484));i++){
     await page.keyboard.press(delta>0?'ArrowLeft':'ArrowRight');
     state=(await snapshot(page)).mission;
     const corrected=await settle(state);if(corrected)return corrected;
    }
   }
   state=(await snapshot(page)).mission;
   const aimedNow=await settle(state);if(aimedNow)return aimedNow;
   if(Date.now()>=deadline)continue;
   distance=Math.hypot(target.x-state.player.x,target.z-state.player.z);
   if(!precision&&distance<=precisionRange){
    await stopForward();await setSprint(false);await turnToward(page,target);
    state=(await snapshot(page)).mission;
    const aligned=await settle(state);if(aligned)return aligned;
    if(Date.now()>=deadline)continue;
    distance=Math.hypot(target.x-state.player.x,target.z-state.player.z);precision=true;
   }
   const mode=precision?'precision':distance<=nearRange?'walk':'far';
   if(mode!=='far')await setSprint(false);
   const before=state;
   // Test action durations do not alter gameplay speed or fixed physics steps.
   const simSeconds=precision?Math.max(1/60,Math.min(.12,(distance-radius)/(3.1*2))):.4;
   await startForward();
   try{
    // Under SwiftShader the read-only polling callback may stall while KeyW
    // keeps advancing the real 60Hz player. Guard only the near-target pulse
    // via Playwright's native keyup, without changing radius or deadlines.
    if(precision) await withNativePrecisionInputGuard(stopForward,()=>probe(simSeconds,mode,distance,before.elapsed));
    else await probe(simSeconds,mode,distance,before.elapsed);
   }catch(error){
    await stopForward();
    const final=(await snapshot(page)).mission;
    const observed=await settle(final);if(observed)return observed;
    if(Date.now()>=deadline)throw new Error(`actual walking timed out at ${JSON.stringify(final)}`,{cause:error});
    throw error;
   }
   if(precision)await stopForward();
   const after=(await snapshot(page)).mission;
   const arrived=await settle(after);if(arrived)return arrived;
   const simulated=after.elapsed-before.elapsed;
   if(simulated>=.4&&Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)<.035)unchanged++;else unchanged=0;
   if(unchanged>9)throw new Error(`actual walking blocked en route to ${JSON.stringify(target)}: ${JSON.stringify(after)}`);
  }
 }finally{
  try{await page.keyboard.up('KeyW');}finally{await page.keyboard.up('ShiftLeft');}
 }
}

/** Measure the actual flight before input so a transient frame is retained. */
export async function observedJump(page,{held=false,maxMs=5000}={}){
 const initial=(await snapshot(page)).mission;
 if(!initial||initial.paused||!initial.locked||!initial.player.grounded)throw new Error('jump requires a real active grounded player');
 const baseline=initial.player.y;let success=false;
 await page.evaluate(()=>{
  const old=window.__RECLAIM_JUMP_OBSERVER;if(old){old.active=false;cancelAnimationFrame(old.raf);}
  const log={active:true,raf:0,samples:[]};window.__RECLAIM_JUMP_OBSERVER=log;
  const observe=()=>{
   if(!log.active||log.samples.length>=300)return;
   const m=window.__RECLAIM__.snapshot().mission;
   if(m)log.samples.push({at:performance.now(),elapsed:m.elapsed,grounded:m.player.grounded,y:m.player.y,keys:m.keys,frames:m.frames});
   log.raf=requestAnimationFrame(observe);
  };
  log.raf=requestAnimationFrame(observe);
 });
 try{
  if(held)await page.keyboard.down('Space');else await page.keyboard.press('Space');
  let handle;
  try{
   handle=await page.waitForFunction(baseline=>window.__RECLAIM_JUMP_OBSERVER.samples.some(s=>s.grounded===false&&s.y>baseline+.01),baseline,{polling:'raf',timeout:maxMs});
  }finally{await handle?.dispose();}
  handle=null;
  try{
   handle=await page.waitForFunction(baseline=>{
    const samples=window.__RECLAIM_JUMP_OBSERVER.samples,air=samples.findIndex(s=>s.grounded===false&&s.y>baseline+.01);
    return air>=0&&samples.some((s,i)=>i>air&&s.grounded===true&&Math.abs(s.y-baseline)<.1);
   },baseline,{polling:'raf',timeout:maxMs});
  }finally{await handle?.dispose();}
  const samples=await page.evaluate(()=>window.__RECLAIM_JUMP_OBSERVER.samples);
  success=true;return{baseline,held,samples};
 }finally{
  try{await page.evaluate(()=>{const log=window.__RECLAIM_JUMP_OBSERVER;if(log){log.active=false;cancelAnimationFrame(log.raf);}});}
  finally{if(!held||!success)await page.keyboard.up('Space');}
 }
}
