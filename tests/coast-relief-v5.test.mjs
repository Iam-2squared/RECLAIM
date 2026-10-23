import test from 'node:test';
import assert from 'node:assert/strict';
import {farCoastReliefV5 as relief,RELIEF_V5 as config} from '../src/shiretoko-phase1/coast-relief-v5.ts';

const coast=()=>0;
const at=(base,x,z)=>relief(x,z,base,coast);

test('far-shore candidate smooths X and Z discontinuities, not just their appearance',()=>{
  const xWall=x=>x>=0?195:-28;
  const zWall=(_x,z)=>z>=-2000?195:-28;
  assert(Math.abs(at(xWall,0,-2000)-at(xWall,-20,-2000))<80);
  assert(Math.abs(at(zWall,0,-2000)-at(zWall,0,-2020))<80);
});

test('playable 2400m square and unaffected far boundary stay bit identical',()=>{
  const base=(x,z)=>103+Math.sin(x*.017)*21+z*.002;
  for(const z of [-5800,-5600,-1200,-800,0,850,1200])
    for(const x of [-2800,-1000,-170,0,990,2100])
      assert.equal(at(base,x,z),base(x,z));
});

test('seaward and deep-inland masks avoid all neighbour samples',()=>{
  let calls=0;
  const base=(x,z)=>{calls++;return x+z;};
  assert.equal(relief(20,-2100,base,()=>-900),-2080);assert.equal(calls,1);
  calls=0;assert.equal(relief(20,-2100,base,()=>1400),-2080);assert.equal(calls,1);
});

test('masked kernel has strict nine-height read budget and deterministic output',()=>{
  let calls=0;
  const base=(x,z)=>{calls++;return x*.002+Math.cos(z*.002);};
  const first=at(base,0,-2100);
  assert.equal(calls,config.maxBaseSamplesPerVertex);
  assert.equal(first,at(base,0,-2100));
});

test('nonfinite neighbour cannot infect surrounding valid mesh vertices',()=>{
  const base=x=>x===140?NaN:73;
  assert.equal(at(base,0,-2100),73);
  assert(Number.isNaN(relief(NaN,-2100,()=>NaN,coast)));
});

test('blend envelope stays continuous at all four z transitions',()=>{
  const base=(x,z)=>Math.sin(x*.01+z*.005)*90;
  for(const boundary of [-5600,-5000,-1400,-1200]){
    const left=at(base,0,boundary-.001),right=at(base,0,boundary+.001);
    assert(Math.abs(left-right)<.05, `height jump at ${boundary}: ${left} -> ${right}`);
  }
});

test('terrain source shares far-shore relief with mesh vertex normals but not walking height samples',async()=>{
  const {ShiretokoTerrain,rawHeight,coastDistance,TERRAIN}=await import('../src/shiretoko-phase1/terrain.ts');
  const terrain=new ShiretokoTerrain();
  const x=-1080,z=-2300;
  const expected=relief(x,z,rawHeight,coastDistance);
  assert.equal(terrain.surfaceAt(x,z),expected);
  assert.equal(terrain.vertexAt(x,z).y,expected);
  const source=terrain.surfaceAt(0,-1000);
  assert.equal(source,terrain.heightAt(0,-1000));
  assert.equal(TERRAIN.cell,5);assert.equal(TERRAIN.chunk,300);
});
