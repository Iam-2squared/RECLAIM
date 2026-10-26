import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { MissionActors, MotionPlayback } from '../src/mission/actors.ts';

// GLTFLoader streams even data URLs through the same progress path as a browser.
globalThis.ProgressEvent ??= class ProgressEvent extends Event {
  constructor(type, values = {}) { super(type); Object.assign(this, values); }
};

function fixtureUrl() {
  const coordinates = new Float32Array([-.2,0,-.2, .2,0,-.2, 0,1,.2, 0,0,.2]);
  const indices = new Uint16Array([0,1,2,0,2,3,1,3,2,0,3,1]);
  const data = Buffer.concat([Buffer.from(coordinates.buffer), Buffer.from(indices.buffer)]);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'fixture', mesh: 0, children: [1,2] }, { name: 'Grip_R' }, { name: 'Tip_Visual', translation: [.6,.15,0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-.2,0,-.2], max: [.2,1,.2] },
      { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: coordinates.byteLength }, { buffer: 0, byteOffset: coordinates.byteLength, byteLength: indices.byteLength }],
    buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }],
  };
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
