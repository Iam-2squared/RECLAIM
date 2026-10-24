/**
 * Send the SAME bounded arrow keydowns through Playwright's native keyboard.
 * No DOM dispatchEvent, pose mutation, teleport, timing or radius relaxation.
 * Await all outstanding inputs before keyup, including a rejected dispatch.
 * Batching prevents 2*65 protocol round trips from consuming a 50s walk budget
 * before W is ever pressed on a software-rendered runner.
 */
export const ARROW_INPUT_LIMITS = Object.freeze({batch:8,maxSteps:65});
export async function arrowSteps(keyboard,key,count) {
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)||
    !Number.isInteger(count)||count<0||count>ARROW_INPUT_LIMITS.maxSteps)
  throw new RangeError('invalid bounded arrow input');
 if(count===0)return;
 try {
  for(let offset=0;offset<count;offset+=ARROW_INPUT_LIMITS.batch){
   const n=Math.min(ARROW_INPUT_LIMITS.batch,count-offset);
   const results=await Promise.allSettled(Array.from({length:n},()=>Promise.resolve().then(()=>keyboard.down(key))));
   const failed=results.find(result=>result.status==='rejected');
   if(failed)throw failed.reason;
  }
 } finally { await keyboard.up(key); }
}
