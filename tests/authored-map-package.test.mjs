import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { collectAuthoredMapAssets } from '../scripts/authored-map-package.mjs';

test('offline authored map round-trips the exact verified viewer and rejects asset tampering', async () => {
 const root=await mkdtemp(join(tmpdir(),'reclaim-authored-map-'));
 try {
  const folder=join(root,'home-map');await mkdir(folder);
  const viewer=Buffer.from('<!doctype html><html lang="ja"><title>知床</title><script>window.ready=true</script></html>');
  const preview=await readFile(resolve('public/home-map/overview.webp'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const manifest={id:'shiretoko-authored',revision:'fixture',runtimeViewer:{path:'home-map/shiretoko.html',sha256:hash(viewer),bytes:viewer.length},runtimePreview:{path:'home-map/overview.webp',sha256:hash(preview)},sourceData:{sha256:'data'},sourceModel:{sha256:'model'},viewerUnmodified:true,embeddedDataMatchesSource:true,externalResources:0,features:['始まりの家','廃倉庫']};
  await writeFile(join(folder,'shiretoko.html'),viewer);await writeFile(join(folder,'overview.webp'),preview);await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest));
  const packed=await collectAuthoredMapAssets(root);
  assert.deepEqual(gunzipSync(Buffer.from(packed.payload.htmlGzipBase64,'base64')),viewer);
  assert.deepEqual(Buffer.from(packed.payload.previewUrl.split(',')[1],'base64'),preview);
  assert.equal(packed.record.htmlSha256,hash(viewer));
  await writeFile(join(folder,'shiretoko.html'),Buffer.concat([viewer,Buffer.from('altered')]));
  await assert.rejects(()=>collectAuthoredMapAssets(root),/differs from manifest/);
  await writeFile(join(folder,'shiretoko.html'),viewer);await writeFile(join(folder,'overview.webp'),Buffer.from('altered'));
  await assert.rejects(()=>collectAuthoredMapAssets(root),/preview differs from manifest/);
  await writeFile(join(folder,'overview.webp'),preview);manifest.externalResources=1;await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(()=>collectAuthoredMapAssets(root),/source validation missing/);
 } finally {await rm(root,{recursive:true,force:true});}
});
