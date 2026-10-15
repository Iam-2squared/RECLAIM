import * as T from 'three';
import type { AreaDefinition, Collider, WorldQuality } from './types.ts';
import type { TerrainSystem } from './terrain.ts';
import { coordinateSeed, seededRandom, smoothstep } from './random.ts';
import { InstanceBuilder, WorldAssets } from './assets.ts';

export interface VegetationResult { group: T.Group; colliders: Collider[]; trees: number; rocks: number; grass: number; instances: number; meshes: number; triangles: number }

export function createVegetation(area: AreaDefinition, terrain: TerrainSystem, assets: WorldAssets, cx: number, cz: number, near: boolean, quality: WorldQuality): VegetationResult {
  const group = new T.Group(); group.name = `vegetation:${cx}:${cz}`;
  const batch = new InstanceBuilder(group, assets), colliders: Collider[] = [];
  const rng = seededRandom(coordinateSeed(area.seed + 9001, cx, cz)), size = area.lodSettings.chunkSize, biome = area.biome, override = area.qualityOverrides[quality];
  const bark = assets.mat('bark', 0x605449), bough = assets.mat('bough', 0x4a4c3b), foliage = assets.mat('foliage', 0xffffff), grassMat = assets.mat('grass', 0x62784b, { side: T.DoubleSide }), rockMat = assets.mat('rocks', biome.rockColor);
  let trees = 0, rocks = 0, grass = 0;
  const excluded = (x: number, z: number, pad: number) => {
    if (area.terrainProfile.cabinPlateau && Math.abs(x) < 9 + pad && Math.abs(z) < 10 + pad) return true;
    if (terrain.pathClearanceAt(x, z) < pad || terrain.inWater(x, z)) return true;
    return area.landmarks.some(p => ['tunnel', 'wreck', 'buildings', 'boardwalk'].includes(p.type) && Math.hypot(x - p.position.x, z - p.position.z) < p.radius + pad);
  };
  // Stable candidates are retained across quality changes; only a deterministic prefix is drawn.
  const candidates = Math.ceil(biome.treeDensity);
  for (let i = 0; i < candidates; i++) {
    const x = cx * size + rng() * size, z = cz * size + rng() * size, broadleaf = rng() < biome.broadleafFraction, variation = rng(), yaw = rng() * Math.PI * 2;
    const h = biome.minTreeHeight + variation * (biome.maxTreeHeight - biome.minTreeHeight), ground = terrain.heightAt(x, z), visible = i < candidates * override.vegetationScale;
    if (!visible || excluded(x, z, 1.6) || ground > biome.timberline || terrain.slopeAt(x, z) > 1.2) continue;
    const trunkRadius = h * (broadleaf ? .042 : .027), top = ground + h;
    batch.add('trunk', bark, new T.Vector3(x, ground + h * .43, z), new T.Vector3(trunkRadius, h * .86, trunkRadius), new T.Euler(0, yaw, 0));
    if (broadleaf) {
      const levels = near ? 4 : 2;
      for (let l = 0; l < levels; l++) {
        const angle = yaw + l * 2.4, reach = h * (.13 + l * .008), py = ground + h * (.69 + l * .055), px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
        if (near) batch.beam(bough, new T.Vector3(x, ground + h * .48, z), new T.Vector3(px, py, pz), trunkRadius * .7, 'branch');
        batch.add('broadleaf', foliage, new T.Vector3(px, py, pz), new T.Vector3(h * .22, h * .15, h * .21), new T.Euler(.1, angle, .1), biome.foliageColors[(i + l) % 3]);
      }
    } else {
      const levels = near ? 4 : 3, lobes = near ? 4 : 2;
      for (let l = 0; l < levels; l++) {
        const t = l / levels, py = ground + h * (.38 + t * .53), reach = h * (.21 - t * .155);
        for (let j = 0; j < lobes; j++) {
          const angle = yaw + j * Math.PI * 2 / lobes + l * .72, irregularity = 1 + Math.sin(i * 2.37 + j * 1.7 + l * 2.8) * .17, px = x + Math.cos(angle) * reach * .62 * irregularity, pz = z + Math.sin(angle) * reach * .62 * irregularity, branchY = py + Math.sin(i * 1.3 + j * 1.9 + l) * h * .023;
          // Distinct horizontal, irregular bough masses, rather than stacked perfect cones.
          if (near) batch.beam(bough, new T.Vector3(x, py + h * .027, z), new T.Vector3(px + Math.cos(angle) * reach * .35, branchY - h * .022, pz + Math.sin(angle) * reach * .35), trunkRadius * .28, 'branch');
          batch.add('foliage', foliage, new T.Vector3(px, branchY, pz), new T.Vector3(reach * irregularity, h * (.075 + t * .02), reach * .67), new T.Euler(.11 * irregularity, angle, -.09), biome.foliageColors[(i + l + j) % 3]);
        }
      }
      batch.add('foliage', foliage, new T.Vector3(x, top - h * .06, z), new T.Vector3(h * .045, h * .12, h * .045), new T.Euler(0, yaw, 0), biome.foliageColors[i % 3]);
    }
    colliders.push({ type: 'cylinder', x, z, radius: trunkRadius + .06, minY: ground, maxY: top, tag: 'tree-trunk' }); trees++;
  }
  const rockRng = seededRandom(coordinateSeed(area.seed + 2201, cx, cz));
  for (let i = 0; i < (area.id === 'hidaka-mountains' ? 15 : 7); i++) {
    const x = cx * size + rockRng() * size, z = cz * size + rockRng() * size, s = .5 + rockRng() * (area.id === 'hidaka-mountains' ? 2.4 : 1.8);
    if (excluded(x, z, .9)) continue;
    const y = terrain.heightAt(x, z);
    batch.add('rock', rockMat, new T.Vector3(x, y + s * .25, z), new T.Vector3(s * 1.2, s * .7, s), new T.Euler(rockRng(), rockRng() * 6, rockRng()));
    colliders.push({ type: 'cylinder', x, z, radius: s * .85, minY: y, maxY: y + s * .85, tag: 'rock' }); rocks++;
  }
  const grassRng = seededRandom(coordinateSeed(area.seed + 12291, cx, cz));
  const count = Math.round(biome.grassDensity * override.grassScale * (near ? 1 : .1));
  for (let i = 0; i < count; i++) {
    const x = cx * size + grassRng() * size, z = cz * size + grassRng() * size, h = .25 + grassRng() * .45, ground = terrain.heightAt(x, z);
    if (excluded(x, z, -.2) || ground > biome.timberline + 12) continue;
    const snowFade = 1 - smoothstep(biome.timberline, biome.timberline + 12, ground);
    batch.add('grass', grassMat, new T.Vector3(x, ground + .01, z), new T.Vector3(.55, h * snowFade, .55), new T.Euler(0, grassRng() * 6.28, 0)); grass++;
  }
  return { group, colliders, trees, rocks, grass, ...batch.finish() };
}
