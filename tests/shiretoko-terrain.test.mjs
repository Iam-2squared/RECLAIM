import test from 'node:test';
import assert from 'node:assert/strict';
import { ShiretokoTerrain, TERRAIN, ROUTE, LOCATIONS, BASINS, coastDistance, rawHeight } from '../src/shiretoko-phase1/terrain.ts';
import { TerrainWalker } from '../src/shiretoko-phase1/walker.ts';
const terrain = new ShiretokoTerrain();

test('Phase 1 has a reproducible 2400m surface with 5m samples and four distinct zones', () => {
  const other = new ShiretokoTerrain();
  assert.equal(terrain.count, 481); assert.deepEqual(terrain.heights, other.heights);
  assert.equal(terrain.heightAt(-170, 850), 108);
  assert.equal(terrain.slopeAt(-170, 850), 0);
  for (const p of LOCATIONS) { assert.ok(!terrain.inWater(p.x, p.z)); assert.ok(terrain.slopeAt(p.x, p.z) < .8); }
  assert.ok(terrain.heightAt(170, -850) > 300);
  let maximum = 0; for (const y of terrain.heights) maximum = Math.max(maximum, y);
  assert.ok(maximum > 650 && maximum < 850);
  // The cliff is a real large gradient in the surface, not a painted edge.
  let maxDrop = 0;
  for (let x = -450; x < 150; x += 5) maxDrop = Math.max(maxDrop, Math.abs(terrain.heightAt(x + 10, 850) - terrain.heightAt(x, 850)));
  assert.ok(maxDrop > 45);
  assert.ok(coastDistance(1100, 850) < 0);
});

test('all 64 chunk borders share identical positions AND normals, including the inland join', () => {
  for (let z = -4; z < 4; z++) for (let x = -4; x < 4; x++) {
    const a = terrain.chunk(x, z), side = TERRAIN.chunk / TERRAIN.cell + 1;
    if (x < 3) {
      const b = terrain.chunk(x + 1, z);
      for (let row = 0; row < side; row++) for (let c = 0; c < 3; c++) {
        const ai = (row * side + side - 1) * 3 + c, bi = row * side * 3 + c;
        assert.equal(a.positions[ai], b.positions[bi]); assert.equal(a.normals[ai], b.normals[bi]);
      }
    }
    if (z < 3) {
      const b = terrain.chunk(x, z + 1);
      for (let col = 0; col < side; col++) for (let c = 0; c < 3; c++) {
        const ai = ((side - 1) * side + col) * 3 + c, bi = col * 3 + c;
        assert.equal(a.positions[ai], b.positions[bi]); assert.equal(a.normals[ai], b.normals[bi]);
      }
    }
  }
  for (let x = -1200; x <= 1200; x += 5) assert.ok(Math.abs(rawHeight(x, -1200) - terrain.heightAt(x, -1200)) < .001);
  assert.throws(() => terrain.chunk(0, 0, 8));
});

test('ground contact agrees with rendered triangles at off-grid points', () => {
  for (const [cx, cz] of [[-1, 2], [0, -2], [-2, -3], [1, 1]]) {
    const data = terrain.chunk(cx, cz), side = 61;
    for (const [u, v] of [[.17, .26], [.8, .7], [.5, .5], [.99, .03]]) for (let row = 0; row < 60; row += 7) for (let col = 0; col < 60; col += 7) {
      const index = row * side + col, a = data.positions[index * 3 + 1], b = data.positions[(index + 1) * 3 + 1], c = data.positions[(index + side) * 3 + 1], d = data.positions[(index + side + 1) * 3 + 1];
      const y = u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
      assert.ok(Math.abs(terrain.heightAt(cx * 300 + (col + u) * 5, cz * 300 + (row + v) * 5) - y) < .0001);
    }
  }
});

test('lake and ponds are actual depressions; their centres cannot be used as walking spawns', () => {
  const walker = new TerrainWalker(terrain);
  for (const b of BASINS) {
    assert.ok(terrain.heightAt(b.x, b.z) < b.level - 1);
    assert.ok(terrain.inWater(b.x, b.z)); assert.equal(walker.place(b.x, b.z), false);
  }
  assert.equal(walker.place(1300, 0), false);
  assert.equal(walker.place(NaN, 0), false); assert.equal(walker.place(0, Infinity), false);
});

test('the complete cape → wetlands → lakeshore → mountain route is dry with bounded slopes', () => {
  for (let i = 1; i < ROUTE.length; i++) {
    const a = ROUTE[i - 1], b = ROUTE[i], distance = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0; s <= distance; s++) {
      const x = a.x + (b.x - a.x) * s / distance, z = a.z + (b.z - a.z) * s / distance;
      assert.ok(!terrain.inWater(x, z), `Water at ${x}, ${z}`); assert.ok(terrain.slopeAt(x, z) < .65, `Slope at ${x}, ${z}`);
    }
  }
});

test('real 60Hz movement traverses the ENTIRE route in both directions, with no teleport or recovery', () => {
  const walker = new TerrainWalker(terrain);
  for (const point of [...ROUTE.slice(1), ...ROUTE.slice(0, -1).reverse()]) {
    let ticks = 0;
    while (Math.hypot(walker.x - point.x, walker.z - point.z) > .12 && ticks < 6000) {
      walker.yaw = Math.atan2(-(point.x - walker.x), -(point.z - walker.z));
      walker.step({ forward: 1, right: 0, sprint: true, jump: false }, 1 / 60); ticks++;
      assert.ok(Math.abs(walker.y - terrain.heightAt(walker.x, walker.z)) < .001);
    }
    assert.ok(ticks < 6000, `Movement stuck before ${JSON.stringify(point)}`);
  }
  assert.ok(walker.distance > 4100);
});

test('jump leaves the shared terrain and lands; latching and paused input do not repeat jumps', () => {
  const walker = new TerrainWalker(terrain), startY = walker.y;
  walker.step({ forward: 0, right: 0, sprint: false, jump: true }, 1 / 60);
  assert.ok(walker.y > startY); assert.equal(walker.grounded, false);
  let peak = walker.y;
  for (let i = 0; i < 120; i++) { walker.step({ forward: 0, right: 0, sprint: false, jump: true }, 1 / 60); peak = Math.max(peak, walker.y); }
  assert.ok(peak - startY > .8); assert.equal(walker.y, startY); assert.equal(walker.grounded, true);
  walker.clearInput(); walker.step({ forward: 0, right: 0, sprint: false, jump: true }, 1 / 60);
  assert.ok(walker.y > startY);
});
