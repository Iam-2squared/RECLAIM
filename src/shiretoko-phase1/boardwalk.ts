import * as T from 'three';
import { ROUTE, ShiretokoTerrain } from './terrain.ts';

/**
 * Experimental standalone Shiretoko marsh boardwalk. The geometry triangles,
 * not an invisible proxy plane, are the authoritative optional walk surface.
 * No campaign/save integration, third-party meshes, or asset downloads.
 */
export type DeckHeight = (x: number, z: number) => number | null;
export type BoardwalkReview = Readonly<{
  group: T.Group;
  heightAt: DeckHeight;
  panels: number;
  supports: number;
  indexedTriangles: number;
}>;

type Pt = Readonly<{ x: number; y: number; z: number }>;
type TopTriangle = Readonly<{
  a: Pt; b: Pt; c: Pt;
  minX: number; maxX: number; minZ: number; maxZ: number;
}>;
const CELL = 8;
const LIMIT_PANELS = 260;
const BIN = (x: number, z: number) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v);
};
const crossXZ = (a: Pt, b: Pt, c: Pt) =>
  (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);

export function createBoardwalkReview(terrain: ShiretokoTerrain): BoardwalkReview {
  // Cover the opening wetland trail, not the lake/mountain route. Waypoints
  // remain authoritative; nothing is unlocked or written to persistent storage.
  const path = ROUTE.slice(3, 7);
  const routeLengths = path.slice(1).map((point, index) =>
    Math.hypot(point.x - path[index].x, point.z - path[index].z));
  const total = routeLengths.reduce((a, b) => a + b, 0);
  const group = new T.Group();
  group.name = 'development review / walkable marsh boardwalk';
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const bins = new Map<string, TopTriangle[]>();
  const allTriangles: TopTriangle[] = [];
  const postMatrices: T.Matrix4[] = [];
  const wood = [0x765744, 0x866649, 0x806047, 0x906d52, 0x715341];
  let panels = 0, travelled = 0;

  function store(a: Pt, b: Pt, c: Pt): void {
    // Reject degenerate or upside-down panels before they can enter collision.
    const orientation = crossXZ(a, b, c);
    if (!(orientation > 1e-6)) throw new Error('Boardwalk deck top must face upward');
    const tri = { a, b, c,
      minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
      minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z) };
    allTriangles.push(tri);
    for (let bx = Math.floor(tri.minX / CELL); bx <= Math.floor(tri.maxX / CELL); bx++)
      for (let bz = Math.floor(tri.minZ / CELL); bz <= Math.floor(tri.maxZ / CELL); bz++) {
        const key = `${bx}:${bz}`;
        const list = bins.get(key) ?? []; list.push(tri); bins.set(key, list);
      }
  }

  for (let segment = 0; segment < routeLengths.length; segment++) {
    const p = path[segment], q = path[segment + 1], distance = routeLengths[segment];
    const count = Math.ceil(distance / 1.6);
    const tangentX = (q.x - p.x) / distance, tangentZ = (q.z - p.z) / distance;
    const sidewaysX = -tangentZ * 1.6, sidewaysZ = tangentX * 1.6;
    for (let k = 0; k < count; k++) {
      const t0 = k / count, t1 = (k + 1) / count;
      const centre = (t: number) => ({ x: lerp(p.x, q.x, t), z: lerp(p.z, q.z, t) });
      const c0 = centre(t0), c1 = centre(t1);
      const raise = (t: number) => {
        const s = travelled + t * distance;
        return .12 + .42 * smooth(s / 8) * smooth((total - s) / 8);
      };
      const at = (c: { x: number; z: number }, t: number, side: number): Pt => {
        const x = c.x + sidewaysX * side, z = c.z + sidewaysZ * side;
        return { x, z, y: terrain.heightAt(x, z) + raise(t) };
      };
      const a = at(c0, t0, +1), b = at(c0, t0, -1);
      const c = at(c1, t1, +1), d = at(c1, t1, -1);
      const start = vertices.length / 3;
      for (const v of [a, b, c, d]) vertices.push(v.x, v.y, v.z);
      const color = new T.Color(wood[(panels * 13 + segment * 7) % wood.length]);
      for (let j = 0; j < 4; j++) colors.push(color.r, color.g, color.b);
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
      store(a, c, b); store(b, c, d);

      if (panels % 5 === 0) for (const side of [-1, 1]) {
        const pos = at(centre((t0 + t1) / 2), (t0 + t1) / 2, side * .92);
        const floor = terrain.heightAt(pos.x, pos.z);
        const height = Math.max(.12, pos.y - floor);
        const m = new T.Matrix4();
        m.compose(new T.Vector3(pos.x, floor + height / 2, pos.z),
          new T.Quaternion(), new T.Vector3(1, height, 1));
        postMatrices.push(m);
      }
      panels++;
    }
    travelled += distance;
  }
  if (panels > LIMIT_PANELS) throw new RangeError('Boardwalk panel budget exceeded');
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const deck = new T.Mesh(geometry, new T.MeshLambertMaterial({
    vertexColors: true, side: T.DoubleSide,
  }));
  deck.name = 'boardwalk / real indexed deck collision surface';
  group.add(deck);
  const postGeometry = new T.BoxGeometry(.17, 1, .17);
  const posts = new T.InstancedMesh(postGeometry,
    new T.MeshLambertMaterial({ color: 0x554537 }), postMatrices.length);
  posts.name = 'boardwalk / instanced supports';
  for (let i = 0; i < postMatrices.length; i++) posts.setMatrixAt(i, postMatrices[i]);
  posts.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  group.add(posts);

  const heightAt: DeckHeight = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let highest: number | null = null;
    for (const tri of bins.get(BIN(x, z)) ?? []) {
      if (x < tri.minX - 1e-5 || x > tri.maxX + 1e-5 ||
          z < tri.minZ - 1e-5 || z > tri.maxZ + 1e-5) continue;
      const den = crossXZ(tri.a, tri.b, tri.c);
      const u = crossXZ({ x, y: 0, z }, tri.b, tri.c) / den;
      const v = crossXZ(tri.a, { x, y: 0, z }, tri.c) / den;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-5) continue;
      const y = tri.a.y * u + tri.b.y * v + tri.c.y * w;
      if (highest === null || y > highest) highest = y;
    }
    return highest;
  };
  // CPU inspection returns the exact triangle surface. Three uploads vertices
  // as Float32, so sub-millimetre display quantization is allowed in tests.
  return { group, heightAt, panels, supports: postMatrices.length,
    indexedTriangles: allTriangles.length };
}
