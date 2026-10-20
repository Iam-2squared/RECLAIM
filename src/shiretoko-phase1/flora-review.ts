/**
 * Opt-in Shiretoko flora study. This is renderer-only: no collision, campaign,
 * save mutation or claim of a finished biome. The terrain's original height
 * sampler is supplied by preview.ts; no second surface is generated.
 */
import * as T from 'three';
import { planFlora, type FloraInstance, type FloraKind, type FloraSurface } from './vegetation-plan.ts';

export const FLORA_REVIEW_CHUNKS: readonly (readonly [number, number])[] =
  Object.freeze(Array.from({ length: 5 }, (_, z) =>
    Array.from({ length: 4 }, (_, x) => [x + 2, z + 2] as const)).flat());
const KINDS: readonly FloraKind[] = ['spruce', 'birch', 'alpine-shrub', 'sedge', 'sasa', 'stone'];
type Part = Readonly<{
  shape: 'trunk' | 'lobe' | 'blade' | 'rock';
  size: readonly [number, number, number];
  center: number;
  color: number;
}>;
const PARTS: Record<FloraKind, readonly Part[]> = {
  spruce: [
    { shape: 'trunk', size: [.34, 6.0, .34], center: 3.0, color: 0x504738 },
    { shape: 'lobe', size: [1.75, 2.7, 1.3], center: 4.65, color: 0x304739 },
    { shape: 'lobe', size: [1.1, 2.3, 1.25], center: 6.2, color: 0x3a5443 },
  ],
  birch: [
    { shape: 'trunk', size: [.24, 6.9, .24], center: 3.45, color: 0xa6a596 },
    { shape: 'lobe', size: [2.1, 2.55, 1.6], center: 6.8, color: 0x71845b },
    { shape: 'lobe', size: [1.5, 1.8, 1.3], center: 8.0, color: 0x829369 },
  ],
  'alpine-shrub': [{ shape: 'lobe', size: [1.05, .55, 1.4], center: .55, color: 0x708267 }],
  sedge: [
    { shape: 'blade', size: [.4, 1.1, .4], center: .55, color: 0x85936e },
    { shape: 'blade', size: [.31, .8, .31], center: .48, color: 0x768d62 },
  ],
  sasa: [
    { shape: 'lobe', size: [.8, .58, 1.2], center: .65, color: 0x687d53 },
    { shape: 'lobe', size: [1.1, .45, .72], center: .48, color: 0x819560 },
  ],
  stone: [{ shape: 'rock', size: [.8, .38, .55], center: .3, color: 0x787c76 }],
};
export type FloraReview = Readonly<{
  group: T.Group;
  count: number;
  byKind: Readonly<Record<FloraKind, number>>;
  drawCalls: number;
  dispose: () => void;
}>;
function shapeGeometry(part: Part): T.BufferGeometry {
  const geometry: T.BufferGeometry = part.shape === 'trunk'
    ? new T.CylinderGeometry(.52, .67, 1, 7)
    : part.shape === 'blade' ? new T.ConeGeometry(.7, 1, 5)
    : part.shape === 'rock' ? new T.DodecahedronGeometry(1, 0)
    : new T.IcosahedronGeometry(1, 1);
  geometry.scale(...part.size);
  geometry.translate(0, part.center, 0);
  return geometry;
}
/** Shared instance matrices per species: no per-plant draw calls or timers. */
export function createFloraReview(surface: FloraSurface, quality: 'low' | 'balanced' = 'low'): FloraReview {
  if (quality !== 'low' && quality !== 'balanced') throw new RangeError('invalid flora review quality');
  const group = new T.Group();
  group.name = 'opt-in flora study / geometry without collision';
  const byKind: Record<FloraKind, number> = {
    spruce: 0, birch: 0, 'alpine-shrub': 0, sedge: 0, sasa: 0, stone: 0,
  };
  const instances = new Map<FloraKind, FloraInstance[]>();
  for (const kind of KINDS) instances.set(kind, []);
  for (const [cx, cz] of FLORA_REVIEW_CHUNKS) {
    for (const item of planFlora(cx, cz, surface, quality)) {
      instances.get(item.kind)!.push(item);
    }
  }
  const matrices = new T.Object3D(), meshes: T.InstancedMesh[] = [];
  for (const kind of KINDS) {
    const plants = instances.get(kind)!;
    byKind[kind] = plants.length;
    if (!plants.length) continue;
    for (let i = 0; i < PARTS[kind].length; i++) {
      const part = PARTS[kind][i];
      const geometry = shapeGeometry(part);
      const material = new T.MeshStandardMaterial({ color: part.color, roughness: .96, metalness: 0 });
      const mesh = new T.InstancedMesh(geometry, material, plants.length);
      mesh.name = 'flora/' + kind + '/part-' + i;
      mesh.instanceMatrix.setUsage(T.StaticDrawUsage);
      plants.forEach((item, index) => {
        matrices.position.set(item.x, item.y, item.z);
        matrices.rotation.set(0, item.rotation, 0);
        matrices.scale.setScalar(item.scale);
        matrices.updateMatrix();
        mesh.setMatrixAt(index, matrices.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      meshes.push(mesh);
    }
  }
  const count = Object.values(byKind).reduce((sum, n) => sum + n, 0);
  let disposed = false;
  return Object.freeze({
    group, count, byKind: Object.freeze(byKind), drawCalls: meshes.length,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
        group.remove(mesh);
      }
    },
  });
}
