import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {collectSapporoBossAssets,SAPPORO_BOSS_IDS} from '../scripts/sapporo-boss-asset-package.mjs';
import {validateBossGlb} from '../scripts/boss-asset-package.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo=resolve(import.meta.dirname,'..');

test('only the selected tower small boss and station medium boss are packaged with preserved motion exports',async()=>{
  const {payload,records}=await collectSapporoBossAssets(resolve(repo,'public'));
  assert.deepEqual(Object.keys(payload),SAPPORO_BOSS_IDS);assert.deepEqual(records.map(r=>[r.id,r.rank,r.phase]),[['spider','小ボス',3],['snowblower','中ボス',4]]);
  for(const record of records){const bytes=Buffer.from(payload[record.id],'base64');assert.equal(sha(bytes),record.sha256);assert.equal(bytes.length,record.bytes);const gltf=validateBossGlb(bytes,record.id);assert.equal(gltf.animations.length,6);assert.ok(gltf.animations.every(a=>a.channels.length>0));}
  const manifest=JSON.parse(await readFile(resolve(repo,'public/sapporo-bosses/manifest.json'),'utf8'));
  for(const model of manifest.models){assert.ok(model.animatedBlender.endsWith('_animated.blend'));assert.ok(model.originalBlender.startsWith('character/ボス/札幌/'));}
});

test('packaged bosses remain byte-identical to available original motion exports',async t=>{
  // GitHub/standalone publications include validated packaged GLBs, but omit the
  // original authoring tree. When that tree exists, missing/changed exports fail.
  try{assert((await stat(resolve(repo,'../motion/characters'))).isDirectory());}
  catch(error){if(error?.code==='ENOENT'){t.skip('Original motion authoring directory is not included in this checkout');return;}throw error;}
  const manifest=JSON.parse(await readFile(resolve(repo,'public/sapporo-bosses/manifest.json'),'utf8'));
  for(const model of manifest.models){const original=await readFile(resolve(repo,'..',model.source));assert.equal(sha(original),model.sha256);}
});

test('packaging rejects altered bytes, incomplete selection and unexpected asset filenames',async()=>{
  const scratch=await mkdtemp(resolve(tmpdir(),'reclaim-sapporo-boss-assets-'));
  try{
    const directory=resolve(scratch,'sapporo-bosses');await mkdir(directory);const manifest=JSON.parse(await readFile(resolve(repo,'public/sapporo-bosses/manifest.json'),'utf8'));
    for(const model of manifest.models)await copyFile(resolve(repo,'public/sapporo-bosses',model.file),resolve(directory,model.file));
    await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest));await collectSapporoBossAssets(scratch);
    const model=manifest.models[0],bytes=await readFile(resolve(directory,model.file));bytes[bytes.length-1]^=1;await writeFile(resolve(directory,model.file),bytes);await assert.rejects(collectSapporoBossAssets(scratch),/hash differs/);
    manifest.models.pop();await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest));await assert.rejects(collectSapporoBossAssets(scratch),/Incomplete/);
    const clean=JSON.parse(await readFile(resolve(repo,'public/sapporo-bosses/manifest.json'),'utf8'));clean.models[0].file='../spider.glb';await writeFile(resolve(directory,'manifest.json'),JSON.stringify(clean));await assert.rejects(collectSapporoBossAssets(scratch),/filename/);
  }finally{assert.ok(resolve(scratch).startsWith(resolve(tmpdir())+sep));await rm(scratch,{recursive:true,force:true});}
});
