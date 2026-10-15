import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {REFERENCE_SIZE,REFERENCE_RECTS,referencePercent} from '../src/reference-layout.ts';
test('reference composition is the complete 1536x864 source, not a cropped canvas',()=>{
 assert.deepEqual(REFERENCE_SIZE,{width:1536,height:864});assert.equal(REFERENCE_SIZE.width/REFERENCE_SIZE.height,16/9);
});
test('all twenty measured native hit regions remain within the original artwork',()=>{
 assert.equal(Object.keys(REFERENCE_RECTS).length,20);
 for(const [name,[x,y,w,h]] of Object.entries(REFERENCE_RECTS)){
  assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1536&&y+h<=864,name);
  const p=referencePercent(name);assert.ok(Math.abs(p.left*1536/100-x)<1e-9,name);assert.ok(Math.abs(p.top*864/100-y)<1e-9,name);
 }
});
test('title actions and HOME five-menu rows do not overlap or reorder',()=>{
 for(const names of [['titleStart','titleContinue','titleSettings','titleExtras'],['homeMap','homeCharacter','homeWeapons','homeBoss','homeRanking']]){
  for(let i=1;i<names.length;i++){const prior=REFERENCE_RECTS[names[i-1]],next=REFERENCE_RECTS[names[i]];assert.ok(prior[1]+prior[3]<=next[1],names[i]);}
 }
});
test('both supplied JPEG sources are byte-identified and contain no remote asset dependency',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../src/ui-reference/manifest.json',import.meta.url),'utf8'));
 for(const image of manifest.images){const bytes=readFileSync(new URL('../src/ui-reference/'+image.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256);assert.equal(bytes[0],255);assert.equal(bytes[1],216);}
 assert.equal(manifest.images.length,2);assert.equal(manifest.newDependencies,0);
});
