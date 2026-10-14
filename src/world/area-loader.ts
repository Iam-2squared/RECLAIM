import * as T from 'three';
import type { AreaDefinition, Collider, WorldQuality } from './types.ts';
import { validateAreaDefinition } from './areas.ts';
import { TerrainSystem } from './terrain.ts';
import { WorldAssets } from './assets.ts';
import { createVegetation } from './vegetation.ts';
import type { VegetationResult } from './vegetation.ts';
import { createLandmarks, addAtmosphere } from './landmarks.ts';

interface Chunk { group: T.Group; geometry: T.BufferGeometry; vegetation: VegetationResult; cellSize: number }
export interface AreaStats {
  areaId: string; quality: WorldQuality; activeChunks: number; nearChunks: number; farChunks: number;
  loadedChunks: number; unloadedChunks: number; trees: number; rocks: number; grass: number;
  instances: number; geometries: number; materials: number; textures: 0; triangles: number;
  renderObjects: number; approximateGpuBytes: number; colliders: number; terrainCacheEntries: number;
  lastLoadMs: number; totalLoadMs: number; disposed: boolean;
}
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
function disposeInstances(root: T.Object3D): void { root.traverse(o => { if (o instanceof T.InstancedMesh) o.dispose(); }); }

/** An area owns no renderer, input, event listener, timer or RAF. WorldView shares its renderer. */
export class AreaLoader {
  readonly scene = new T.Scene();
  readonly terrain: TerrainSystem;
  readonly area: AreaDefinition;
  colliders: Collider[] = [];
  quality: WorldQuality;
  private assets = new WorldAssets();
  private chunks = new Map<string, Chunk>();
  private fixedColliders: Collider[];
  private terrainMaterial: T.Material;
  private lastX: number;
  private lastZ: number;
  private centerKey = '';
  private disposed = false;
  private loadedChunks = 0;
  private unloadedChunks = 0;
  private lastLoadMs = 0;
  private totalLoadMs = 0;
  constructor(area: AreaDefinition, quality: WorldQuality) {
    const errors = validateAreaDefinition(area); if (errors.length) throw new Error(`Invalid world ${area.id}: ${errors.join(', ')}`);
    this.area = area; this.quality = quality; this.terrain = new TerrainSystem(area); this.lastX = area.spawn.x; this.lastZ = area.spawn.z;
    this.scene.name = `mission:${area.id}`; this.scene.background = new T.Color(area.climate.skyColor);
    this.scene.fog = new T.Fog(area.climate.fogColor, area.climate.fogNear, quality === 'low' ? area.climate.fogFar * .72 : area.climate.fogFar);
    this.scene.add(new T.HemisphereLight(area.climate.ambientLight, 0x354334, 1.55));
    const sun = new T.DirectionalLight(area.climate.morningLight, 1.65); sun.position.set(-110, 90, 65); this.scene.add(sun);
    this.terrainMaterial = this.assets.mat('terrain', 0xffffff, { vertexColors: true });
    const landmarks = createLandmarks(area, this.terrain, this.assets); this.scene.add(landmarks.group); this.fixedColliders = landmarks.colliders;
    const atmosphere = new T.Group(); atmosphere.name = 'atmosphere'; addAtmosphere(area, this.terrain, this.assets, atmosphere); this.scene.add(atmosphere);
    this.update(this.lastX, this.lastZ);
  }
  update(x: number, z: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.lastX = x; this.lastZ = z;
    const size = this.area.lodSettings.chunkSize, cx = Math.floor(x / size), cz = Math.floor(z / size), key = `${cx}:${cz}:${this.quality}`;
    if (key === this.centerKey) return;
    const started = now(); this.centerKey = key;
    const radius = this.quality === 'low' ? this.area.lodSettings.lowRadius : this.area.lodSettings.balancedRadius, interest = new Map<string, { cx: number; cz: number; near: boolean }>(), bounds = this.area.bounds;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx, pz = cz + dz;
      if (px * size >= bounds.maxX || (px + 1) * size <= bounds.minX || pz * size >= bounds.maxZ || (pz + 1) * size <= bounds.minZ) continue;
      interest.set(`${px}:${pz}`, { cx: px, cz: pz, near: Math.max(Math.abs(dx), Math.abs(dz)) <= this.area.lodSettings.nearRadius });
    }
    for (const [id, chunk] of this.chunks) {
      const target = interest.get(id), expected = target?.near ? this.area.lodSettings.collisionCellSize : this.area.lodSettings.farCellSize;
      if (!target || chunk.cellSize !== expected) this.removeChunk(id, chunk);
    }
    for (const [id, entry] of interest) if (!this.chunks.has(id)) {
      const cellSize = entry.near ? this.area.lodSettings.collisionCellSize : this.area.lodSettings.farCellSize, data = this.terrain.buildChunkData(entry.cx, entry.cz, cellSize);
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(data.positions, 3)); geometry.setAttribute('color', new T.BufferAttribute(data.colors, 3)); geometry.setIndex(new T.BufferAttribute(data.indices, 1)); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
      const group = new T.Group(); group.name = `chunk:${id}:lod-${cellSize}`;
      const mesh = new T.Mesh(geometry, this.terrainMaterial); mesh.name = `terrain:${id}`; group.add(mesh);
      const vegetation = createVegetation(this.area, this.terrain, this.assets, entry.cx, entry.cz, entry.near, this.quality); group.add(vegetation.group);
      this.chunks.set(id, { group, geometry, vegetation, cellSize }); this.scene.add(group); this.loadedChunks++;
    }
    this.colliders = [...this.fixedColliders, ...[...this.chunks.values()].flatMap(c => c.vegetation.colliders)];
    this.lastLoadMs = now() - started; this.totalLoadMs += this.lastLoadMs;
  }
  setQuality(quality: WorldQuality): void {
    if (this.disposed || quality === this.quality) return;
    for (const [id, chunk] of this.chunks) this.removeChunk(id, chunk);
    this.quality = quality; this.centerKey = '';
    (this.scene.fog as T.Fog).far = quality === 'low' ? this.area.climate.fogFar * .72 : this.area.climate.fogFar;
    this.update(this.lastX, this.lastZ);
  }
  private removeChunk(id: string, chunk: Chunk): void { this.scene.remove(chunk.group); disposeInstances(chunk.group); chunk.geometry.dispose(); chunk.group.clear(); this.chunks.delete(id); this.unloadedChunks++; }
  stats(): AreaStats {
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(); let triangles = 0, instances = 0, renderObjects = 0, approximateGpuBytes = 0;
    this.scene.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      renderObjects++; geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      const count = o instanceof T.InstancedMesh ? o.count : 1; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0) / 3 * count;
      if (o instanceof T.InstancedMesh) { instances += o.count; approximateGpuBytes += o.instanceMatrix.array.byteLength + (o.instanceColor?.array.byteLength ?? 0); }
    });
    for (const g of geometries) { for (const attr of Object.values(g.attributes)) approximateGpuBytes += attr.array.byteLength; approximateGpuBytes += g.index?.array.byteLength ?? 0; }
    const chunks = [...this.chunks.values()];
    return { areaId: this.area.id, quality: this.quality, activeChunks: chunks.length, nearChunks: chunks.filter(c => c.cellSize === 2).length, farChunks: chunks.filter(c => c.cellSize !== 2).length, loadedChunks: this.loadedChunks, unloadedChunks: this.unloadedChunks, trees: chunks.reduce((n, c) => n + c.vegetation.trees, 0), rocks: chunks.reduce((n, c) => n + c.vegetation.rocks, 0), grass: chunks.reduce((n, c) => n + c.vegetation.grass, 0), instances, geometries: geometries.size, materials: materials.size, textures: 0, triangles: Math.round(triangles), renderObjects, approximateGpuBytes, colliders: this.colliders.length, terrainCacheEntries: this.terrain.cacheSize(), lastLoadMs: Number(this.lastLoadMs.toFixed(3)), totalLoadMs: Number(this.totalLoadMs.toFixed(3)), disposed: this.disposed };
  }
  dispose(): void {
    if (this.disposed) return;
    for (const [id, chunk] of this.chunks) this.removeChunk(id, chunk);
    disposeInstances(this.scene); this.assets.dispose(); this.terrain.dispose(); this.fixedColliders = []; this.colliders = []; this.scene.clear(); this.scene.background = null; this.scene.fog = null; this.disposed = true;
  }
}
