/** All coordinates are local metres in a right-handed Y-up world. */
export type AreaId = 'shiretoko' | 'ishikari-mountains' | 'hidaka-mountains' | 'sapporo';
export type WorldQuality = 'low' | 'balanced';
export interface PointXZ { x: number; z: number }
export interface RoutePoint extends PointXZ { height: number }
export interface ExplorationRoute { id: string; width: number; blendWidth: number; waypoints: readonly RoutePoint[] }
export interface WorldBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Landmark {
  id: string;
  type: 'cabin' | 'radio' | 'bed' | 'door' | 'drone' | 'checkpoint' | 'exit' | 'lake' | 'boardwalk' | 'river' | 'tunnel' | 'ridge' | 'snow' | 'road' | 'wreck' | 'buildings' | 'prototype-end';
  position: PointXZ;
  radius: number;
  /** These passage objectives are development fixtures, not final story clears. */
  provisional: true;
}
export interface ExitTrigger {
  id: string;
  position: PointXZ;
  radius: number;
  targetAreaId: AreaId | null;
  provisional: true;
}
export interface WaterDefinition extends PointXZ {
  id: string;
  radiusX: number;
  radiusZ: number;
  surfaceHeight: number;
  depth: number;
  kind: 'lake' | 'river';
}
export interface TerrainProfile {
  baseHeight: number;
  amplitude: number;
  frequency: number;
  ruggedness: number;
  pathWidth: number;
  pathBlendWidth: number;
  cabinPlateau: boolean;
  water: readonly WaterDefinition[];
}
export interface BiomeDefinition {
  treeDensity: number;
  broadleafFraction: number;
  minTreeHeight: number;
  maxTreeHeight: number;
  timberline: number;
  grassDensity: number;
  groundColors: readonly [number, number, number];
  foliageColors: readonly [number, number, number];
  rockColor: number;
}
export interface AreaDefinition {
  id: AreaId;
  displayName: string;
  version: 1;
  seed: number;
  status: 'playable-introduction' | 'environment-prototype';
  bounds: WorldBounds;
  terrainProfile: TerrainProfile;
  biome: BiomeDefinition;
  climate: { skyColor: number; fogColor: number; morningLight: number; ambientLight: number; fogNear: number; fogFar: number; cloudHeight: number };
  spawn: PointXZ & { yaw: number };
  route: readonly RoutePoint[];
  /** Optional scenery detours confer no campaign progress and never replace the canonical route. */
  explorationRoutes?: readonly ExplorationRoute[];
  exitTriggers: readonly ExitTrigger[];
  landmarks: readonly Landmark[];
  objectiveIds: readonly string[];
  allowedEnemyTypes: readonly ('scout-drone')[];
  assetRefs: readonly string[];
  lodSettings: { chunkSize: 48; collisionCellSize: 2; nearRadius: 1; lowRadius: 1; balancedRadius: 2; farCellSize: 8 };
  qualityOverrides: { low: { vegetationScale: number; grassScale: number; pixelRatio: number }; balanced: { vegetationScale: number; grassScale: number; pixelRatio: number } };
}
export type Collider =
  | { type: 'cylinder'; x: number; z: number; radius: number; minY: number; maxY: number; tag: string }
  | { type: 'aabb'; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; tag: string };
