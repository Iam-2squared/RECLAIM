import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/shiretoko-phase1/preview.ts',import.meta.url),'utf8');
test('standalone terminal disposal releases real GL context before detaching canvas',()=>{
 const start=source.indexOf('function dispose() {');
 assert(start>0,'standalone terrain must own an explicit disposer');
 const stop=source.indexOf("on(window, 'pagehide'",start);
 assert(stop>start,'pagehide must also use the same terminal disposer');
 const block=source.slice(start,stop);
 const parts=['geometries.forEach(g => g.dispose())','materials.forEach(m => m.dispose())',
  'detail.dispose()','height.dispose()','renderer.dispose()','renderer.forceContextLoss()',
  'renderer.domElement.remove()','scene.clear()'];
 let last=-1;
 for(const step of parts){
  const index=block.indexOf(step);
  assert(index>last,'invalid geometry/GL/canvas cleanup ordering: '+step);
  last=index;
 }
 assert.equal((source.match(/renderer\.forceContextLoss\(\)/g)||[]).length,1,
  'context must be lost only during final standalone disposal');
});
