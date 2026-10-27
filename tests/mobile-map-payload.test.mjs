import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { decodeAuthoredMapGzip, loadAuthoredMapData } from '../src/world/authored-map-data.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture={meshes:[{name:'terrain',positions:[0,0,0],indices:[0]}],structures:[{name:'cabin',positions:[0,0,0],indices:[0]}],atmosphere:{preset:'purple_storm'}};
const viewer=data=>`<script>const terrainGzipBase64='${gzipSync(JSON.stringify(data)).toString('base64')}'</script>`;

test('mobile transport preserves every source geometry, collider and route value while shrinking only texture assets',async()=>{
  const [source,compressed,manifestBytes,sourceManifestBytes]=await Promise.all([
    readFile(new URL('../public/home-map/shiretoko.html',import.meta.url)),
    readFile(new URL('../public/home-map/shiretoko-mobile.json.gz',import.meta.url)),
    readFile(new URL('../public/home-map/shiretoko-mobile.manifest.json',import.meta.url)),
    readFile(new URL('../public/home-map/manifest.json',import.meta.url)),
  ]);
  const manifest=JSON.parse(manifestBytes),sourceManifest=JSON.parse(sourceManifestBytes);
  assert.equal(hash(source),sourceManifest.runtimeViewer.sha256);
  assert.equal(hash(source),manifest.sourceViewerSha256);
  assert.equal(hash(compressed),manifest.mobileGzipSha256);
  assert(compressed.length<source.length*.15,'mobile map transfer must shrink by at least85%');
  const encoded=source.toString().match(/\bconst\s+terrainGzipBase64\s*=\s*["']([A-Za-z0-9+/=]+)["']/)[1];
  const original=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'))),mobile=JSON.parse(gunzipSync(compressed));
  const {textures:oldTextures,...originalWorld}=original,{textures:newTextures,...mobileWorld}=mobile;
  assert.deepEqual(mobileWorld,originalWorld,'the original playable world and its physics must remain exact');
  assert.deepEqual(Object.keys(newTextures),Object.keys(oldTextures).filter(name=>!/normal/i.test(name)));
  for(const record of manifest.textures){
    assert(record.dimensions.every(value=>value<=1024));
    const encodedImage=newTextures[record.name].url;
    assert(encodedImage.startsWith('data:image/webp;base64,'));
    assert.equal(hash(Buffer.from(encodedImage.split(',')[1],'base64')),record.sha256);
  }
});

test('mobile and desktop loads have independent caches, retry failed transfers, and accept decoded gzip responses',async()=>{
  const originalFetch=globalThis.fetch,requests=[];let failMobile=true;
  globalThis.fetch=async url=>{
    requests.push(url);
    if(String(url).endsWith('shiretoko-mobile.json.gz')){
      if(failMobile){failMobile=false;return new Response('',{status:503});}
      return new Response(gzipSync(JSON.stringify(fixture)));
    }
    return new Response(viewer(fixture));
  };
  try{
    await assert.rejects(loadAuthoredMapData({mobile:true}),/503/);
    const mobile=loadAuthoredMapData({mobile:true});
    assert.equal(mobile,loadAuthoredMapData({mobile:true}));
    const desktop=loadAuthoredMapData();assert.notEqual(mobile,desktop);
    assert.deepEqual(await mobile,fixture);assert.deepEqual(await desktop,fixture);
    assert.equal(requests.filter(url=>String(url).endsWith('.json.gz')).length,2);
    assert.equal(requests.filter(url=>String(url).endsWith('shiretoko.html')).length,1);
    assert.deepEqual(await decodeAuthoredMapGzip(new Response(JSON.stringify(fixture))),fixture);
  }finally{globalThis.fetch=originalFetch;}
});

test('mobile standalone continues using its embedded verified viewer without requesting the network variant',async()=>{
  const originalDocument=globalThis.document,originalFetch=globalThis.fetch;
  globalThis.document={getElementById:id=>id==='reclaim-authored-map'?{textContent:JSON.stringify({htmlGzipBase64:gzipSync(viewer(fixture)).toString('base64')})}:null};
  globalThis.fetch=()=>{throw Error('standalone must not fetch');};
  try{
    const embedded=await import('../src/world/authored-map-data.ts?mobile-embedded-check');
    assert.deepEqual(await embedded.loadAuthoredMapData({mobile:true}),fixture);
  }finally{globalThis.document=originalDocument;globalThis.fetch=originalFetch;}
});
