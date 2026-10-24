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
  blockedAt: (x: number, z: number) => boolean;
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
  const seamMatrices: T.Matrix4[] = [];
  const edgeMatrices: T.Matrix4[] = [];
  const railMatrices: T.Matrix4[] = [];
  const railPostMatrices: T.Matrix4[] = [];
  const railEdges: { a: Pt; b: Pt }[] = [];
  // Visual battens follow the SAME actual corner heights as the walkable
  // triangles. This is cosmetic geometry, never a second collision surface.
  const segmentMatrix = (a: Pt, b: Pt, lift: number): T.Matrix4 => {
    const direction = new T.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    if (length < 1e-6) throw new RangeError('Zero-length timber detail');
    const rotation = new T.Quaternion().setFromUnitVectors(
      new T.Vector3(1, 0, 0), direction.multiplyScalar(1 / length));
    return new T.Matrix4().compose(
      new T.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + lift, (a.z + b.z) / 2),
      rotation, new T.Vector3(length, 1, 1));
  };
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
      // A dark 4cm plank end gap plus slim side edging gives each real plank
      // an identifiable silhouette, without dividing or offsetting its exact
      // two indexed walk triangles (including at a change of route heading).
      seamMatrices.push(segmentMatrix(c, d, .012));
      edgeMatrices.push(segmentMatrix(a, c, .016), segmentMatrix(b, d, .016));
      // Real timber guards follow each indexed deck edge, including its 5m
      // sampled longitudinal pitch. Both sides stay outside the 3.2m clear
      // walking centre; the west/east end approaches remain completely open.
      // All rails and uprights use just TWO new instanced draw groups.
      for (const [from, to] of [[a, c], [b, d]] as const) {
        railMatrices.push(segmentMatrix(from, to, .88));
        railEdges.push({ a: from, b: to });
      }
      const railPost = (v: Pt) =>
        railPostMatrices.push(new T.Matrix4().makeTranslation(v.x, v.y + .47, v.z));
      if (k % 3 === 0) { railPost(a); railPost(b); }
      if (k === count - 1) { railPost(c); railPost(d); }

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
  // Two additional instanced draw calls, irrespective of panel count.
  // The decorative timber stays close to the actual deck, never blocks the
  // open central 3.2m corridor and owns its resources via the same group.
  const addDetail = (name: string, matrices: T.Matrix4[], height: number,
    depth: number, color: number) => {
    const detail = new T.InstancedMesh(new T.BoxGeometry(1, height, depth),
      new T.MeshLambertMaterial({ color }), matrices.length);
    detail.name = name;
    for (let i = 0; i < matrices.length; i++) detail.setMatrixAt(i, matrices[i]);
    detail.instanceMatrix.needsUpdate = true;
    detail.computeBoundingSphere();
    group.add(detail);
  };
  addDetail('boardwalk / plank seams / instanced', seamMatrices, .025, .045, 0x514033);
  addDetail('boardwalk / side edging / instanced', edgeMatrices, .09, .085, 0x70573c);
  addDetail('boardwalk / pitch-matched guard rails / instanced', railMatrices, .12, .12, 0x66503a);
  const upright = new T.InstancedMesh(new T.BoxGeometry(.16, .94, .16),
    new T.MeshLambertMaterial({ color: 0x534031 }), railPostMatrices.length);
  upright.name = 'boardwalk / deck-grounded guard posts / instanced';
  for (let i = 0; i < railPostMatrices.length; i++) upright.setMatrixAt(i, railPostMatrices[i]);
  upright.instanceMatrix.needsUpdate = true;
  upright.computeBoundingSphere();
  group.add(upright);

  // A compact 8m spatial hash prevents a 490-rail brute-force collision scan
  // every time the native walking solver advances in 0.12m substeps.
  const guardRadius = .28;
  const railBins = new Map<string, number[]>();
  for (let i = 0; i < railEdges.length; i++) {
    const { a, b } = railEdges[i];
    for (let bx = Math.floor((Math.min(a.x, b.x) - guardRadius) / CELL);
      bx <= Math.floor((Math.max(a.x, b.x) + guardRadius) / CELL); bx++)
      for (let bz = Math.floor((Math.min(a.z, b.z) - guardRadius) / CELL);
        bz <= Math.floor((Math.max(a.z, b.z) + guardRadius) / CELL); bz++) {
        const key = bx + ':' + bz, entries = railBins.get(key) ?? [];
        entries.push(i); railBins.set(key, entries);
      }
  }
  const blockedAt = (x: number, z: number): boolean => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
    for (const i of railBins.get(BIN(x, z)) ?? []) {
      const { a, b } = railEdges[i], dx = b.x - a.x, dz = b.z - a.z;
      const length2 = dx * dx + dz * dz;
      if (length2 < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2));
      const offX = x - a.x - t * dx, offZ = z - a.z - t * dz;
      if (offX * offX + offZ * offZ <= guardRadius * guardRadius) return true;
    }
    return false;
  };

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
  // In a curved walkway, adjacent physical indexed panels may overlap at
  // waypoint joins. GPU instance matrices also quantize X/Z to Float32.
  // Seat each upright against the *same highest indexed deck top* queried
  // by the walker at its final render-space X/Z, not a pre-quantized corner.
  // This prevents a visible post bottom from being buried beneath the
  // authoritative walk surface, without altering terrain or deck collision.
  const postMatrix = new T.Matrix4(), postPosition = new T.Vector3();
  for (let i=0;i<upright.count;i++) {
    upright.getMatrixAt(i,postMatrix);
    postPosition.setFromMatrixPosition(postMatrix);
    const physicalTop = heightAt(postPosition.x,postPosition.z);
    if (physicalTop === null)
      throw new RangeError('Boardwalk guard upright has no indexed deck support');
    postMatrix.makeTranslation(postPosition.x,physicalTop+.47,postPosition.z);
    upright.setMatrixAt(i,postMatrix);
  }
  upright.instanceMatrix.needsUpdate = true;
  upright.computeBoundingSphere();

  // CPU inspection returns the exact triangle surface. Three uploads vertices
  // as Float32, so sub-millimetre display quantization is allowed in tests.
  return { group, heightAt, blockedAt, panels, supports: postMatrices.length,
    indexedTriangles: allTriangles.length };
}
