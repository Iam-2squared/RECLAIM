import type { AreaDefinition, PointXZ, RoutePoint } from './types.ts';
import { latticeNoise, smoothstep } from './random.ts';

export interface RouteSample { distance: number; height: number; x: number; z: number; segment: number }
export interface TerrainChunkData { positions: Float32Array; colors: Float32Array; indices: Uint32Array; segments: number; cellSize: number; cx: number; cz: number }

/** One deterministic sampled surface drives mesh triangles, ground contact and spawn. */
export class TerrainSystem {
  readonly area: AreaDefinition;
  readonly cellSize: number;
  private samples = new Map<string, number>();
  constructor(area: AreaDefinition) { this.area = area; this.cellSize = area.lodSettings.collisionCellSize; }
  private sampleRoute(waypoints: readonly RoutePoint[], x: number, z: number): RouteSample {
    let best: RouteSample = { distance: Infinity, height: 0, x, z, segment: 0 };
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i], b = waypoints[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const px = a.x + dx * t, pz = a.z + dz * t, distance = Math.hypot(x - px, z - pz);
      if (distance < best.distance) best = { distance, height: a.height + (b.height - a.height) * t, x: px, z: pz, segment: i };
    }
    return best;
  }
  routeAt(x: number, z: number): RouteSample { return this.sampleRoute(this.area.route, x, z); }
  pathClearanceAt(x: number, z: number): number {
    let clearance = this.routeAt(x, z).distance - this.area.terrainProfile.pathWidth;
    for (const route of this.area.explorationRoutes ?? []) clearance = Math.min(clearance, this.sampleRoute(route.waypoints, x, z).distance - route.width);
    return clearance;
  }
  rawHeight(x: number, z: number): number {
    const p = this.area.terrainProfile, f = p.frequency, seed = this.area.seed;
    const broad = latticeNoise(seed, x * f, z * f), medium = latticeNoise(seed + 103, x * f * 2.1, z * f * 2.1), detail = latticeNoise(seed + 709, x * f * 5.3, z * f * 5.3);
    let height = p.baseHeight + p.amplitude * (broad * .64 + medium * .25 + detail * p.ruggedness * .18);
    // Gentle ridge bands are scalar height additions, rather than independent giant mountains.
    if (this.area.id === 'hidaka-mountains') height += 22 * Math.pow(Math.abs(Math.sin((x + z * .18) * .017)), 1.7);
    for (const water of p.water) {
      const d = Math.hypot((x - water.x) / water.radiusX, (z - water.z) / water.radiusZ);
      const blend = 1 - smoothstep(.72, 1.25, d);
      const bed = water.surfaceHeight - water.depth + Math.max(0, d - .65) * 2;
      height = height * (1 - blend) + bed * blend;
    }
    // Optional scenery-only trails are shaped before the canonical progression route.
    for (const trail of this.area.explorationRoutes ?? []) {
      const point = this.sampleRoute(trail.waypoints, x, z), blend = 1 - smoothstep(trail.width, trail.width + trail.blendWidth, point.distance);
      height = height * (1 - blend) + point.height * blend;
    }
    const route = this.routeAt(x, z), pathBlend = 1 - smoothstep(p.pathWidth, p.pathWidth + p.pathBlendWidth, route.distance);
    height = height * (1 - pathBlend) + route.height * pathBlend;
    if (p.cabinPlateau) {
      const distance = Math.max(Math.abs(x), Math.abs(z));
      const blend = 1 - smoothstep(7.5, 15, distance);
      height *= 1 - blend;
    }
    return height;
  }
  gridHeight(ix: number, iz: number): number {
    const key = `${ix}:${iz}`, cached = this.samples.get(key); if (cached !== undefined) return cached;
    const value = this.rawHeight(ix * this.cellSize, iz * this.cellSize);
    // Bounded CPU cache: exploring / area returns never retain the entire hypothetical world.
    if (this.samples.size >= 24000) this.samples.delete(this.samples.keys().next().value!);
    this.samples.set(key, value); return value;
  }
  heightAt(x: number, z: number): number {
    const gx = x / this.cellSize, gz = z / this.cellSize, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
    const a = this.gridHeight(ix, iz), b = this.gridHeight(ix + 1, iz), c = this.gridHeight(ix, iz + 1), d = this.gridHeight(ix + 1, iz + 1);
    // Same b–c diagonal and triangle interpolation as buildChunkData (not bilinear).
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  slopeAt(x: number, z: number): number { return Math.hypot(this.heightAt(x + .4, z) - this.heightAt(x - .4, z), this.heightAt(x, z + .4) - this.heightAt(x, z - .4)) / .8; }
  isWalkable(x: number, z: number, maxSlope = .85): boolean {
    const b = this.area.bounds;
    return x > b.minX + 1 && x < b.maxX - 1 && z > b.minZ + 1 && z < b.maxZ - 1 && !this.inWater(x, z) && this.slopeAt(x, z) <= maxSlope;
  }
  inWater(x: number, z: number): boolean {
    return this.area.terrainProfile.water.some(w => Math.hypot((x - w.x) / w.radiusX, (z - w.z) / w.radiusZ) < .88 && this.heightAt(x, z) < w.surfaceHeight - .2);
  }
  surfaceColor(x: number, z: number, height: number): [number, number, number] {
    const [ground, green, trail] = this.area.biome.groundColors, route = this.routeAt(x, z);
    let path = 1 - smoothstep(this.area.terrainProfile.pathWidth * .62, this.area.terrainProfile.pathWidth + 1.8, route.distance);
    for (const detour of this.area.explorationRoutes ?? []) { const sample = this.sampleRoute(detour.waypoints, x, z); path = Math.max(path, 1 - smoothstep(detour.width * .62, detour.width + 1.8, sample.distance)); }
    const noise = latticeNoise(this.area.seed + 303, x * .09, z * .09) * .5 + .5;
    let mix = height > this.area.biome.timberline ? .1 : noise;
    const linear = (channel: number) => { const value = channel / 255; return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); };
    const rgb = (n: number) => [linear(n >> 16 & 255), linear(n >> 8 & 255), linear(n & 255)];
    const a = rgb(ground), b = rgb(green), c = rgb(trail);
    if (this.area.id === 'hidaka-mountains' && height > 108) { mix = .1; c[0] = .82; c[1] = .85; c[2] = .85; }
    return [0, 1, 2].map(i => (a[i] * (1 - mix) + b[i] * mix) * (1 - path) + c[i] * path) as [number, number, number];
  }
  buildChunkData(cx: number, cz: number, cellSize = this.cellSize): TerrainChunkData {
    const size = this.area.lodSettings.chunkSize, segments = size / cellSize;
    if (!Number.isInteger(segments) || cellSize < this.cellSize || cellSize % this.cellSize !== 0) throw new Error('Terrain LOD must use an aligned integral collision grid');
    const positions = new Float32Array((segments + 1) ** 2 * 3), colors = new Float32Array(positions.length), indices = new Uint32Array(segments * segments * 6);
    for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
      const px = cx * size + x * cellSize, pz = cz * size + z * cellSize, h = this.heightAt(px, pz), i = (z * (segments + 1) + x) * 3;
      positions.set([px, h, pz], i); colors.set(this.surfaceColor(px, pz, h), i);
    }
    let index = 0;
    for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
      const a = z * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1;
      indices.set([a, c, b, b, c, d], index); index += 6;
    }
    return { positions, colors, indices, segments, cellSize, cx, cz };
  }
  dispose(): void { this.samples.clear(); }
  cacheSize(): number { return this.samples.size; }
}

export function pointDistance(a: PointXZ, b: PointXZ): number { return Math.hypot(a.x - b.x, a.z - b.z); }
