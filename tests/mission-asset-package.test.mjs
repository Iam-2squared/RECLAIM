import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { collectMissionAssets, validateEmbeddedGlb, MISSION_MODEL_IDS, MISSION_WEAPON_IDS } from '../scripts/mission-asset-package.mjs';
import { MissionActors, parseEmbeddedMissionAssets } from '../src/mission/actors.ts';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const allClips = ['Idle','Walk','Run','Jump','Aim','Shoot','Reload','Hit','Death','Melee','Attack','Hover','Patrol','Chase','Ram'];
function mockModelGlb({ external = false, clips = allClips } = {}) {
  const coordinates = new Float32Array([-.2,0,-.2, .2,0,-.2, 0,1,.2, 0,0,.2]);
  const indices = new Uint16Array([0,1,2,0,2,3,1,3,2,0,3,1]);
  const binary = Buffer.concat([Buffer.from(coordinates.buffer),Buffer.from(indices.buffer)]);
  const model = {
    asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Fixture',mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
    accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-.2,0,-.2],max:[.2,1,.2]}, {bufferView:1,componentType:5123,count:12,type:'SCALAR'}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:coordinates.byteLength},{buffer:0,byteOffset:coordinates.byteLength,byteLength:indices.byteLength}],
    buffers:[{byteLength:binary.length,...(external?{uri:'missing.bin'}:{})}],
    animations:clips.map(name=>({name,samplers:[],channels:[]})),
  };
  const json = Buffer.from(JSON.stringify(model));
  const paddedJson = Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
  const paddedBinary = Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+paddedJson.length+paddedBinary.length,8);
  header.writeUInt32LE(paddedJson.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(paddedBinary.length);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,paddedJson,binHeader,paddedBinary]);
}

test('standalone GLB validation accepts the three actual self-contained weapons and rejects sidecars or corrupt headers', async () => {
  for(const id of MISSION_WEAPON_IDS) {
    const bytes=await readFile(new URL(`../public/mission-weapons/${id}.glb`,import.meta.url));
    const gltf=validateEmbeddedGlb(bytes,id);
    const triangles=gltf.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),0);
    assert(triangles>5000,`${id} must contain the authored weapon geometry`);
    assert(gltf.images.length>=2 && gltf.images.every(image=>Number.isInteger(image.bufferView)));
  }
  assert.throws(()=>validateEmbeddedGlb(mockModelGlb({external:true})) ,/external asset/);
  const truncated=mockModelGlb().subarray(0,-4);
  assert.throws(()=>validateEmbeddedGlb(truncated),/header/);
});

test('standalone collection requires all six animated models and verifies every recorded hash', async () => {
  const fixture=await mkdtemp(resolve(tmpdir(),'reclaim-mission-assets-'));
  try {
    await mkdir(resolve(fixture,'mission-models')); await mkdir(resolve(fixture,'mission-weapons'));
    const bytes=mockModelGlb(),models=[];
    for(const id of MISSION_MODEL_IDS) {
      await writeFile(resolve(fixture,'mission-models',`${id}.glb`),bytes);
      models.push({id,file:`${id}.glb`,bytes:bytes.length,sha256:sha(bytes),clips:allClips});
    }
    await writeFile(resolve(fixture,'mission-models/manifest.json'),JSON.stringify({models}));
    const weaponManifest=await readFile(new URL('../public/mission-weapons/manifest.json',import.meta.url));
    await writeFile(resolve(fixture,'mission-weapons/manifest.json'),weaponManifest);
    for(const id of MISSION_WEAPON_IDS) await copyFile(new URL(`../public/mission-weapons/${id}.glb`,import.meta.url),resolve(fixture,'mission-weapons',`${id}.glb`));
    const result=await collectMissionAssets(fixture);
    assert.deepEqual(Object.keys(result.payload.models),MISSION_MODEL_IDS);
    assert.deepEqual(Object.keys(result.payload.weapons),MISSION_WEAPON_IDS);
    assert.equal(result.records.models.length,6); assert.equal(result.records.weapons.length,3);
    assert.equal(sha(Buffer.from(result.payload.weapons.assault,'base64')),result.records.weapons[0].sha256);
    models[0].sha256='0'.repeat(64);
    await writeFile(resolve(fixture,'mission-models/manifest.json'),JSON.stringify({models}));
    await assert.rejects(()=>collectMissionAssets(fixture),/hash differs/);
    models[0].sha256=sha(bytes); models[0].clips=['Idle'];
    await writeFile(resolve(fixture,'mission-models/manifest.json'),JSON.stringify({models}));
    await assert.rejects(()=>collectMissionAssets(fixture),/clips are incomplete/);
    models.pop();
    await writeFile(resolve(fixture,'mission-models/manifest.json'),JSON.stringify({models}));
    await assert.rejects(()=>collectMissionAssets(fixture),/Incomplete mission asset manifest/);
  } finally {
    // Only remove the unique test directory created above, under the OS temp root.
    assert.equal(dirname(fixture),resolve(tmpdir()));assert(basename(fixture).startsWith('reclaim-mission-assets-'));
    await rm(fixture,{recursive:true,force:true});
  }
});

test('mission reads the offline JSON payload and decodes actual weapon geometry without HTTP or side files', async () => {
  const model=mockModelGlb().toString('base64');
  const payload={models:Object.fromEntries(MISSION_MODEL_IDS.map(id=>[id,model])),weapons:{}};
  for(const id of MISSION_WEAPON_IDS) payload.weapons[id]=(await readFile(new URL(`../public/mission-weapons/${id}.glb`,import.meta.url))).toString('base64');
  // An explicit URL override below must win even over a malformed matching GLB.
  payload.models.jonesy=Buffer.from('invalid glTF').toString('base64');
  const text=JSON.stringify(payload),parsed=parseEmbeddedMissionAssets(text);
  assert.equal(parsed.weapons.assault,payload.weapons.assault);
  assert.throws(()=>parseEmbeddedMissionAssets('{'),SyntaxError);
  assert.throws(()=>parseEmbeddedMissionAssets('{"models":{"jonesy":"../../model.glb"}}'),/encoding/);
  const previous={document:globalThis.document,self:globalThis.self,bitmap:globalThis.createImageBitmap,fetch:globalThis.fetch};
  const requests=[];
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {constructor(type,values={}){super(type);Object.assign(this,values);}};
  // Image decoding is a browser responsibility. This CPU test exercises the
  // actual GLB mesh parser and texture byte fetches without creating a renderer.
  globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
  globalThis.self=globalThis;
  globalThis.document={getElementById:id=>id==='reclaim-mission-assets'?{textContent:text}:null};
  globalThis.fetch=(input,...args)=>{requests.push(typeof input==='string'?input:input.url);return previous.fetch(input,...args);};
  const scene=new T.Scene(),camera=new T.PerspectiveCamera();
  // An explicit asset override must win over the matching embedded model.
  const actors=new MissionActors(scene,camera,'jonesy',{modelUrls:{jonesy:`data:model/gltf-binary;base64,${model}`}});
  try {
    await actors.load();const state=actors.snapshot();
    assert.equal(state.status,'ready');assert.equal(state.embedded,true);assert.deepEqual(state.failed,[]);
    for(const id of MISSION_WEAPON_IDS)assert(state.weaponGeometry[id]>5000,id);
    actors.setPlayer({x:0,y:0,z:0},0,'Aim',1/60,true);actors.setWeapon('sniper',{aim:1,thirdPerson:true});
    const muzzle=actors.muzzleWorld();assert(muzzle&&Number.isFinite(muzzle.y)&&muzzle.z<-.5);
    assert(requests.length>=6 && requests.every(url=>url.startsWith('data:')||url.startsWith('blob:')));
  } finally {
    actors.dispose();
    globalThis.document=previous.document;globalThis.self=previous.self;globalThis.createImageBitmap=previous.bitmap;globalThis.fetch=previous.fetch;
  }
});
