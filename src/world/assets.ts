import * as T from 'three';

/** Loader-owned shared meshes and materials. Chunk removal keeps these until area disposal. */
export class WorldAssets {
  geometries = new Map<string, T.BufferGeometry>();
  materials = new Map<string, T.Material>();
  constructor() {
    this.geometries.set('box', new T.BoxGeometry(1, 1, 1));
    this.geometries.set('trunk', new T.CylinderGeometry(.65, 1, 1, 7));
    this.geometries.set('branch', new T.CylinderGeometry(.16, .3, 1, 5));
    this.geometries.set('foliage', new T.IcosahedronGeometry(1, 0));
    this.geometries.set('broadleaf', new T.IcosahedronGeometry(1, 1));
    this.geometries.set('rock', new T.IcosahedronGeometry(1, 0));
    this.geometries.set('sphere', new T.SphereGeometry(1, 12, 7));
    // Six broad, asymmetric sasa leaves form one original low-cost tuft (no alpha texture).
    const leaves = new T.BufferGeometry(); leaves.setAttribute('position', new T.Float32BufferAttribute([
      0, 0, 0, -.38, .34, -.11, -.14, .58, -.03,
      0, .16, 0, .43, .45, .06, .17, .7, .02,
      0, .06, 0, .05, .39, -.43, .02, .63, -.19,
      0, .21, 0, -.03, .63, .37, -.01, .83, .13,
      0, .28, 0, -.29, .69, .22, -.1, .94, .09,
      0, .36, 0, .24, .72, -.2, .07, 1, -.07,
    ], 3)); leaves.computeVertexNormals(); this.geometries.set('grass', leaves);
  }
  geometry(id: string): T.BufferGeometry { return this.geometries.get(id)!; }
  mat(id: string, color: number, extra: T.MeshLambertMaterialParameters = {}): T.Material {
    const existing = this.materials.get(id); if (existing) return existing;
    const material = new T.MeshLambertMaterial({ color, ...extra }); material.name = id; this.materials.set(id, material); return material;
  }
  basicMat(id: string, color: number, extra: T.MeshBasicMaterialParameters = {}): T.Material {
    const existing = this.materials.get(id); if (existing) return existing;
    const material = new T.MeshBasicMaterial({ color, ...extra }); material.name = id; this.materials.set(id, material); return material;
  }
  ownGeometry(id: string, geometry: T.BufferGeometry): T.BufferGeometry { this.geometries.set(id, geometry); return geometry; }
  dispose(): void { for (const g of this.geometries.values()) g.dispose(); for (const m of this.materials.values()) m.dispose(); this.geometries.clear(); this.materials.clear(); }
}

interface Batch { geometry: T.BufferGeometry; material: T.Material; matrices: T.Matrix4[]; colors: T.Color[] }
export class InstanceBuilder {
  private batches = new Map<string, Batch>();
  readonly root: T.Group;
  readonly assets: WorldAssets;
  constructor(root: T.Group, assets: WorldAssets) { this.root = root; this.assets = assets; }
  add(geometryId: string, material: T.Material, position: T.Vector3, scale: T.Vector3, rotation = new T.Euler(), color?: number): void {
    const key = `${geometryId}:${material.uuid}`; let batch = this.batches.get(key);
    if (!batch) { batch = { geometry: this.assets.geometry(geometryId), material, matrices: [], colors: [] }; this.batches.set(key, batch); }
    batch.matrices.push(new T.Matrix4().compose(position, new T.Quaternion().setFromEuler(rotation), scale));
    batch.colors.push(new T.Color(color ?? 0xffffff));
  }
  box(material: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rz = 0): void { this.add('box', material, new T.Vector3(x, y, z), new T.Vector3(w, h, d), new T.Euler(0, ry, rz)); }
  beam(material: T.Material, a: T.Vector3, b: T.Vector3, thickness: number, geometry = 'box'): void {
    const delta = b.clone().sub(a), mid = a.clone().add(b).multiplyScalar(.5), quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize());
    this.add(geometry, material, mid, new T.Vector3(thickness, delta.length(), thickness), new T.Euler().setFromQuaternion(quaternion));
  }
  finish(): { instances: number; meshes: number; triangles: number } {
    let instances = 0, triangles = 0;
    for (const batch of this.batches.values()) {
      const mesh = new T.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      mesh.name = `instances:${batch.material.name}`;
      batch.matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, batch.colors[i]); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox(); this.root.add(mesh);
      instances += batch.matrices.length; triangles += (batch.geometry.index?.count ?? batch.geometry.attributes.position.count) / 3 * batch.matrices.length;
    }
    return { instances, meshes: this.batches.size, triangles };
  }
}
