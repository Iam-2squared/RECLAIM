import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionRenderBackpressure } from '../src/mission/render-backpressure.ts';
import { TerrainGpuFrameGate } from '../src/shiretoko-phase1/gpu-frame-gate.ts';

function fixture() {
  let next=0, lost=false, allocate=true, waits=0, flushes=0;
  const state=new Map(), deleted=new Set();
  const gl={ALREADY_SIGNALED:1,CONDITION_SATISFIED:2,TIMEOUT_EXPIRED:3,SYNC_GPU_COMMANDS_COMPLETE:4,
    isContextLost:()=>lost,
    clientWaitSync(sync,flags,timeout){assert.equal(flags,0);assert.equal(timeout,0);waits++;return state.get(sync);},
    fenceSync(kind,flags){assert.equal(kind,4);assert.equal(flags,0);if(!allocate)return null;const sync={id:++next};state.set(sync,3);return sync;},
    deleteSync(sync){assert(!deleted.has(sync),'fence must be released only once');deleted.add(sync);state.delete(sync);},
    flush(){flushes++;},
    getExtension(){throw Error('Shared renderer context must not be lost');},
    finish(){throw Error('No blocking GPU finish');},
  };
  return {gl,state,deleted,get waits(){return waits;},get flushes(){return flushes;},
    lose(){lost=true;},allocationFailure(){allocate=false;},signal(){for(const sync of state.keys())state.set(sync,1);}};
}

test('software GPU backlog is bounded to two real frames while simulation continues',()=>{
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);let steps=0,draws=0;
 for(let frame=0;frame<240;frame++){steps++;if(gate.canSubmit()){draws++;gate.submitted();}}
 assert.equal(steps,240);assert.equal(draws,2);assert.equal(f.state.size,2);
 assert.deepEqual(gate.snapshot(),{pending:2,deferred:238,disposed:false});assert.equal(f.flushes,2);
});
test('completed fences allow the next genuine frame without an artificial frame-rate limit',()=>{
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);
 for(let i=0;i<120;i++){f.signal();assert(gate.canSubmit());gate.submitted();}
 assert.equal(f.flushes,120);assert.equal(gate.snapshot().deferred,0);gate.dispose();assert.equal(f.deleted.size,120);
});
test('one completed frame frees one slot while the remaining frame stays outstanding',()=>{
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);gate.submitted();gate.submitted();
 f.state.set([...f.state.keys()][0],2);assert(gate.canSubmit());gate.submitted();assert.equal(gate.snapshot().pending,2);
 assert.equal(f.deleted.size,1);assert.equal(gate.canSubmit(),false);
});
test('ten Mission returns release every owned fence but preserve the shared WebGL context',()=>{
 const f=fixture();
 for(let i=0;i<10;i++){
  const gate=new MissionRenderBackpressure(f.gl);assert(gate.canSubmit());gate.submitted();gate.submitted();gate.dispose();gate.dispose();
  assert.equal(f.state.size,0);assert.equal(gate.canSubmit(),false);assert.throws(()=>gate.submitted(),/outside render budget/);
 }
 assert.equal(f.deleted.size,20);assert.equal(f.gl.isContextLost(),false);
 const next=new MissionRenderBackpressure(f.gl);assert(next.canSubmit());next.submitted();next.dispose();assert.equal(f.deleted.size,21);
});
test('context loss prevents new renders and still allows explicit fence cleanup',()=>{
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);gate.submitted();f.lose();assert.equal(gate.canSubmit(),false);
 gate.dispose();assert.equal(f.state.size,0);assert.equal(gate.snapshot().disposed,true);
});
test('failed GPU completion and allocation never fabricate a successful render',()=>{
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);gate.submitted();f.state.set([...f.state.keys()][0],-1);
 assert.throws(()=>gate.canSubmit(),/completion fence failed/);gate.dispose();
 const broken=fixture();broken.allocationFailure();const b=new MissionRenderBackpressure(broken.gl);
 assert.throws(()=>b.submitted(),/allocation failed/);assert.equal(b.snapshot().pending,0);
});
test('submitting without checking available capacity fails rather than growing the queue',()=>{
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);gate.submitted();gate.submitted();
 assert.throws(()=>gate.submitted(),/outside render budget/);assert.equal(f.state.size,2);gate.dispose();
});

test('actual Mission.update still advances fixed-step simulation before a deferred render',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=(await readFile(new URL('../src/mission/runtime.ts',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
 const update=source.match(/ update\(dt:number\)\{([\s\S]*?)\n \}/)?.[1];
 assert(update,'test must execute the actual Mission update body');
 const actualUpdate=new Function('document','SIMULATION_TIMING','dt',update);
 const render=source.match(/ render\(\)\{([^\n]*)\}\n updateHUD/)?.[1];
 assert(render,'test must execute actual Mission render body');
 const actualRender=new Function('performance',render);
 const f=fixture(),gate=new MissionRenderBackpressure(f.gl);let simulationTicks=0,draws=0,cameraUpdates=0;
 const mission={disposed:false,paused:false,needsFrame:true,hitFlash:0,hudClock:0,frames:0,frameTimes:[],renderBackpressure:gate,
  clock:{advance(dt,step){assert.equal(dt,1/60);step(dt);}},step(dt){simulationTicks++;assert.equal(dt,1/60);},
  updateCamera(){cameraUpdates++;},updateHUD(){},loader:{scene:{}},camera:{},
  renderer:{render(){draws++;}},render(){actualRender.call(this,{now:()=>0});}};
 for(let i=0;i<240;i++)actualUpdate.call(mission,{hidden:false},{maxFrameSeconds:.25},1/60);
 assert.equal(simulationTicks,240);assert.equal(cameraUpdates,240);assert.equal(draws,2);assert.equal(mission.frames,2);
 assert.equal(gate.snapshot().deferred,238);gate.dispose();
});


test('Shiretoko and Mission share the same bounded GPU ownership contract',()=>{
 for(const Gate of [TerrainGpuFrameGate,MissionRenderBackpressure]) {
  const f=fixture(),gate=new Gate(f.gl);let draws=0;
  for(let i=0;i<200;i++)if(gate.canSubmit()){gate.submitted();draws++;}
  assert.equal(draws,2);assert.equal(f.state.size,2);f.signal();assert(gate.canSubmit());
  gate.submitted();gate.dispose();assert.equal(f.state.size,0);assert.equal(f.gl.isContextLost(),false);
 }
});
