import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { AREA_IDS, AREA_DEFINITIONS, getAreaDefinition, validateAreaDefinition, TerrainSystem, AreaLoader } from '../src/world/index.ts';
import { seededRandom, coordinateSeed } from '../src/world/random.ts';

test('four distinct versioned area definitions use unique IDs, seeds, biome and passage data', () => {
  assert.equal(AREA_IDS.length, 4);
  assert.equal(new Set(AREA_IDS).size, 4);
  assert.equal(new Set(AREA_IDS.map(id => AREA_DEFINITIONS[id].seed)).size, 4);
  assert.equal(new Set(AREA_IDS.map(id => AREA_DEFINITIONS[id].terrainProfile.amplitude)).size, 4);
  for (const id of AREA_IDS) { const area = getAreaDefinition(id); assert.equal(area.id, id); assert.deepEqual(validateAreaDefinition(area), []); assert.equal(area.version, 1); }
});
test('area validation rejects malformed bounds, duplicate POI, unsafe spawn and unaligned LOD', () => {
  const area = structuredClone(AREA_DEFINITIONS.shiretoko);
  area.bounds.maxX = area.bounds.minX; assert.ok(validateAreaDefinition(area).length > 0);
  const duplicate = structuredClone(AREA_DEFINITIONS.shiretoko); duplicate.landmarks.push(duplicate.landmarks[0]); assert.ok(validateAreaDefinition(duplicate).includes('Duplicate landmark ID'));
  const spawn = structuredClone(AREA_DEFINITIONS.shiretoko); spawn.spawn.x = 240; assert.ok(validateAreaDefinition(spawn).includes('Unsafe spawn bounds'));
  const grid = structuredClone(AREA_DEFINITIONS.shiretoko); grid.lodSettings.farCellSize = 7; assert.ok(validateAreaDefinition(grid).includes('Invalid terrain / LOD grid'));
  const detour = structuredClone(AREA_DEFINITIONS.shiretoko); detour.explorationRoutes[0].width = 0; assert.ok(validateAreaDefinition(detour).includes('Invalid exploration route lakebank-spur'));
});
test('progressive exits are ordered, provisional, and Sapporo grants no fabricated next clear', () => {
  assert.deepEqual(AREA_IDS.map(id => AREA_DEFINITIONS[id].exitTriggers[0].targetAreaId), ['ishikari-mountains', 'hidaka-mountains', 'sapporo', null]);
  for (const id of AREA_IDS) { const area = AREA_DEFINITIONS[id]; assert.equal(area.exitTriggers[0].provisional, true); assert.ok(area.landmarks.every(p => p.provisional)); }
  assert.equal(AREA_DEFINITIONS.sapporo.status, 'environment-prototype');
  assert.equal(AREA_DEFINITIONS.sapporo.landmarks.find(p => p.id === 'sapporo-prototype-end').type, 'prototype-end');
});
test('only Shiretoko requests a scout drone; other prototypes contain no fabricated enemies', () => {
  assert.deepEqual(AREA_DEFINITIONS.shiretoko.allowedEnemyTypes, ['scout-drone']);
  for (const id of AREA_IDS.slice(1)) assert.deepEqual(AREA_DEFINITIONS[id].allowedEnemyTypes, []);
});
test('seeded PRNG and coordinates reproduce across reloads and distinguish negative chunks', () => {
  const a = seededRandom(431071), b = seededRandom(431071);
  assert.deepEqual(Array.from({ length: 40 }, a), Array.from({ length: 40 }, b));
  assert.notEqual(coordinateSeed(431071, -1, 0), coordinateSeed(431071, 1, 0));
  assert.notEqual(coordinateSeed(431071, 0, -1), coordinateSeed(431071, 0, 1));
});
test('terrain uses the same sampled triangular surface as render mesh, including off-grid negative points', () => {
  const terrain = new TerrainSystem(AREA_DEFINITIONS.shiretoko), data = terrain.buildChunkData(-1, 1), segments = data.segments;
  for (const [x, z] of [[-30.7, 53.8], [-.4, 73.7], [-47.1, 61.7], [-21.8, 95.1], [-12.3, 63.9]]) {
    const gx = (x + 48) / 2, gz = (z - 48) / 2, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz, h = (px, pz) => data.positions[(pz * (segments + 1) + px) * 3 + 1];
    const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
    const triangleHeight = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    assert.ok(Math.abs(terrain.heightAt(x, z) - triangleHeight) < 2e-5);
  }
});
test('adjacent terrain chunks share identical boundary vertices and deterministic normals topology', () => {
  const terrain = new TerrainSystem(AREA_DEFINITIONS['hidaka-mountains']), left = terrain.buildChunkData(0, 0), right = terrain.buildChunkData(1, 0), stride = left.segments + 1;
  for (let z = 0; z <= left.segments; z++) {
    const l = (z * stride + left.segments) * 3, r = z * stride * 3;
    assert.deepEqual([...left.positions.slice(l, l + 3)], [...right.positions.slice(r, r + 3)]);
  }
  assert.deepEqual([...left.indices.slice(0, 6)], [0, stride, 1, 1, stride, stride + 1]);
});
test('same area and coordinates produce identical geometry; area seeds produce different terrain', () => {
  const a = new TerrainSystem(AREA_DEFINITIONS.shiretoko), b = new TerrainSystem(AREA_DEFINITIONS.shiretoko);
  assert.deepEqual(a.buildChunkData(2, -2), b.buildChunkData(2, -2));
  const changed = structuredClone(AREA_DEFINITIONS.shiretoko); changed.seed++;
  assert.notEqual(a.heightAt(97, -63), new TerrainSystem(changed).heightAt(97, -63));
});
test('optional scenery spur preserves canonical route heights and conveys no progression objective or exit', () => {
  const area = AREA_DEFINITIONS.shiretoko, original = structuredClone(area); delete original.explorationRoutes;
  const expanded = new TerrainSystem(area), canonical = new TerrainSystem(original);
  for (let i = 0; i < area.route.length - 1; i++) for (let j = 0; j <= 20; j++) {
    const a = area.route[i], b = area.route[i + 1], x = a.x + (b.x - a.x) * j / 20, z = a.z + (b.z - a.z) * j / 20;
    assert.equal(expanded.heightAt(x, z), canonical.heightAt(x, z));
  }
  const id = area.explorationRoutes[0].id;
  assert.equal(area.objectiveIds.includes(id), false); assert.equal(area.exitTriggers.some(exit => exit.id === id), false);
});
test('authored routes remain finite, walkable, above water and below the prototype slope limit', () => {
  for (const id of AREA_IDS) {
    const area = AREA_DEFINITIONS[id], terrain = new TerrainSystem(area);
    for (let i = 0; i < area.route.length - 1; i++) for (let j = 0; j <= 30; j++) {
      const a = area.route[i], b = area.route[i + 1], x = a.x + (b.x - a.x) * j / 30, z = a.z + (b.z - a.z) * j / 30;
      assert.ok(Number.isFinite(terrain.heightAt(x, z)), `${id} finite height`);
      assert.ok(terrain.isWalkable(x, z), `${id} safe route ${x}, ${z}`);
      assert.ok(terrain.slopeAt(x, z) < .7, `${id} manageable route grade`);
    }
  }
});
test('safe cabin spawn, actual lake basin and out-of-bounds terrain classification are explicit', () => {
  const area = AREA_DEFINITIONS.shiretoko, terrain = new TerrainSystem(area);
  assert.equal(terrain.heightAt(area.spawn.x, area.spawn.z), 0);
  assert.equal(terrain.slopeAt(area.spawn.x, area.spawn.z), 0);
  assert.equal(terrain.inWater(-46, 62), true);
  assert.equal(terrain.isWalkable(-46, 62), false);
  assert.equal(terrain.isWalkable(300, 0), false);
});
test('unaligned/coarser-than-allowed terrain requests throw rather than silently changing collision', () => {
  const terrain = new TerrainSystem(AREA_DEFINITIONS.shiretoko);
  assert.throws(() => terrain.buildChunkData(0, 0, 7));
  assert.throws(() => terrain.buildChunkData(0, 0, 1));
  assert.equal(terrain.buildChunkData(0, 0, 8).cellSize, 8);
});
test('chunk interest follows the player, upgrades walked terrain to exact grid and unloads old geometry', () => {
  const loader = new AreaLoader(AREA_DEFINITIONS.shiretoko, 'balanced');
  try {
    assert.equal(loader.stats().activeChunks, 25); assert.equal(loader.stats().nearChunks, 9); assert.equal(loader.stats().farChunks, 16);
    const oldest = loader.scene.getObjectByName('terrain:-2:-3'); assert.ok(oldest); let disposed = 0; oldest.geometry.addEventListener('dispose', () => disposed++);
    loader.update(100, 96);
    assert.ok(loader.stats().unloadedChunks > 0); assert.equal(disposed, 1);
    const current = loader.scene.getObjectByName('chunk:2:2:lod-2'); assert.ok(current);
    assert.ok(loader.stats().activeChunks <= 25);
    const before = loader.stats().loadedChunks; loader.update(103, 99); assert.equal(loader.stats().loadedChunks, before);
  } finally { loader.dispose(); }
});
test('quality switches reduce chunks/vegetation and preserve exact near terrain and safe cabin opening', () => {
  const loader = new AreaLoader(AREA_DEFINITIONS.shiretoko, 'balanced');
  try {
    const balanced = loader.stats(), balancedCylinders = loader.colliders.filter(c => c.type === 'cylinder'), height = loader.terrain.heightAt(7.37, 32.41); loader.setQuality('low'); const low = loader.stats();
    assert.equal(low.activeChunks, 9); assert.equal(low.nearChunks, 9); assert.equal(low.farChunks, 0); assert.ok(low.trees < balanced.trees); assert.ok(low.grass < balanced.grass); assert.ok(low.triangles < balanced.triangles);
    assert.equal(loader.terrain.heightAt(7.37, 32.41), height);
    for (const lowCollider of loader.colliders.filter(c => c.type === 'cylinder')) assert.ok(balancedCylinders.some(c => c.x === lowCollider.x && c.z === lowCollider.z && c.radius === lowCollider.radius && c.tag === lowCollider.tag), 'quality removes a stable prefix; it does not re-roll tree or rock positions');
    assert.ok(loader.colliders.some(c => c.tag === 'cabin-back'));
    assert.equal(loader.colliders.some(c => c.type === 'aabb' && c.minX <= 0 && c.maxX >= 0 && c.minZ < 5 && c.maxZ > 5), false, 'door centre is physically open');
    loader.setQuality('balanced'); assert.equal(loader.stats().trees, balanced.trees); assert.equal(loader.stats().geometries, balanced.geometries);
  } finally { loader.dispose(); }
});
test('authored route and spawn are protected from tree/rock placement in every area', () => {
  for (const id of AREA_IDS) {
    const area = AREA_DEFINITIONS[id], loader = new AreaLoader(area, 'balanced');
    try {
      for (const collider of loader.colliders.filter(c => c.type === 'cylinder')) {
        assert.ok(loader.terrain.routeAt(collider.x, collider.z).distance > area.terrainProfile.pathWidth);
        if (id === 'shiretoko') assert.ok(!(Math.abs(collider.x) < 9 && Math.abs(collider.z) < 10));
      }
    } finally { loader.dispose(); }
  }
});
test('world resources remain bounded across ten area returns and repeated quality/position switches', () => {
  let reference = null;
  for (let i = 0; i < 10; i++) {
    const loader = new AreaLoader(AREA_DEFINITIONS.shiretoko, 'balanced'), initial = loader.stats();
    const stable = [initial.geometries, initial.materials, initial.triangles, initial.instances, initial.colliders];
    if (reference) assert.deepEqual(stable, reference); else reference = stable;
    loader.update(150, 150); loader.setQuality('low'); loader.update(0, -1.5); loader.setQuality('balanced');
    const back = loader.stats(); assert.deepEqual([back.geometries, back.materials, back.triangles, back.instances, back.colliders], reference);
    loader.dispose(); loader.dispose(); loader.update(0, 0); loader.setQuality('low');
    const disposed = loader.stats(); assert.equal(disposed.activeChunks, 0); assert.equal(disposed.geometries, 0); assert.equal(disposed.materials, 0); assert.equal(disposed.colliders, 0); assert.equal(disposed.disposed, true); assert.equal(disposed.terrainCacheEntries, 0);
  }
});
test('every area creates an independently walkable scene without textures or renderer allocation', () => {
  for (const id of AREA_IDS) {
    const area = AREA_DEFINITIONS[id], loader = new AreaLoader(area, 'low');
    try { assert.ok(loader.scene instanceof T.Scene); assert.equal(loader.stats().textures, 0); assert.ok(loader.stats().trees > 0); assert.ok(loader.stats().renderObjects > 10); assert.ok(loader.terrain.isWalkable(area.spawn.x, area.spawn.z)); }
    finally { loader.dispose(); }
  }
});
test('backdrops use rounded ridge grids and muted clustered volumes rather than pyramid peaks or cloud discs', () => {
  for (const id of AREA_IDS) {
    const loader = new AreaLoader(AREA_DEFINITIONS[id], 'low');
    try {
      for (let i = 0; i < 11; i++) { const ridge = loader.scene.getObjectByName(`backdrop-ridge:${i}`); assert.ok(ridge instanceof T.Mesh); assert.equal(ridge.geometry.attributes.position.count, 187); assert.equal(ridge.geometry.index.count / 3, 320); }
      const clouds = loader.scene.getObjectByName('instances:low-cloud'); assert.ok(clouds instanceof T.InstancedMesh); assert.equal(clouds.count, 35); assert.ok(clouds.material instanceof T.MeshBasicMaterial); assert.ok(clouds.material.opacity <= .2);
      const matrix = new T.Matrix4(), position = new T.Vector3(), quaternion = new T.Quaternion(), scale = new T.Vector3();
      for (let i = 0; i < clouds.count; i++) { clouds.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale); assert.ok(scale.y >= 5); assert.ok(scale.x / scale.y < 3 && scale.z / scale.y < 3); }
    } finally { loader.dispose(); }
  }
});
test('CPU height cache is bounded during exploration and is released on disposal', () => {
  const terrain = new TerrainSystem(AREA_DEFINITIONS.shiretoko);
  for (let i = 0; i < 26000; i++) terrain.gridHeight(i % 200, Math.floor(i / 200));
  assert.equal(terrain.cacheSize(), 24000); terrain.dispose(); assert.equal(terrain.cacheSize(), 0);
});
