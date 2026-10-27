import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Visual budgets only. Navigation, collision and mission distances stay authoritative. */
export const MOBILE_WORLD_RENDER = Object.freeze({
  cellSize: 48,
  vegetationCellSize: 64,
  viewDistance: 112,
  detailDistance: 42,
  textureSize: 1024,
  // Opaque before the 112m cull edge, including a 3m selection update and
  // the existing third-person camera's roughly 3.4m horizontal offset.
  fogNear: 70,
  fogFar: 102,
});

/** Small ground cover is decorative; keep every authored tree and blocking rock. */
export function retainMobilePlant(name: string, index: number): boolean {
  if (name === 'grass') return index % 4 === 0;
  if (name === 'fern') return index % 3 === 0;
  if (name === 'bush') return index % 2 === 0;
  return true;
}

/** Partition exact triangles rather than drawing a whole kilometre-long trail. */
export function spatialGeometryParts(buffer: T.BufferGeometry, cellSize: number): Array<{ x: number; z: number; buffer: T.BufferGeometry }> {
  const position = buffer.getAttribute('position'), index = buffer.index;
  if (!index) throw Error('Spatial authored geometry must be indexed.');
  const cells = new Map<string, { x: number; z: number; indices: number[] }>();
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
    const x = Math.floor((position.getX(a) + position.getX(b) + position.getX(c)) / (3 * cellSize));
    const z = Math.floor((position.getZ(a) + position.getZ(b) + position.getZ(c)) / (3 * cellSize));
    const key = `${x}:${z}`;
    let cell = cells.get(key);
    if (!cell) { cell = { x, z, indices: [] }; cells.set(key, cell); }
    cell.indices.push(a, b, c);
  }
  if (cells.size === 1) {
    const cell = [...cells.values()][0];
    return [{ x: cell.x, z: cell.z, buffer }];
  }
  const result: Array<{ x: number; z: number; buffer: T.BufferGeometry }> = [];
  for (const cell of cells.values()) {
    const mapping = new Map<number, number>(), vertices: number[] = [], indices: number[] = [];
    for (const oldIndex of cell.indices) {
      let next = mapping.get(oldIndex);
      if (next === undefined) { next = vertices.length; mapping.set(oldIndex, next); vertices.push(oldIndex); }
      indices.push(next);
    }
    const part = new T.BufferGeometry();
    for (const [name, attribute] of Object.entries(buffer.attributes)) {
      if ((attribute as T.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw Error('Unexpected interleaved authored geometry.');
      const source = attribute as T.BufferAttribute;
      const ArrayType = source.array.constructor as new (length: number) => T.TypedArray;
      const values = new ArrayType(vertices.length * source.itemSize);
      for (let vertex = 0; vertex < vertices.length; vertex++) {
        const begin = vertices[vertex] * source.itemSize;
        for (let component = 0; component < source.itemSize; component++) values[vertex * source.itemSize + component] = source.array[begin + component];
      }
      part.setAttribute(name, new T.BufferAttribute(values, source.itemSize, source.normalized));
    }
    part.setIndex(indices); part.computeBoundingBox(); part.computeBoundingSphere();
    result.push({ x: cell.x, z: cell.z, buffer: part });
  }
  buffer.dispose();
  return result;
}

/** Low-detail silhouettes are used only outside the near authored-geometry band. */
export function mobileVegetationGeometry(name: string, authored: T.BufferGeometry): T.BufferGeometry {
  authored.computeBoundingBox();
  const bounds = authored.boundingBox!, size = bounds.getSize(new T.Vector3()), centre = bounds.getCenter(new T.Vector3());
  const color = authored.getAttribute('color');
  const average = (low: number, high: number, fallback: number) => {
    if (!color) return new T.Color(fallback);
    const position = authored.getAttribute('position'), sum = new T.Color(0, 0, 0); let count = 0;
    for (let index = 0; index < position.count; index++) {
      const height = (position.getY(index) - bounds.min.y) / Math.max(.01, size.y);
      if (height < low || height > high) continue;
      sum.r += color.getX(index); sum.g += color.getY(index); sum.b += color.getZ(index); count++;
    }
    return count ? sum.multiplyScalar(1 / count) : new T.Color(fallback);
  };
  const leaves = average(.36, 1, 0x517849), bark = average(0, .22, 0x78644a);
  const pieces: T.BufferGeometry[] = [];
  const add = (geometry: T.BufferGeometry, shade: T.Color, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    if (geometry.index) { const indexed = geometry; geometry = geometry.toNonIndexed(); indexed.dispose(); }
    geometry.scale(sx, sy, sz); geometry.translate(x, y, z);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) { colors[index] = shade.r; colors[index + 1] = shade.g; colors[index + 2] = shade.b; }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    // All proxy pieces share the same position/normal/color layout.
    geometry.deleteAttribute('uv'); pieces.push(geometry);
  };
  if (/pine|spruce|broadleaf/.test(name)) {
    add(new T.CylinderGeometry(size.x * .025, size.x * .045, size.y * .68, 5), bark, centre.x, bounds.min.y + size.y * .34, centre.z);
    if (name === 'broadleaf') {
      add(new T.IcosahedronGeometry(1, 0), leaves, centre.x, bounds.min.y + size.y * .68, centre.z, size.x * .53, size.y * .34, size.z * .53);
      add(new T.IcosahedronGeometry(1, 0), leaves.clone().multiplyScalar(1.08), centre.x - size.x * .14, bounds.min.y + size.y * .84, centre.z + size.z * .08, size.x * .35, size.y * .20, size.z * .35);
    } else {
      for (const [height, width, thickness] of [[.42, .52, .43], [.62, .42, .37], [.81, .29, .34]]) {
        add(new T.ConeGeometry(1, 1, 6), leaves, centre.x, bounds.min.y + size.y * height, centre.z, size.x * width, size.y * thickness, size.z * width);
      }
    }
  } else if (/grass|fern/.test(name)) {
    add(new T.ConeGeometry(1, 1, 4), leaves, centre.x, centre.y, centre.z, size.x * .48, size.y, size.z * .48);
  } else {
    add(new T.IcosahedronGeometry(1, 0), leaves, centre.x, centre.y, centre.z, size.x * .58, size.y * .58, size.z * .58);
  }
  const merged = mergeGeometries(pieces, false);
  if (!merged) throw Error('Mobile vegetation layouts differ.');
  for (const piece of pieces) piece.dispose();
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

export function resizeMobileTexture(texture: T.Texture): void {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 0, height = image?.height ?? 0;
  if (typeof document === 'undefined' || !width || !height || Math.max(width, height) <= MOBILE_WORLD_RENDER.textureSize) return;
  const factor = MOBILE_WORLD_RENDER.textureSize / Math.max(width, height), canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * factor)); canvas.height = Math.max(1, Math.round(height * factor));
  const context = canvas.getContext('2d');
  if (!context) throw Error('スマホ用テクスチャを準備できませんでした。');
  context.drawImage(texture.image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  texture.image = canvas;
}
