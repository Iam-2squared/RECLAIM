import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { MissionActors, MotionPlayback } from '../src/mission/actors.ts';
import { BossActors } from '../src/mission/boss-actors.ts';

// GLTFLoader streams even data URLs through the same progress path as a browser.
globalThis.ProgressEvent ??= class ProgressEvent extends Event {
  constructor(type, values = {}) { super(type); Object.assign(this, values); }
};

function fixtureUrl(animatedBoss = false) {
  const coordinates = new Float32Array([-.2,0,-.2, .2,0,-.2, 0,1,.2, 0,0,.2]);
  const indices = new Uint16Array([0,1,2,0,2,3,1,3,2,0,3,1]);
  const times=new Float32Array([0,1]),translation=new Float32Array([0,0,0,0,.05,0]);
  const data = Buffer.concat([Buffer.from(coordinates.buffer), Buffer.from(indices.buffer),Buffer.from(times.buffer),Buffer.from(translation.buffer)]);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'fixture', mesh: 0, children: [1,2] }, { name: 'Grip_R' }, { name: 'Tip_Visual', translation: [.6,.15,0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-.2,0,-.2], max: [.2,1,.2] },
      { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: coordinates.byteLength }, { buffer: 0, byteOffset: coordinates.byteLength, byteLength: indices.byteLength }],
    buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }],
  };
  if(animatedBoss){
    const start=coordinates.byteLength+indices.byteLength;
    gltf.bufferViews.push({buffer:0,byteOffset:start,byteLength:times.byteLength},{buffer:0,byteOffset:start+times.byteLength,byteLength:translation.byteLength});
    gltf.accessors.push({bufferView:2,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:3,componentType:5126,count:2,type:'VEC3'});
    gltf.animations=['Idle','Walk','Chase','Attack','Hit','Death'].map(name=>({name,samplers:[{input:2,output:3}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}));
  }
  return `data:application/json;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`;
}
const urls = url => ({ modelUrls: { jonesy: url, ramirez: url, 'drone-lv1': url, 'humanoid-lv1': url, 'drone-lv5': url, 'humanoid-lv5': url },
  weaponUrls: { assault: url, sniper: url, knife: url } });

test('locomotion loops, one-shot death clamps and motion changes fade out previous movement', () => {
  const root = new T.Group();
  const idle = new T.AnimationClip('Idle', 1, [new T.NumberKeyframeTrack('.position[x]', [0,1], [0,0])]);
  const walk = new T.AnimationClip('Walk', 1, [new T.NumberKeyframeTrack('.position[x]', [0,.5,1], [0,.2,0])]);
  const death = new T.AnimationClip('Death', .5, [new T.NumberKeyframeTrack('.position[x]', [0,.5], [0,1])]);
  const playback = new MotionPlayback(root, [idle, walk, death]);
  playback.play('Walk');
  for (let i=0;i<25;i++) playback.step(.05);
  assert.equal(playback.snapshot().clip, 'Walk');
  assert(root.position.x > .05 && root.position.x < .2);
  playback.play('Death');
  for (let i=0;i<30;i++) playback.step(.05);
  assert.equal(playback.snapshot().clip, 'Death'); assert(Math.abs(root.position.x-1)<1e-6);
  playback.play('Idle');
  for (let i=0;i<10;i++) playback.step(.05);
  assert(Math.abs(root.position.x)<1e-6);
  playback.step(NaN); playback.step(-1); assert(Number.isFinite(root.position.x));
  playback.dispose();
});

test('mission actors load real glTF geometry, swap weapons and expose the transformed muzzle hook', async () => {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(); scene.add(camera); camera.position.set(4,2,5);
  const actors = new MissionActors(scene, camera, 'ramirez', urls(fixtureUrl()));
  await actors.load(); assert.equal(actors.snapshot().status, 'ready');
  assert.deepEqual(actors.snapshot().failed, []);
  assert.equal(actors.snapshot().models.length, 3); assert.equal(actors.snapshot().weapons.length, 3);
  actors.setPlayer({x:4,y:0,z:5}, 0, 'Aim', 1/60, false);
  actors.setWeapon('assault', {aim:1,thirdPerson:false});
  const muzzle = actors.muzzleWorld();
  assert(muzzle && Math.abs(muzzle.x-camera.position.x)<.4 && muzzle.z<camera.position.z-.65,
    'the real muzzle remains in front of the eye, allowing a comfortable off-centre viewmodel');
  actors.setWeapon('sniper',{aim:1,thirdPerson:false});
  assert.equal(actors.snapshot().viewmodelVisible,false,'scope aiming must leave the target visible');
  actors.setWeapon('sniper',{aim:0,thirdPerson:false});
  assert.equal(actors.snapshot().viewmodelVisible,true,'releasing scope returns the held model');
  actors.setWeapon('knife', {swing:.5}); assert.equal(actors.muzzleWorld(), null);
  actors.setEnemy('drone', {x:0,y:2,z:-4}, 0, 'Hover', 1/60, 5);
  // Optional Lv.5 model is lazy, leaving the base tier available during decoding.
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(actors.snapshot().models.includes('drone-lv5'));
  actors.dispose(); assert.equal(actors.snapshot().status, 'disposed');
  assert.equal(actors.muzzleWorld(), null); assert.equal(camera.children.length, 0);
  assert.equal(scene.children.length, 1, 'only the host camera remains');
});

test('a missing model becomes an explicit degraded state and disposal during loading leaves no orphan actors', async () => {
  const scene = new T.Scene(), camera = new T.Camera(), errors=[];
  const options=urls(fixtureUrl()); options.modelUrls.jonesy='data:application/json;base64,eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIn19fQ==';
  const actors = new MissionActors(scene, camera, 'jonesy', {...options,onError:message=>errors.push(message)});
  await actors.load(); assert.equal(actors.snapshot().status, 'degraded');
  assert.deepEqual(actors.snapshot().failed, ['jonesy']); assert.equal(errors.length, 1);
  actors.dispose();
  const pending = new MissionActors(scene,camera,'jonesy',urls(fixtureUrl()));
  const loading = pending.load(); pending.dispose(); await loading;
  assert.equal(scene.children.length, 0); assert.equal(camera.children.length, 0);
  assert.deepEqual(pending.snapshot().models, []);
});


const until=async predicate=>{for(let attempt=0;attempt<100;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert(predicate(),'asynchronous asset should finish');};

test('mobile loads only the equipped gun, deferring hidden player, unused equipment and far enemy skins',async()=>{
  const scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);
  const actors=new MissionActors(scene,camera,'ramirez',{...urls(fixtureUrl()),mobile:true,initialWeapon:'sniper',enemyViewDistance:80});
  await actors.load();
  assert.deepEqual(actors.snapshot().weapons,['sniper']);assert.deepEqual(actors.snapshot().models,[]);
  actors.setPlayer({x:0,y:0,z:0},0,'Walk',1/60,false);
  actors.setEnemyUnit('far','humanoid',{x:300,y:0,z:0},0,'Walk',1/60);
  assert.equal(actors.snapshot().enemyUnitCount,0);assert.equal(actors.snapshot().deferredEnemyUnitCount,1);
  assert.deepEqual(actors.snapshot().models,[],'far enemies cannot decode or allocate a skeleton');
  actors.setEnemyUnit('far','humanoid',{x:4,y:0,z:0},0,'Walk',1/60);
  await until(()=>actors.snapshot().models.includes('humanoid-lv1'));
  assert.equal(actors.snapshot().deferredEnemyUnitCount,0);assert.equal(actors.snapshot().enemyUnitCount,1);
  assert.equal(actors.snapshot().enemyUnits[0].fallback,false);
  actors.setPlayer({x:0,y:0,z:0},0,'Walk',1/60,true);
  await until(()=>actors.snapshot().models.includes('ramirez'));
  actors.setWeapon('knife');await until(()=>actors.snapshot().weapons.includes('knife'));
  assert.deepEqual(actors.snapshot().weapons.sort(),['knife','sniper'],'unused assault must remain undecoded');
  actors.setEnemyUnit('unseen','drone',{x:300,y:0,z:0},0,'Hover',1/60);actors.removeEnemyUnit('unseen');
  assert.equal(actors.snapshot().deferredEnemyUnitCount,0);
  actors.dispose();assert.equal(scene.children.length,1);assert.equal(camera.children.length,0);
});

test('mobile animation samples one second in twenty evaluations without slowing its authored motion',()=>{
  const clip=new T.AnimationClip('Walk',2,[new T.NumberKeyframeTrack('.position[x]',[0,2],[0,1])]);
  const root=new T.Group(),playback=new MotionPlayback(root,[clip]);playback.play('Walk');
  const original=playback.mixer.update.bind(playback.mixer);let evaluations=0;
  playback.mixer.update=seconds=>{evaluations++;return original(seconds);};
  for(let frame=0;frame<60;frame++)playback.step(1/60,true,.05);
  assert.equal(evaluations,20);assert(Math.abs(root.position.x-.5)<1e-6);assert(Math.abs(playback.snapshot().time-1)<1e-6);
  playback.dispose();
});

test('mobile boss visuals stay undecoded at the cabin and load the real animated model on approach',async()=>{
  const scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);
  const source=fixtureUrl(true),bosses=new BossActors(scene,camera,{mobile:true,viewDistance:80,modelUrls:{boar:source,owl:source}});
  await bosses.load();assert.equal(bosses.snapshot().decodedModels,0);
  bosses.setBoss('boar','boar',{x:350,y:0,z:0},0,'Idle',1/60);
  bosses.setBoss('owl','owl',{x:360,y:0,z:0},0,'Idle',1/60);
  assert.equal(bosses.snapshot().decodedModels,0);assert(bosses.snapshot().bosses.every(boss=>!boss.loaded));
  bosses.setBoss('boar','boar',{x:20,y:0,z:0},0,'Walk',1/60);
  await until(()=>bosses.snapshot().decodedModels===1);
  const near=bosses.snapshot().bosses.find(boss=>boss.kind==='boar');assert(near.loaded&&near.visible);assert.equal(near.clip,'Walk');
  assert.equal(bosses.snapshot().bosses.find(boss=>boss.kind==='owl').loaded,false);
  bosses.reset();assert.equal(bosses.snapshot().bosses.length,0);bosses.dispose();assert.equal(scene.children.length,1);
});
