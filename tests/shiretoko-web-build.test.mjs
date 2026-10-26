import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { appendShiretokoReview, reviewBuildOptions } from '../scripts/build-shiretoko-web.mjs';

const REVIEW='<!doctype html><html><title>SHIRETOKO</title><body>Shiretoko 3D</body></html>';
async function fixture(callback) {
 const root=await mkdtemp(join(tmpdir(),'reclaim-review-fixture-'));
 const dist=resolve(root,'dist');
 await mkdir(resolve(dist,'assets'),{recursive:true});
 await writeFile(resolve(dist,'index.html'),'<html>APPROVED TITLE and HOME</html>');
 await writeFile(resolve(dist,'assets/existing.css'),'body{color:white}');
 try { await callback({root,dist}); } finally { await rm(root,{recursive:true,force:true}); }
}
async function emit(opts,files) {
 for(const [name,body] of Object.entries(files)) {
  const dest=resolve(opts.build.outDir,name);
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,body);
 }
}
test('appends opt-in 3D page without changing approved index or existing assets',async()=>{
 await fixture(async ({root,dist})=>{
  const linkedReview=REVIEW.replace('</body>','<script src="./assets/shiretoko.js"></script></body>');
  const r=await appendShiretokoReview({root,build:opts=>emit(opts,{
   'shiretoko-terrain.html':linkedReview,'assets/shiretoko.js':'console.log("Shiretoko")',
  })});
  assert.deepEqual(r,{review:'shiretoko-terrain.html',created:2,reused:0});
  assert.equal(await readFile(resolve(dist,'index.html'),'utf8'),'<html>APPROVED TITLE and HOME</html>');
  assert.equal(await readFile(resolve(dist,'assets/existing.css'),'utf8'),'body{color:white}');
  assert.equal(await readFile(resolve(dist,'shiretoko-terrain.html'),'utf8'),linkedReview);
 });
});
test('a failed Vite build and missing HTML do not modify production',async()=>{
 await fixture(async ({root,dist})=>{
  await assert.rejects(appendShiretokoReview({root,build:async()=>{throw Error('failed build');}}),/failed build/);
  await assert.rejects(appendShiretokoReview({root,build:async()=>{}}),/did not emit/);
  assert.deepEqual((await readdir(dist)).sort(),['assets','index.html']);
 });
});
test('hash collision is rejected before any new file is exposed',async()=>{
 await fixture(async ({root,dist})=>{
  await assert.rejects(appendShiretokoReview({root,build:opts=>emit(opts,{
   'shiretoko-terrain.html':REVIEW,'assets/shiretoko.js':'ok','assets/existing.css':'tampered'
  })}),/collides/);
  await assert.rejects(readFile(resolve(dist,'shiretoko-terrain.html')),/ENOENT/);
  await assert.rejects(readFile(resolve(dist,'assets/shiretoko.js')),/ENOENT/);
  assert.equal(await readFile(resolve(dist,'assets/existing.css'),'utf8'),'body{color:white}');
 });
});
test('dangling and remote runtime dependencies fail closed',async()=>{
 await fixture(async ({root,dist})=>{
  await assert.rejects(appendShiretokoReview({root,build:opts=>emit(opts,{
   'shiretoko-terrain.html':'<html>Shiretoko<script src="./assets/missing.js"></script></html>'
  })}),/Missing review asset/);
  await assert.rejects(appendShiretokoReview({root,build:opts=>emit(opts,{
   'shiretoko-terrain.html':'<html>Shiretoko<script src="https://example.invalid/a.js"></script></html>'
  })}),/External runtime/);
  assert.deepEqual((await readdir(dist)).sort(),['assets','index.html']);
 });
});
test('extra HTML and symlink entries cannot change the approved deployment',async()=>{
 await fixture(async ({root,dist})=>{
  await assert.rejects(appendShiretokoReview({root,build:opts=>emit(opts,{
   'shiretoko-terrain.html':REVIEW,'unapproved.html':'<html>Other</html>'
  })}),/additional HTML/);
  await assert.rejects(appendShiretokoReview({root,build:async opts=>{
   await emit(opts,{'shiretoko-terrain.html':REVIEW});
   await symlink(resolve(dist,'index.html'),resolve(opts.build.outDir,'danger'));
  }}),/symlink/);
  assert.deepEqual((await readdir(dist)).sort(),['assets','index.html']);
 });
});
test('staging config is single-entry, isolated, offline and safe from public-dir copies',()=>{
 const cfg=reviewBuildOptions('/repo','/tmp/separate');
 assert.equal(cfg.configFile,false);
 assert.equal(cfg.publicDir,false);
 assert.equal(cfg.base,'./');
 assert.equal(cfg.build.outDir,'/tmp/separate');
 assert.equal(cfg.build.emptyOutDir,true);
 assert.deepEqual(Object.keys(cfg.build.rollupOptions.input),['shiretoko-terrain']);
});
