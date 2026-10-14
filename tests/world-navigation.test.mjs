import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { AREA_IDS, AREA_DEFINITIONS, AreaLoader } from '../src/world/index.ts';
import { CharacterController, PLAYER_TUNING } from '../src/mission/controller.ts';

const neutral = { forward: 0, right: 0, sprint: false, jump: false };
function controllerFor(loader) { return new CharacterController(loader.terrain, () => loader.colliders, loader.area.bounds, loader.area.spawn); }
function walkTo(loader, player, target, tolerance = .17) {
  let frames = 0, stationary = 0;
  while (Math.hypot(target.x - player.position.x, target.z - player.position.z) > tolerance) {
    const dx = target.x - player.position.x, dz = target.z - player.position.z, before = { ...player.position };
    player.yaw = Math.atan2(-dx, -dz);
    player.step({ ...neutral, forward: 1 }, 1 / 30);
    loader.update(player.position.x, player.position.z);
    stationary = Math.hypot(player.position.x - before.x, player.position.z - before.z) < 1e-6 ? stationary + 1 : 0;
    assert.ok(stationary < 15, `${loader.area.id} actual movement blocked before ${JSON.stringify(target)} from ${JSON.stringify(player.position)}`);
    assert.ok(++frames < 4500, `${loader.area.id} actual route did not converge`);
    assert.equal(loader.terrain.inWater(player.position.x, player.position.z), false);
    assert.ok(Math.abs(player.position.y - loader.terrain.heightAt(player.position.x, player.position.z)) < 1e-6);
    assert.equal(player.blocked(player.position.x, player.position.z), false);
  }
  return frames;
}

for (const id of AREA_IDS) for (const quality of ['low', 'balanced']) test(`actual ${id} ${quality} controller walks every authored waypoint, checkpoint and passage through streamed colliders`, () => {
  const area = AREA_DEFINITIONS[id], loader = new AreaLoader(area, quality), player = controllerFor(loader), initialChunks = loader.stats().activeChunks;
  try {
    let frames = 0;
    for (const point of area.route) frames += walkTo(loader, player, point);
    assert.ok(frames > 500);
    assert.ok(player.distance > 100, 'real integrated walking distance, not restored/teleported positions');
    assert.equal(player.recoveries, 0);
    assert.ok(loader.stats().loadedChunks > initialChunks, 'new terrain was loaded during the actual walk');
    assert.ok(loader.stats().unloadedChunks > 0);
    assert.ok(loader.stats().activeChunks <= (quality === 'low' ? 9 : 25));
  } finally { loader.dispose(); }
});

test('straight W at the real 60Hz step walks past the reported z26.92 stop to the drone POI in both qualities', () => {
  for (const quality of ['low', 'balanced']) {
    const loader = new AreaLoader(AREA_DEFINITIONS.shiretoko, quality), player = controllerFor(loader);
    try {
      for (let i = 0; i < 620; i++) {
        const before = player.position.z;
        player.step({ ...neutral, forward: 1 }, 1 / 60); loader.update(player.position.x, player.position.z);
        assert.ok(player.position.z > before, `actual ${quality} W movement stopped at z=${before}`);
        assert.equal(player.blocked(player.position.x, player.position.z), false);
      }
      assert.ok(player.position.z > 30); assert.ok(Math.abs(player.position.x) < 1e-10); assert.equal(player.recoveries, 0);
    } finally { loader.dispose(); }
  }
});

for (const quality of ['low', 'balanced']) test(`actual Shiretoko ${quality} optional spur reaches the lakebank and returns, with the lake unobstructed`, () => {
  const area = AREA_DEFINITIONS.shiretoko, loader = new AreaLoader(area, quality), player = controllerFor(loader);
  try {
    const detour = area.explorationRoutes.find(route => route.id === 'lakebank-spur'); assert.ok(detour);
    for (const point of area.route.slice(0, 3)) walkTo(loader, player, point);
    for (const point of detour.waypoints) {
      walkTo(loader, player, point);
      if (point.z === 60) {
        loader.scene.updateMatrixWorld(true);
        const lake = area.terrainProfile.water.find(w => w.id === 'lake'), eye = new T.Vector3(player.position.x, player.position.y + PLAYER_TUNING.eyeHeight, player.position.z), target = new T.Vector3(lake.x, lake.surfaceHeight, lake.z), direction = target.clone().sub(eye).normalize();
        const ray = new T.Raycaster(eye, direction, 0, eye.distanceTo(target) + .2), hits = ray.intersectObjects(loader.scene.children, true);
        assert.ok(hits.length > 0); assert.equal(hits[0].object.material.name, 'water', 'walked lake viewpoint sees water before terrain or vegetation');
        assert.ok(player.position.y > lake.surfaceHeight, 'bank remains above water');
      }
    }
    for (const point of [...detour.waypoints].reverse()) walkTo(loader, player, point);
    assert.ok(player.distance > 115); assert.equal(player.recoveries, 0);
    assert.ok(Math.hypot(player.position.x, player.position.z - 30) < .2);
  } finally { loader.dispose(); }
});

test('actual cabin walk crosses its open doorway; side wall/window/table protect eye and body', () => {
  const loader = new AreaLoader(AREA_DEFINITIONS.shiretoko, 'low'), player = controllerFor(loader);
  try {
    walkTo(loader, player, { x: 0, z: 7 });
    assert.ok(player.position.z > 5.5);
    // Keep the wall approach clear of the genuine bed collider at z=-2.7.
    walkTo(loader, player, { x: 0, z: 0 });
    player.yaw = -Math.PI / 2;
    for (let i = 0; i < 140; i++) player.step({ ...neutral, forward: 1 }, 1 / 30);
    assert.ok(player.position.x < 4.56); assert.ok(player.position.x > 4.3);
    assert.equal(player.blocked(5, -1.5), true, 'window is a physical wall boundary');
    assert.equal(player.blocked(-3, -3), true, 'radio table cannot be walked through');
    assert.equal(player.blocked(3, -2.7), true, 'bed cannot be walked through');
  } finally { loader.dispose(); }
});

test('actual cabin jump remains below rendered roof and resettles without camera clipping', () => {
  const loader = new AreaLoader(AREA_DEFINITIONS.shiretoko, 'low'), player = controllerFor(loader);
  try {
    loader.scene.updateMatrixWorld(true);
    const roofs = []; loader.scene.traverse(o => { if (o instanceof T.Mesh && o.material.name === 'roof') roofs.push(o); });
    assert.ok(roofs.length > 0);
    const gables = loader.scene.getObjectByName('cabin-gables'); assert.ok(gables); assert.equal(gables.material.side, T.DoubleSide);
    const interiorGableRay = new T.Raycaster(new T.Vector3(0, 4.1, 0), new T.Vector3(0, 0, 1));
    assert.ok(interiorGableRay.intersectObject(gables).some(hit => Math.abs(hit.point.z - 5) < 1e-6), 'front gable is opaque from inside the cabin');
    let maximumY = 0;
    for (let i = 0; i < 80; i++) {
      player.step({ ...neutral, jump: i === 0 }, 1 / 60); maximumY = Math.max(maximumY, player.position.y);
      const eye = new T.Vector3(player.position.x, player.position.y + PLAYER_TUNING.eyeHeight, player.position.z), raycaster = new T.Raycaster(eye, new T.Vector3(0, 1, 0));
      assert.ok(raycaster.intersectObjects(roofs).some(hit => hit.distance > .2), 'roof remains above player camera');
    }
    assert.ok(maximumY > .5); assert.ok(player.grounded); assert.equal(player.position.y, 0);
  } finally { loader.dispose(); }
});

test('actual low/balanced switches during walking keep terrain contact; invalid saved coordinates cannot restore', () => {
  const loader = new AreaLoader(AREA_DEFINITIONS['hidaka-mountains'], 'balanced'), player = controllerFor(loader);
  try {
    walkTo(loader, player, loader.area.route[1]); loader.setQuality('low'); walkTo(loader, player, loader.area.route[2]); loader.setQuality('balanced'); walkTo(loader, player, loader.area.route[3]);
    assert.equal(player.recoveries, 0); assert.ok(player.grounded);
    const valid = { ...player.position, yaw: player.yaw, pitch: player.pitch };
    assert.equal(player.restore({ ...valid, x: loader.area.bounds.maxX + 1 }), false);
    assert.equal(player.restore({ ...valid, y: valid.y + 10 }), false);
    assert.equal(player.restore({ ...valid, x: NaN }), false);
    assert.deepEqual(player.position, { x: valid.x, y: valid.y, z: valid.z });
    player.recover(); loader.update(player.position.x, player.position.z);
    assert.deepEqual(player.position, { x: loader.area.spawn.x, y: loader.terrain.heightAt(loader.area.spawn.x, loader.area.spawn.z), z: loader.area.spawn.z });
  } finally { loader.dispose(); }
});

test('saved lake basin or steep mountainside cannot restore a player to unsafe ground', () => {
  const lake = new AreaLoader(AREA_DEFINITIONS.shiretoko, 'low'), lakePlayer = controllerFor(lake);
  try {
    assert.equal(lakePlayer.restore({ x: -46, z: 62, y: lake.terrain.heightAt(-46, 62), yaw: 0, pitch: 0 }), false);
    assert.deepEqual(lakePlayer.position, { x: lake.area.spawn.x, y: 0, z: lake.area.spawn.z });
  } finally { lake.dispose(); }
  const mountain = new AreaLoader(AREA_DEFINITIONS['hidaka-mountains'], 'low'), mountainPlayer = controllerFor(mountain);
  try {
    let steep = null;
    for (let z = -150; z <= 220 && !steep; z += 8) for (let x = -210; x <= 210; x += 8) if (mountain.terrain.slopeAt(x, z) > PLAYER_TUNING.maximumSlope + .2) { steep = { x, z }; break; }
    assert.ok(steep, 'mountain includes genuinely inaccessible steep terrain');
    assert.equal(mountainPlayer.restore({ ...steep, y: mountain.terrain.heightAt(steep.x, steep.z), yaw: 0, pitch: 0 }), false);
    assert.deepEqual(mountainPlayer.position, { x: mountain.area.spawn.x, y: mountain.terrain.heightAt(mountain.area.spawn.x, mountain.area.spawn.z), z: mountain.area.spawn.z });
  } finally { mountain.dispose(); }
});
