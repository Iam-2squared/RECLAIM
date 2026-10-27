import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { collectBossAssets, validateBossGlb, BOSS_CLIPS } from '../scripts/boss-asset-package.mjs';
import { BossActors, parseEmbeddedBossAssets } from '../src/mission/boss-actors.ts';

const publicDirectory = new URL('../public/', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('published bosses exactly match both authored animated exports and carry all six clips', async t => {
  const { payload, records } = await collectBossAssets(fileURLToPath(publicDirectory));
  for (const [id, name] of [['boar', '錆猪'], ['owl', '哨戒梟']]) {
    const published = Buffer.from(payload[id], 'base64');
    const record=records.find(record=>record.id===id);assert.equal(sha(published),record.sha256);assert.equal(published.length,record.bytes);
    let original;try{original=await readFile(new URL(`../../motion/characters/${name}/${name}_animated.glb`,import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;t.diagnostic('Authoring original is outside this repository checkout; packaged hash verified for '+id);}
    if(original){assert.equal(sha(published),sha(original));assert.equal(record.bytes,original.length);}
    const gltf = validateBossGlb(published, id);
    assert(gltf.skins.length > 0);
    assert(BOSS_CLIPS.every(name => gltf.animations.some(clip => clip.name === name && clip.channels.length > 0)));
    assert.throws(() => validateBossGlb(published.subarray(0, -4), id), /Invalid boss GLB/);
  }
  assert.throws(() => parseEmbeddedBossAssets('{"boar":"../../unsafe.glb"}'), /encoding/);
  assert.throws(() => parseEmbeddedBossAssets('[]'), /assets/);
});

test('actual compressed boss rigs load offline, animate independently, cull at distance and dispose', async () => {
  const { payload } = await collectBossAssets(fileURLToPath(publicDirectory));
  const previous = { document: globalThis.document, self: globalThis.self, bitmap: globalThis.createImageBitmap, fetch: globalThis.fetch };
  globalThis.ProgressEvent ??= class ProgressEvent extends Event { constructor(type, values = {}) { super(type); Object.assign(this, values); } };
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
  globalThis.document = { getElementById: id => id === 'reclaim-boss-assets' ? { textContent: JSON.stringify(payload) } : null };
  const requests = [];
  globalThis.fetch = (input, ...args) => { requests.push(typeof input === 'string' ? input : input.url); return previous.fetch(input, ...args); };
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(); camera.position.set(0, 2, 15);
  const errors = [], actors = new BossActors(scene, camera, { onError: error => errors.push(error) });
  try {
    actors.setBoss('boss-boar', 'boar', { x: -4, y: 0, z: 0 }, 0, 'Idle', 0);
    actors.setBoss('boss-owl', 'owl', { x: 4, y: 0, z: 0 }, 0, 'Idle', 0);
    const firstLoad = actors.load(); assert.equal(actors.load(), firstLoad); await firstLoad;
    let state = actors.snapshot();
    assert.equal(state.status, 'ready'); assert.equal(state.embedded, true); assert.deepEqual(errors, []); assert.deepEqual(state.errors, []);
    assert.equal(state.bosses.length, 2); assert(state.bosses.every(boss => boss.loaded && boss.visible && boss.clip === 'Idle'));
    const boar = state.bosses.find(boss => boss.kind === 'boar'), owl = state.bosses.find(boss => boss.kind === 'owl');
    assert(Math.abs(boar.dimensions.height - 2.30039) < .01); assert(Math.abs(owl.dimensions.height - 3.92535) < .01);
    const getBonePose = kind => { const pose = []; scene.getObjectByName(`Mission boss ${kind}`).traverse(object => { if (object.isBone) pose.push(...object.position.toArray(), ...object.quaternion.toArray()); }); return pose; };
    const before = getBonePose('boar');
    for (let frame = 0; frame < 8; frame++) actors.setBoss('boss-boar', 'boar', { x: -4, y: 0, z: 0 }, 0, 'Walk', .1);
    assert.notDeepEqual(getBonePose('boar'), before, 'authored skeleton did not animate');
    state = actors.snapshot(); assert.equal(state.bosses.find(boss => boss.kind === 'boar').clip, 'Walk'); assert.equal(state.bosses.find(boss => boss.kind === 'owl').clip, 'Idle');
    for (let frame = 0; frame < 25; frame++) actors.setBoss('boss-owl', 'owl', { x: 4, y: 0, z: 0 }, 0, 'Death', .1);
    const deathTime = actors.snapshot().bosses.find(boss => boss.kind === 'owl').time;
    assert(Math.abs(deathTime - (2 + 1 / 24)) < .01, 'death clip should stop at its authored final frame');
    actors.setBoss('boss-owl', 'owl', { x: 4, y: 0, z: 0 }, 0, 'Death', .1);
    assert.equal(actors.snapshot().bosses.find(boss => boss.kind === 'owl').time, deathTime);
    camera.position.z = 500; actors.setBoss('boss-boar', 'boar', { x: -4, y: 0, z: 0 }, 0, 'Idle', .1);
    assert.equal(actors.snapshot().bosses.find(boss => boss.kind === 'boar').visible, false);
    actors.reset(); assert.equal(actors.snapshot().bosses.length, 0);
    assert(requests.length >= 2 && requests.every(url => url.startsWith('data:') || url.startsWith('blob:')), 'offline boss loading requested a remote resource');
  } finally {
    actors.dispose(); assert.equal(scene.children.length, 0); assert.equal(actors.snapshot().status, 'disposed');
    globalThis.document = previous.document; globalThis.self = previous.self; globalThis.createImageBitmap = previous.bitmap; globalThis.fetch = previous.fetch;
  }
});
