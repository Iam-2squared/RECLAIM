import type { AreaDefinition, AreaId, Landmark, PointXZ } from './types.ts';

const lod = { chunkSize: 48, collisionCellSize: 2, nearRadius: 1, lowRadius: 1, balancedRadius: 2, farCellSize: 8 } as const;
const quality = { low: { vegetationScale: .58, grassScale: .28, pixelRatio: .75 }, balanced: { vegetationScale: 1, grassScale: 1, pixelRatio: 1.15 } };
const poi = (id: string, type: Landmark['type'], x: number, z: number, radius = 3): Landmark => ({ id, type, position: { x, z }, radius, provisional: true });
const naturalAssets = ['procedural/heightfield-v1', 'procedural/branched-spruce-v1', 'procedural/broadleaf-v1', 'procedural/rocks-v1', 'procedural/sasa-v1'];

/** Pure, versioned definitions. Importing this module performs no rendering or I/O. */
export const AREA_DEFINITIONS: Readonly<Record<AreaId, AreaDefinition>> = {
  shiretoko: {
    id: 'shiretoko', displayName: '知床', version: 1, seed: 431071, status: 'playable-introduction',
    bounds: { minX: -240, maxX: 240, minZ: -192, maxZ: 288 },
    terrainProfile: { baseHeight: 14, amplitude: 22, frequency: .011, ruggedness: .18, pathWidth: 3.6, pathBlendWidth: 9, cabinPlateau: true, water: [{ id: 'lake', x: -46, z: 62, radiusX: 29, radiusZ: 35, surfaceHeight: .3, depth: 2.6, kind: 'lake' }] },
    biome: { treeDensity: 31, broadleafFraction: .22, minTreeHeight: 5.8, maxTreeHeight: 12.5, timberline: 110, grassDensity: 115, groundColors: [0x525746, 0x394d37, 0x756e55], foliageColors: [0x284839, 0x39553d, 0x53633d], rockColor: 0x696d62 },
    climate: { skyColor: 0x9ba9a9, fogColor: 0x95a2a0, morningLight: 0xf0ddbd, ambientLight: 0xd2dfd8, fogNear: 40, fogFar: 186, cloudHeight: 94 },
    spawn: { x: 0, z: -1.5, yaw: Math.PI },
    route: [{ x: 0, z: 0, height: 0 }, { x: 0, z: 16, height: 0 }, { x: 0, z: 30, height: 1.3 }, { x: 12, z: 64, height: 5.5 }, { x: 4, z: 104, height: 10 }, { x: -4, z: 140, height: 13 }],
    explorationRoutes: [{ id: 'lakebank-spur', width: 2, blendWidth: 6, waypoints: [{ x: 0, z: 30, height: 1.3 }, { x: -8, z: 34, height: 1.8 }, { x: -13, z: 43, height: 2.2 }, { x: -13, z: 60, height: 4.2 }, { x: -13, z: 78, height: 4.2 }] }],
    exitTriggers: [{ id: 'shiretoko-exit', position: { x: 4, z: 104 }, radius: 5, targetAreaId: 'ishikari-mountains', provisional: true }],
    landmarks: [poi('cabin', 'cabin', 0, 0, 7), poi('cabin-spawn', 'bed', 0, -1.5, 2), poi('radio', 'radio', -3, -3, 2.6), poi('cabin-door', 'door', 0, 5, 2), poi('drone', 'drone', 0, 25, 12), poi('trail-checkpoint', 'checkpoint', 12, 64, 5), poi('shiretoko-exit', 'exit', 4, 104, 5), poi('lake', 'lake', -46, 62, 35), poi('boardwalk', 'boardwalk', -13, 60, 4)],
    objectiveIds: ['wake', 'radio', 'friend-contact', 'leave-cabin', 'scout-drone', 'trail-checkpoint', 'shiretoko-exit'],
    allowedEnemyTypes: ['scout-drone'], assetRefs: [...naturalAssets, 'procedural/wooden-cabin-v1', 'procedural/radio-v1', 'procedural/boardwalk-v1'], lodSettings: lod, qualityOverrides: quality,
  },
  'ishikari-mountains': {
    id: 'ishikari-mountains', displayName: '石狩山地', version: 1, seed: 508213, status: 'environment-prototype',
    bounds: { minX: -240, maxX: 240, minZ: -192, maxZ: 288 },
    terrainProfile: { baseHeight: 38, amplitude: 43, frequency: .009, ruggedness: .31, pathWidth: 3.3, pathBlendWidth: 8, cabinPlateau: false, water: [{ id: 'stream', x: 47, z: 63, radiusX: 6, radiusZ: 125, surfaceHeight: 13, depth: 2, kind: 'river' }] },
    biome: { treeDensity: 42, broadleafFraction: .04, minTreeHeight: 7, maxTreeHeight: 15, timberline: 130, grassDensity: 85, groundColors: [0x485146, 0x344738, 0x7b7668], foliageColors: [0x263d32, 0x304a3c, 0x44533f], rockColor: 0x777d74 },
    climate: { skyColor: 0x939ea3, fogColor: 0x8b999a, morningLight: 0xe0d5bd, ambientLight: 0xcad6d5, fogNear: 35, fogFar: 165, cloudHeight: 120 },
    spawn: { x: 0, z: 0, yaw: Math.PI },
    route: [{ x: 0, z: 0, height: 12 }, { x: 8, z: 45, height: 18 }, { x: -18, z: 84, height: 29 }, { x: -6, z: 132, height: 34 }, { x: 3, z: 166, height: 35 }],
    exitTriggers: [{ id: 'ishikari-passage', position: { x: -6, z: 132 }, radius: 5, targetAreaId: 'hidaka-mountains', provisional: true }],
    landmarks: [poi('ishikari-trail-checkpoint', 'checkpoint', 8, 45, 5), poi('ishikari-tunnel-checkpoint', 'checkpoint', -18, 84, 5), poi('ishikari-passage', 'exit', -6, 132, 5), poi('stream', 'river', 47, 63, 7), poi('collapsed-forest-road', 'tunnel', -18, 84, 9)],
    objectiveIds: ['ishikari-trail-checkpoint', 'ishikari-tunnel-checkpoint', 'ishikari-passage'], allowedEnemyTypes: [], assetRefs: [...naturalAssets, 'procedural/forest-road-tunnel-v1', 'procedural/stream-v1'], lodSettings: lod, qualityOverrides: quality,
  },
  'hidaka-mountains': {
    id: 'hidaka-mountains', displayName: '日高山脈', version: 1, seed: 701113, status: 'environment-prototype',
    bounds: { minX: -240, maxX: 240, minZ: -192, maxZ: 288 },
    terrainProfile: { baseHeight: 85, amplitude: 76, frequency: .008, ruggedness: .63, pathWidth: 2.8, pathBlendWidth: 8, cabinPlateau: false, water: [] },
    biome: { treeDensity: 17, broadleafFraction: .015, minTreeHeight: 3.5, maxTreeHeight: 8.7, timberline: 87, grassDensity: 40, groundColors: [0x717871, 0x535e53, 0x8a8f85], foliageColors: [0x35433b, 0x455147, 0x596047], rockColor: 0x858b85 },
    climate: { skyColor: 0xa5b2bb, fogColor: 0xa2acb3, morningLight: 0xf0e2cf, ambientLight: 0xd5e0e5, fogNear: 70, fogFar: 245, cloudHeight: 185 },
    spawn: { x: 0, z: 0, yaw: Math.PI },
    route: [{ x: 0, z: 0, height: 38 }, { x: 12, z: 40, height: 55 }, { x: -12, z: 80, height: 74 }, { x: 6, z: 132, height: 84 }, { x: 15, z: 165, height: 87 }],
    exitTriggers: [{ id: 'hidaka-passage', position: { x: 6, z: 132 }, radius: 5, targetAreaId: 'sapporo', provisional: true }],
    landmarks: [poi('hidaka-lower-checkpoint', 'checkpoint', 12, 40, 5), poi('hidaka-ridge-checkpoint', 'checkpoint', -12, 80, 5), poi('hidaka-passage', 'exit', 6, 132, 5), poi('ridge-view', 'ridge', -12, 80, 5), poi('snowfield', 'snow', 55, 112, 18)],
    objectiveIds: ['hidaka-lower-checkpoint', 'hidaka-ridge-checkpoint', 'hidaka-passage'], allowedEnemyTypes: [], assetRefs: [...naturalAssets, 'procedural/snowfield-v1', 'procedural/ridge-v1'], lodSettings: lod, qualityOverrides: quality,
  },
  sapporo: {
    id: 'sapporo', displayName: '札幌', version: 1, seed: 951823, status: 'environment-prototype',
    bounds: { minX: -240, maxX: 240, minZ: -192, maxZ: 288 },
    terrainProfile: { baseHeight: 8, amplitude: 9, frequency: .007, ruggedness: .08, pathWidth: 8, pathBlendWidth: 14, cabinPlateau: false, water: [] },
    biome: { treeDensity: 18, broadleafFraction: .35, minTreeHeight: 5.5, maxTreeHeight: 10.5, timberline: 100, grassDensity: 65, groundColors: [0x575c51, 0x3e4c39, 0x827967], foliageColors: [0x3e5340, 0x526248, 0x69704c], rockColor: 0x747873 },
    climate: { skyColor: 0xaaaead, fogColor: 0x9da5a4, morningLight: 0xe9dac1, ambientLight: 0xd5dcd6, fogNear: 55, fogFar: 205, cloudHeight: 110 },
    spawn: { x: 0, z: 0, yaw: Math.PI },
    route: [{ x: 0, z: 0, height: 5 }, { x: 0, z: 40, height: 5.5 }, { x: 0, z: 85, height: 6.3 }, { x: 0, z: 132, height: 7 }, { x: 0, z: 174, height: 7.2 }],
    exitTriggers: [{ id: 'sapporo-prototype-end', position: { x: 0, z: 132 }, radius: 5, targetAreaId: null, provisional: true }],
    landmarks: [poi('city-edge-checkpoint', 'checkpoint', 0, 40, 5), poi('future-mission-poi', 'checkpoint', 0, 85, 5), poi('sapporo-prototype-end', 'prototype-end', 0, 132, 5), poi('suburban-road', 'road', 0, 80, 8), poi('abandoned-car', 'wreck', 8.7, 66, 3), poi('distant-city', 'buildings', 0, 190, 35)],
    objectiveIds: ['city-edge-checkpoint', 'future-mission-poi', 'sapporo-prototype-end'], allowedEnemyTypes: [], assetRefs: [...naturalAssets, 'procedural/suburban-road-v1', 'procedural/wreck-nondriveable-v1', 'procedural/city-greybox-v1'], lodSettings: lod, qualityOverrides: quality,
  },
};

export const AREA_IDS: readonly AreaId[] = ['shiretoko', 'ishikari-mountains', 'hidaka-mountains', 'sapporo'];
export function getAreaDefinition(id: AreaId): AreaDefinition { return AREA_DEFINITIONS[id]; }
export function insideBounds(point: PointXZ, bounds: AreaDefinition['bounds'], margin = 0): boolean {
  return point.x >= bounds.minX + margin && point.x <= bounds.maxX - margin && point.z >= bounds.minZ + margin && point.z <= bounds.maxZ - margin;
}
export function validateAreaDefinition(area: AreaDefinition): string[] {
  const errors: string[] = [];
  if (!AREA_IDS.includes(area.id)) errors.push('Unknown area ID');
  if (area.version !== 1 || !Number.isInteger(area.seed)) errors.push('Invalid version or seed');
  if (!(area.bounds.maxX > area.bounds.minX && area.bounds.maxZ > area.bounds.minZ)) errors.push('Empty bounds');
  if (!insideBounds(area.spawn, area.bounds, 6)) errors.push('Unsafe spawn bounds');
  if (area.route.length < 2 || area.route.some(p => !insideBounds(p, area.bounds) || !Number.isFinite(p.height))) errors.push('Invalid route');
  const explorationIds = new Set<string>();
  for (const route of area.explorationRoutes ?? []) {
    if (!route.id || explorationIds.has(route.id) || route.width <= 0 || route.blendWidth <= 0 || route.waypoints.length < 2 || route.waypoints.some(p => !insideBounds(p, area.bounds) || !Number.isFinite(p.height))) errors.push(`Invalid exploration route ${route.id}`);
    explorationIds.add(route.id);
  }
  const ids = area.landmarks.map(p => p.id);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate landmark ID');
  for (const p of area.landmarks) if (!insideBounds(p.position, area.bounds) || !(p.radius > 0)) errors.push(`Invalid landmark ${p.id}`);
  for (const e of area.exitTriggers) if (!insideBounds(e.position, area.bounds, e.radius) || !ids.includes(e.id) || (e.targetAreaId !== null && !AREA_IDS.includes(e.targetAreaId))) errors.push(`Invalid exit ${e.id}`);
  if (area.terrainProfile.pathWidth <= 0 || area.terrainProfile.pathBlendWidth <= 0 || area.lodSettings.chunkSize % area.lodSettings.collisionCellSize !== 0 || area.lodSettings.chunkSize % area.lodSettings.farCellSize !== 0) errors.push('Invalid terrain / LOD grid');
  return errors;
}
