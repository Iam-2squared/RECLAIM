import * as T from 'three';
import type { AreaDefinition, Collider } from './types.ts';
import type { TerrainSystem } from './terrain.ts';
import { seededRandom } from './random.ts';
import { latticeNoise, smoothstep } from './random.ts';
import { InstanceBuilder, WorldAssets } from './assets.ts';

export interface LandmarkResult { group: T.Group; colliders: Collider[]; instances: number; meshes: number; triangles: number }
export function createLandmarks(area: AreaDefinition, terrain: TerrainSystem, assets: WorldAssets): LandmarkResult {
  const group = new T.Group(); group.name = `landmarks:${area.id}`;
  const batch = new InstanceBuilder(group, assets), colliders: Collider[] = [];
  const wood = assets.mat('wood', 0x887051), darkWood = assets.mat('dark-wood', 0x5c4b39), plank = assets.mat('plank', 0x9b896c), iron = assets.mat('iron', 0x46534e), dark = assets.mat('dark', 0x29352f), stone = assets.mat('stone', 0x777f77), pale = assets.mat('pale', 0xc4c0a8), roof = assets.mat('roof', 0x485650), blue = assets.mat('cloth', 0x586b68);
  const glass = assets.mat('glass', 0x809d9c, { transparent: true, opacity: .24, side: T.DoubleSide, depthWrite: false });
  const aabb = (tag: string, x: number, z: number, w: number, d: number, minY: number, maxY: number) => colliders.push({ type: 'aabb', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY, maxY, tag });
  const beam = (mat: T.Material, a: number[], b: number[], thickness: number) => batch.beam(mat, new T.Vector3(...a), new T.Vector3(...b), thickness);
  if (area.id === 'shiretoko') {
    const base = terrain.heightAt(0, 0), wallTop = base + 3.2;
    // Individually arranged planks are material-batched; the opening is real geometry.
    for (let i = 0; i < 20; i++) batch.box(i % 3 ? plank : wood, -4.75 + i * .5, base - .035, 0, .486, .09, 9.9);
    for (let row = 0; row < 13; row++) {
      const y = base + .125 + row * .247;
      for (const side of [-1, 1]) {
        // Side windows at z -0.8: the sill/header restore wall below/above them.
        if (y > base + 1.1 && y < base + 2.5) { batch.box(row % 3 ? wood : darkWood, side * 5, y, -3.45, .22, .24, 3.1); batch.box(wood, side * 5, y, 2.55, .22, .24, 4.9); }
        else batch.box(row % 3 ? wood : darkWood, side * 5, y, 0, .22, .24, 10);
        batch.box(row % 3 ? wood : darkWood, side * 3.2, y, 5, 3.6, .24, .22);
      }
      if (y > base + 2.5) batch.box(wood, 0, y, 5, 2.8, .24, .22);
      if (y > base + 1.1 && y < base + 2.5) { batch.box(wood, -3.25, y, -5, 3.5, .24, .22); batch.box(wood, 3.25, y, -5, 3.5, .24, .22); }
      else batch.box(wood, 0, y, -5, 10, .24, .22);
    }
    // Correct gable: ridge follows Z, each roof half rises toward x=0.
    const angle = Math.atan2(2.15, 5.55), halfLength = Math.hypot(5.55, 2.15);
    batch.box(roof, -2.775, wallTop + 1.075, 0, halfLength, .17, 11.3, 0, angle);
    batch.box(roof, 2.775, wallTop + 1.075, 0, halfLength, .17, 11.3, 0, -angle);
    batch.box(iron, 0, wallTop + 2.2, 0, .22, .13, 11.5);
    const gable = new T.BufferGeometry(); gable.setAttribute('position', new T.Float32BufferAttribute([-5, wallTop, -5, 0, wallTop + 2.15, -5, 5, wallTop, -5, -5, wallTop, 5, 5, wallTop, 5, 0, wallTop + 2.15, 5], 3)); gable.computeVertexNormals();
    // The two walls face outward; their backs must remain opaque from the playable room.
    const gableWood = assets.mat('gable-wood', 0x887051, { side: T.DoubleSide });
    const gables = new T.Mesh(assets.ownGeometry('cabin-gables', gable), gableWood); gables.name = 'cabin-gables'; group.add(gables);
    for (const side of [-1, 1]) {
      for (const z of [-5, 5]) batch.box(darkWood, side * 5, base + 1.65, z, .28, 3.5, .28);
      batch.box(glass, side * 5, base + 1.85, -.85, .027, 1.35, 2.1);
      batch.box(plank, side * 5.03, base + 1.1, -.85, .12, .12, 2.3); batch.box(plank, side * 5.03, base + 2.56, -.85, .12, .12, 2.3);
      batch.box(plank, side * 5.03, base + 1.85, -.85, .14, 1.5, .08);
      aabb(`cabin-side-${side}`, side * 5, 0, .28, 10.4, base, wallTop + .1);
      aabb(`cabin-front-${side}`, side * 3.2, 5, 3.6, .28, base, wallTop + .1);
      batch.box(darkWood, side * 1.36, base + 1.3, 5, .17, 2.6, .32);
    }
    batch.box(glass, 0, base + 1.85, -5, 2.94, 1.35, .028); batch.box(plank, 0, base + 1.85, -5.02, .1, 1.5, .14);
    batch.box(plank, 0, base + 1.1, -5.02, 3.2, .12, .14); batch.box(plank, 0, base + 2.55, -5.02, 3.2, .12, .14);
    aabb('cabin-back', 0, -5, 10.4, .28, base, wallTop + .1);
    batch.box(darkWood, 0, base + 2.59, 5, 2.9, .16, .32);
    // Door rests open beside the opening. No invisible door collider is present.
    batch.box(wood, -2.43, base + 1.16, 5.2, 2.15, 2.3, .13, -.18); batch.box(iron, -1.72, base + 1.08, 5.42, .07, .11, .08);
    for (let z = 5.3; z < 8.2; z += .35) batch.box(plank, 0, terrain.heightAt(0, z) + .02, z, 4.8, .07, .33);
    for (const x of [-2.5, 2.5]) for (const z of [5.35, 8.1]) batch.box(darkWood, x, base + .45, z, .12, .9, .12);
    beam(darkWood, [-2.5, base + .88, 5.35], [-2.5, base + .88, 8.1], .09); beam(darkWood, [2.5, base + .88, 5.35], [2.5, base + .88, 8.1], .09);
    // Bed and radio are authored POIs, recognizable from inside at the actual spawn.
    const radio = area.landmarks.find(p => p.id === 'radio')!.position, bed = { x: 3, z: -2.7 };
    batch.box(darkWood, bed.x, base + .28, bed.z, 1.75, .5, 2.65); batch.box(pale, bed.x, base + .58, bed.z, 1.68, .23, 2.45);
    batch.box(blue, bed.x, base + .735, bed.z + .28, 1.7, .08, 1.65); batch.box(pale, bed.x, base + .79, bed.z - .88, 1.25, .2, .48);
    batch.box(wood, bed.x, base + .8, bed.z - 1.36, 1.8, 1.35, .14); aabb('bed', bed.x, bed.z, 1.85, 2.8, base, base + .95);
    batch.box(plank, radio.x, base + .85, radio.z, 1.9, .12, .85);
    for (const dx of [-.75, .75]) for (const dz of [-.3, .3]) batch.box(darkWood, radio.x + dx, base + .4, radio.z + dz, .1, .8, .1);
    aabb('radio-table', radio.x, radio.z, 1.9, .9, base, base + 1.35);
    batch.box(dark, radio.x, base + 1.16, radio.z, .79, .48, .42); batch.box(iron, radio.x + .2, base + 1.16, radio.z + .217, .23, .32, .02);
    for (let i = 0; i < 7; i++) batch.box(iron, radio.x - .31 + i * .056, base + 1.15, radio.z + .222, .022, .31, .025);
    batch.add('sphere', pale, new T.Vector3(radio.x + .21, base + 1.1, radio.z + .24), new T.Vector3(.055, .055, .022));
    beam(iron, [radio.x - .29, base + 1.4, radio.z], [radio.x - .2, base + 2, radio.z], .014);
    // A path-side shelter marker and contour-following bank boardwalk, no collision mismatch.
    const bank = area.landmarks.find(p => p.type === 'boardwalk')!.position;
    for (let z = 44; z <= 80; z += 1.05) {
      const x = bank.x, y = terrain.heightAt(x, z) + .035;
      batch.box(plank, x, y, z, 2.15, .07, 1.01);
      if (Math.round(z) % 4 === 0) for (const dx of [-1.05, 1.05]) { batch.box(wood, x + dx, y + .56, z, .1, 1.15, .1); }
      for (const dx of [-1.05, 1.05]) batch.box(darkWood, x + dx, y + 1.08, z, .065, .065, 1.1);
    }
  }
  if (area.id === 'ishikari-mountains') {
    const p = area.landmarks.find(p => p.type === 'tunnel')!.position, floor = terrain.heightAt(p.x, p.z);
    // A short damaged mountain-road portal; the centre remains traversable.
    for (const dz of [-5, 5]) {
      for (const dx of [-4.6, 4.6]) { batch.box(stone, p.x + dx, floor + 2.2, p.z + dz, 1.8, 4.4, 1.4); aabb('tunnel-side', p.x + dx, p.z + dz, 1.8, 1.6, floor, floor + 5); }
      for (let i = 0; i < 9; i++) {
        const angle = i / 8 * Math.PI, x = p.x + Math.cos(angle) * 4.6, y = floor + 2 + Math.sin(angle) * 3;
        batch.box(stone, x, y, p.z + dz, 1.4, 1.2, 1.5, 0, angle - Math.PI / 2);
      }
    }
    for (const dx of [-5.5, 5.5]) for (let z = p.z - 7; z <= p.z + 7; z += 2) { const y = terrain.heightAt(p.x + dx, z); batch.add('rock', stone, new T.Vector3(p.x + dx, y + 1.4, z), new T.Vector3(2.8, 2.7, 2.6), new T.Euler(0, z, .2)); }
    for (let z = p.z - 12; z < p.z + 12; z += 4) { const y = terrain.heightAt(p.x, z); batch.box(dark, p.x, y + .02, z, 5.5, .04, 3.94); }
    batch.box(iron, p.x + 5.3, floor + 3.3, p.z - 6, .22, 6.6, .25, 0, .11);
    beam(iron, [p.x + 5.3, floor + 6.5, p.z - 6], [p.x + 9, floor + 3.8, p.z - 3], .08);
  }
  if (area.id === 'hidaka-mountains') {
    const snow = area.landmarks.find(p => p.type === 'snow')!.position, snowMat = assets.mat('snow', 0xcbd4d3);
    const positions: number[] = [], indices: number[] = [], countX = 12, countZ = 9;
    for (let z = 0; z <= countZ; z++) for (let x = 0; x <= countX; x++) { const px = snow.x + (x - countX / 2) * 3, pz = snow.z + (z - countZ / 2) * 3; positions.push(px, terrain.heightAt(px, pz) + .065, pz); }
    for (let z = 0; z < countZ; z++) for (let x = 0; x < countX; x++) { const a = z * (countX + 1) + x, b = a + 1, c = a + countX + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    group.add(new T.Mesh(assets.ownGeometry('snowfield', geometry), snowMat));
    const ridge = area.landmarks.find(p => p.type === 'ridge')!.position;
    for (let i = 0; i < 5; i++) batch.add('rock', stone, new T.Vector3(ridge.x - 3, terrain.heightAt(ridge.x - 3, ridge.z) + .25 + i * .3, ridge.z), new T.Vector3(.75 - i * .1, .32, .64 - i * .085), new T.Euler(0, i, .06));
    for (let z = 20; z < 128; z += 17) { const p = terrain.routeAt(0, z), x = p.x + 4.5, h = terrain.heightAt(x, z); batch.box(wood, x, h + .6, z, .13, 1.2, .13); batch.box(pale, x, h + .9, z, .27, .16, .15); }
  }
  if (area.id === 'sapporo') {
    const asphalt = assets.mat('asphalt', 0x454d49), concrete = assets.mat('concrete', 0x7f8982), rust = assets.mat('rust', 0x795c4a), windows = assets.mat('city-windows', 0x34423f);
    const positions: number[] = [], indices: number[] = [];
    for (let z = 0; z <= 180; z += 2) for (const x of [-8, 8]) positions.push(x, terrain.heightAt(x, z) + .026, z);
    for (let i = 0; i < 90; i++) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); group.add(new T.Mesh(assets.ownGeometry('suburban-road', geometry), asphalt));
    for (let z = 6; z < 174; z += 10) { batch.box(pale, 0, terrain.heightAt(0, z) + .054, z, .13, .022, 3.8); for (const x of [-7.45, 7.45]) batch.box(pale, x, terrain.heightAt(x, z) + .05, z, .11, .018, 9.95); }
    const rng = seededRandom(area.seed + 231);
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
      const z = 102 + i * 17 + rng() * 6, x = side * (26 + rng() * 52), h = 9 + rng() * (i > 3 ? 40 : 10), w = 8 + rng() * 10, d = 9 + rng() * 11, y = terrain.heightAt(x, z);
      batch.box(i % 2 ? concrete : stone, x, y + h / 2, z, w, h, d); batch.box(dark, x, y + h + .12, z, w + .25, .3, d + .25);
      aabb('city-building', x, z, w, d, y, y + h);
      for (let floor = 0; floor < Math.floor(h / 3.8); floor++) for (let col = -1; col <= 1; col++) batch.box(windows, x + col * w * .25, y + 2 + floor * 3.8, z - d / 2 - .02, w * .13, 1.8, .035);
    }
    const car = area.landmarks.find(p => p.type === 'wreck')!.position, y = terrain.heightAt(car.x, car.z);
    batch.box(rust, car.x, y + .66, car.z, 2.15, .95, 4.4, -.09, .045); batch.box(iron, car.x, y + 1.33, car.z - .12, 1.8, .72, 2.1, -.09);
    batch.box(windows, car.x, y + 1.44, car.z + .99, 1.5, .44, .035, -.09); batch.box(dark, car.x, y + .54, car.z + 2.22, 1.9, .23, .12, -.09);
    for (const dx of [-1, 1]) for (const dz of [-1.35, 1.35]) batch.add('trunk', dark, new T.Vector3(car.x + dx, y + .42, car.z + dz), new T.Vector3(.43, .23, .43), new T.Euler(0, 0, Math.PI / 2));
    aabb('wreck:non-driveable', car.x, car.z, 2.4, 4.8, y, y + 1.9);
    for (const side of [-1, 1]) for (let z = 34; z < 170; z += 28) { const x = side * 10.5, ground = terrain.heightAt(x, z); batch.box(iron, x, ground + 3.5, z, .17, 7, .17, 0, side * .035); batch.box(dark, x - side * 1.2, ground + 6.85, z, 2.5, .16, .3); }
    for (const side of [-1, 1]) { const x = side * 8.5, end = area.exitTriggers[0].position, h = terrain.heightAt(x, end.z); batch.box(concrete, x, h + .5, end.z, 2, 1, .65); batch.box(rust, x, h + 1.4, end.z, .18, 1.8, .18); }
  }
  // Passage markers carry no future place names; revelation belongs to campaign UI.
  for (const p of area.landmarks.filter(p => p.type === 'checkpoint' || p.type === 'exit' || p.type === 'prototype-end')) {
    const x = p.position.x + area.terrainProfile.pathWidth + 1.2, z = p.position.z, y = terrain.heightAt(x, z);
    batch.box(darkWood, x, y + .85, z, .17, 1.7, .17); batch.box(plank, x, y + 1.5, z, .9, .4, .075); batch.box(pale, x, y + 1.5, z - .041, .13, .24, .03);
  }
  return { group, colliders, ...batch.finish() };
}

/** Separate, rounded ridge grids. These never substitute for the walked collision terrain. */
export function addAtmosphere(area: AreaDefinition, terrain: TerrainSystem, assets: WorldAssets, root: T.Group): void {
  const rng = seededRandom(area.seed + 197), mountains = assets.mat('backdrop-mountains', 0xffffff, { vertexColors: true }), cloud = assets.basicMat('low-cloud', 0xc0cac8, { transparent: true, opacity: .16, depthWrite: false });
  const batches = new InstanceBuilder(root, assets);
  for (let i = 0; i < 11; i++) {
    const angle = i / 11 * Math.PI * 2, radius = 245 + rng() * 32, cx = Math.sin(angle) * radius, cz = Math.cos(angle) * radius, rotation = angle + Math.PI / 2;
    const base = area.id === 'hidaka-mountains' ? 57 : area.id === 'ishikari-mountains' ? 12 : 0;
    const height = (area.id === 'sapporo' ? 23 : area.id === 'hidaka-mountains' ? 124 : area.id === 'ishikari-mountains' ? 86 : 72) * (.82 + rng() * .26), wide = 86 + rng() * 40, depth = 62 + rng() * 27, phase = rng() * 6.28;
    const positions: number[] = [], colors: number[] = [], indices: number[] = [], countX = 16, countZ = 10;
    for (let z = 0; z <= countZ; z++) for (let x = 0; x <= countX; x++) {
      const u = x / countX * 2 - 1, v = z / countZ * 2 - 1;
      const crest = .64 + Math.sin(u * 3.7 + phase) * .18 + Math.sin(u * 8.3 + phase * .7) * .065;
      const edge = (1 - smoothstep(.63, 1, Math.abs(u))) * Math.pow(Math.max(0, 1 - v * v), 1.28), detail = latticeNoise(area.seed + i * 19, u * 3 + 10, v * 2 + 8) * .055;
      const y = base + height * Math.max(0, crest + detail) * edge, lx = u * wide, lz = v * depth;
      positions.push(cx + Math.cos(rotation) * lx - Math.sin(rotation) * lz, y, cz + Math.sin(rotation) * lx + Math.cos(rotation) * lz);
      const tint = new T.Color(area.id === 'hidaka-mountains' ? 0x8b9796 : 0x778a80), snow = area.id === 'hidaka-mountains' ? smoothstep(base + height * .53, base + height * .79, y) * .67 : 0;
      tint.lerp(new T.Color(0xcbd5d6), snow); colors.push(tint.r, tint.g, tint.b);
    }
    for (let z = 0; z < countZ; z++) for (let x = 0; x < countX; x++) { const a = z * (countX + 1) + x, b = a + 1, c = a + countX + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const ridge = new T.Mesh(assets.ownGeometry(`backdrop-${i}`, geometry), mountains); ridge.name = `backdrop-ridge:${i}`; root.add(ridge);
  }
  // Five uneven lobes form a soft static cloud bank: no thin, tilted disc silhouettes.
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2, radius = 180 + rng() * 65, cx = Math.cos(angle) * radius, cz = Math.sin(angle) * radius, cy = area.climate.cloudHeight + 5 + rng() * 12;
    for (let j = 0; j < 5; j++) batches.add('sphere', cloud, new T.Vector3(cx + (j - 2) * 9, cy + Math.sin(j * 1.8 + i) * 3, cz + Math.cos(j * 2.1) * 5), new T.Vector3(9 + rng() * 4, 5 + rng() * 3, 8 + rng() * 3));
  }
  const sunMat = assets.basicMat('morning-sun', 0xd5c6ad); batches.add('sphere', sunMat, new T.Vector3(-142, area.climate.cloudHeight * .52, 180), new T.Vector3(7, 7, 7));
  batches.finish();
  // Water surface polygons are small procedural meshes. No photographic image is loaded.
  const waterMat = assets.mat('water', 0x536e70, { transparent: true, opacity: .86, side: T.DoubleSide });
  for (const water of area.terrainProfile.water) {
    const geometry = new T.CircleGeometry(1, 40); geometry.rotateX(-Math.PI / 2); const mesh = new T.Mesh(assets.ownGeometry(`water-${water.id}`, geometry), waterMat);
    mesh.position.set(water.x, water.surfaceHeight, water.z); mesh.scale.set(water.radiusX * .87, 1, water.radiusZ * .87); root.add(mesh);
    const shore = new InstanceBuilder(root, assets), stoneMat = assets.mat('shore-stone', 0x727f74);
    for (let i = 0; i < 14; i++) { const angle = i / 14 * Math.PI * 2, x = water.x + Math.cos(angle) * water.radiusX, z = water.z + Math.sin(angle) * water.radiusZ; shore.add('rock', stoneMat, new T.Vector3(x, terrain.heightAt(x, z) + .18, z), new T.Vector3(.9, .45, 1.2), new T.Euler(0, angle, 0)); }
    shore.finish();
  }
}
