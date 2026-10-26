import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {AuthoredMapWorld,authoredVisualGeometry} from '../src/world/authored-map-world.ts';
import {authoredBase64Bytes,decodeAuthoredMapHtml} from '../src/world/authored-map-data.ts';

let prepared;
async function actualWorld(){
 if(!prepared)prepared=(async()=>{
  const html=await readFile(new URL('../public/home-map/shiretoko.html',import.meta.url),'utf8');
  const encoded=JSON.parse(html.match(/const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;/)[1]);
  const data=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')));
  const textures=new Map(Object.keys(data.textures??{}).map(name=>[name,new T.Texture()]));
  const world=new AuthoredMapWorld(data,'low',textures);return{data,world};
 })();return prepared;
}
after(async()=>{if(prepared){const{world}=await prepared;world.dispose();world.dispose();const stats=world.stats();assert.equal(stats.geometries,0);assert.equal(stats.materials,0);assert.equal(stats.textures,0);assert.equal(stats.approximateGpuBytes,0);assert.equal(stats.renderObjects,0);}});

test('batched actual-map meshes retain every source vertex, normal, UV, colour and triangle in order',async()=>{
 const{data,world}=await actualWorld(),rendered=new Map(),meshes=[];
 world.scene.traverse(object=>{if(object.userData.authoredSource){meshes.push(object);for(const range of object.userData.authoredRanges){assert.ok(!rendered.has(range.name));rendered.set(range.name,{object,range});}}});
 const sources=[...data.meshes,...data.structures];assert.equal(rendered.size,sources.length);assert.ok(meshes.length<sources.length);
 for(const source of sources){
  const{object,range}=rendered.get(source.name),expected=authoredVisualGeometry(source,!!data.colorsLinear),actual=object.geometry;
  assert.deepEqual(Object.keys(actual.attributes).sort(),Object.keys(expected.attributes).sort());
  assert.equal(range.vertexCount,expected.getAttribute('position').count);assert.equal(range.indexCount,expected.index.count);
  for(const[name,attribute]of Object.entries(expected.attributes)){
   const target=actual.getAttribute(name),begin=range.vertexStart*attribute.itemSize;
   assert.equal(target.itemSize,attribute.itemSize);assert.equal(target.normalized,attribute.normalized);
   assert.deepEqual(target.array.subarray(begin,begin+attribute.array.length),attribute.array,`${source.name} / ${name}`);
  }
  for(let index=0;index<expected.index.count;index++)if(actual.index.array[range.indexStart+index]!==expected.index.array[index]+range.vertexStart)assert.fail(`Changed triangle index in ${source.name}`);
  expected.dispose();
 }
 const stats=world.stats();assert.equal(stats.authoredTerrainMeshes,12);assert.equal(stats.authoredStructureMeshes,64);assert.equal(stats.totalAuthoredInstances,data.vegetation.instances.length);
 assert.equal(stats.authoredRenderMeshes,meshes.length);assert.ok(stats.materials<15,'Equivalent world materials are shared.');
});

test('static map matrices and stationary visibility avoid repeated work while actors remain dynamic',async()=>{
 const{world}=await actualWorld(),staticMeshes=[];world.scene.traverse(object=>{if(object.isMesh&&!object.name.includes('purple-storm-sky'))staticMeshes.push(object);});
 let matrixCompositions=0;const restore=[];
 for(const object of staticMeshes){const original=object.updateMatrix;object.updateMatrix=function(){matrixCompositions++;return original.call(this);};restore.push(()=>object.updateMatrix=original);}
 for(let frame=0;frame<120;frame++)world.scene.updateMatrixWorld(true);
 restore.forEach(fn=>fn());assert.equal(matrixCompositions,0);
 const before=world.stats(),originalNear=world.physics.collidersNear;let queries=0;
 world.physics.collidersNear=function(...args){queries++;return originalNear.apply(this,args);};
 for(let frame=0;frame<1000;frame++)world.update(world.spawn.x,world.spawn.z);
 assert.equal(queries,0);world.update(world.spawn.x+.1,world.spawn.z);assert.equal(queries,1);
 world.setQuality('balanced');assert.equal(queries,2);world.physics.collidersNear=originalNear;
 const external=new T.Group();external.traverseVisible=()=>{throw Error('World statistics visited a dynamic actor tree');};world.scene.add(external);assert.doesNotThrow(()=>world.stats());external.removeFromParent();
 assert.equal(before.geometries,world.stats().geometries);assert.equal(before.approximateGpuBytes,world.stats().approximateGpuBytes);
 world.setQuality('low');world.update(world.spawn.x,world.spawn.z);
});

test('bounded Base64 fallback and streamed gzip JSON preserve payloads including padded chunks',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Uint8Array,'fromBase64');
 try{
  Object.defineProperty(Uint8Array,'fromBase64',{configurable:true,value:undefined});
  for(const size of[1,2,3,65535,65536,65537,200003]){const bytes=Buffer.alloc(size);for(let index=0;index<size;index++)bytes[index]=index%251;assert.deepEqual(Buffer.from(authoredBase64Bytes(bytes.toString('base64'))),bytes);}
 }finally{if(descriptor)Object.defineProperty(Uint8Array,'fromBase64',descriptor);else delete Uint8Array.fromBase64;}
 const{gzipSync}=await import('node:zlib'),data={meshes:[{name:'terrain',positions:[0,0,0],indices:[0]}],structures:[{name:'house'}],atmosphere:{preset:'purple_storm'}},encoded=gzipSync(JSON.stringify(data)).toString('base64');
 assert.deepEqual(await decodeAuthoredMapHtml(`<script>const terrainGzipBase64="${encoded}";</script>`),data);
 await assert.rejects(()=>decodeAuthoredMapHtml('<html></html>'),/地形データ/);
 const bad=gzipSync(JSON.stringify({...data,structures:[]})).toString('base64');await assert.rejects(()=>decodeAuthoredMapHtml(`const terrainGzipBase64="${bad}";`),/読み込めません/);
});
