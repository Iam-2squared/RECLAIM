import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainGpuFrameGate} from '../src/shiretoko-phase1/gpu-frame-gate.ts';

function fixture() {
  const calls=[],states=new Map(),syncs=[];
  let lost=false,allocationFails=false;
  const gl={
    ALREADY_SIGNALED:1,CONDITION_SATISFIED:2,TIMEOUT_EXPIRED:3,WAIT_FAILED:4,
    SYNC_GPU_COMMANDS_COMPLETE:5,
    isContextLost:()=>lost,
    clientWaitSync:(sync,flags,timeout)=>{
      assert.equal(flags,0);assert.equal(timeout,0);
      calls.push('poll:'+sync.id);return states.get(sync);
    },
    fenceSync:(kind,flags)=>{
      assert.equal(kind,5);assert.equal(flags,0);
      if(allocationFails)return null;
      const sync={id:syncs.length};syncs.push(sync);states.set(sync,3);
      calls.push('fence:'+sync.id);return sync;
    },
    flush:()=>calls.push('flush'),
    deleteSync:sync=>{assert.ok(states.has(sync));states.delete(sync);calls.push('delete:'+sync.id);},
  };
  return {gate:new TerrainGpuFrameGate(gl),calls,syncs,states,
    signal:(i)=>states.set(syncs[i],2),
    fail:(i)=>states.set(syncs[i],4),
    lose:()=>lost=true,
    failAllocation:()=>allocationFails=true,
  };
}

test('a stalled software GPU keeps no more than two full-resolution frames in flight',()=>{
  const f=fixture();assert.equal(f.gate.canSubmit(),true);
  f.gate.submitted();assert.equal(f.syncs.length,1);
  assert.equal(f.gate.canSubmit(),true);
  f.gate.submitted();assert.equal(f.syncs.length,2);
  for(let i=0;i<100;i++)assert.equal(f.gate.canSubmit(),false);
  assert.equal(f.syncs.length,2,'skipped frames must not claim a GPU submission');
  f.signal(0);assert.equal(f.gate.canSubmit(),true);
  assert.ok(f.calls.includes('delete:0'));
  f.gate.submitted();assert.equal(f.syncs.length,3);
  f.gate.dispose();assert.equal(f.states.size,0);
  assert.equal(f.calls.filter(x=>x==='delete:1').length,1);
  assert.equal(f.calls.filter(x=>x==='delete:2').length,1);
});

test('each completed GPU fence retires once; no duplicate frees across lifecycle',()=>{
  const f=fixture();f.gate.submitted();f.signal(0);
  assert.equal(f.gate.canSubmit(),true);
  assert.equal(f.gate.canSubmit(),true);
  f.gate.dispose();
  assert.deepEqual(f.calls,['fence:0','flush','poll:0','delete:0']);
});

test('GPU fence errors fail closed instead of masking an incomplete draw',()=>{
  const f=fixture();f.gate.submitted();f.fail(0);
  assert.throws(()=>f.gate.canSubmit(),/fence failed/);
  f.gate.dispose();
  assert.equal(f.states.size,0);
  assert.deepEqual(f.calls.slice(-1),['delete:0']);
});

test('lost context does not issue another frame and release remains explicit',()=>{
  const f=fixture();f.gate.submitted();f.lose();
  assert.equal(f.gate.canSubmit(),false);
  assert.equal(f.syncs.length,1);
  f.gate.dispose();assert.equal(f.states.size,0);
});

test('fence creation failure is reported, not treated as a completed frame',()=>{
  const f=fixture();f.failAllocation();
  assert.throws(()=>f.gate.submitted(),/Unable to fence/);
  assert.equal(f.syncs.length,0);
  assert.equal(f.calls.includes('flush'),false);
});
