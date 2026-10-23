import {observeActualWalkSegment} from './walk-progress-probe.mjs';

/**
 * Read the real Mission through native browser protocol tasks, not a timer
 * executing inside the busy WebGL document. Keep the original predicate and
 * its test-owned elapsed anchor in the driver. Never inject input or step the
 * game. One sample at a time; errors propagate, with no retries or fallback.
 */
export async function waitForDriverWalkObservation(page, observation, options) {
  const {timeout,polling}=options??{};
  if(!Number.isFinite(timeout)||timeout<=0||timeout>5000||
     !Number.isFinite(polling)||polling<=0||polling>1000)
    throw new RangeError('walk observer must retain the original five-second budget');
  const owned={...observation,target:{...observation.target}};
  let deadlineTimer,pollTimer,wakePoll,finished=false,lastSample=null;
  const operation=(async()=>{
    for(;;){
      const sample=await page.evaluate(()=>window.__RECLAIM__.snapshot().mission);
      if(finished)return;
      lastSample=sample;
      const reason=observeActualWalkSegment(owned,sample);
      if(reason)return reason;
      await new Promise(resolve=>{wakePoll=resolve;pollTimer=setTimeout(resolve,polling);});
      wakePoll=undefined;
      if(finished)return;
    }
  })();
  try{
    return await Promise.race([
      operation,
      new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>{
        const error=new Error(`Actual walk observation exceeded ${timeout}ms; last sample: ${JSON.stringify(lastSample)}`);
        error.name='TimeoutError';reject(error);
      },timeout);}),
    ]);
  }finally{
    finished=true;clearTimeout(deadlineTimer);clearTimeout(pollTimer);wakePoll?.();
  }
}
