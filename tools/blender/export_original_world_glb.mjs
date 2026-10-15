// Offline authoring snapshot of the original AreaLoader scene. No Blender/Fab.
// Node 22.16+: node --experimental-strip-types tools/blender/export_original_world_glb.mjs --write
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAreaDefinition } from '../../src/world/areas.ts';
import { AreaLoader } from '../../src/world/area-loader.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GLB_NAME = 'RECLAIM_Shiretoko_Procedural_v03.glb';
const MANIFEST_NAME = 'RECLAIM_Shiretoko_Procedural_v03.manifest.json';
const SCHEMA = 'reclaim.original-world-glb.v1';
const CONFIG = Object.freeze({ areaId: 'shiretoko', quality: 'balanced', focus: { x: 0, z: 48 } });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** FileReader is the only browser API used by GLTFExporter's binary writer. */
class NodeFileReader {
  result = null;
  error = null;
  onload = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }, error => {
      this.error = error;
      this.onerror?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}

export function readGlb(bytes) {
  const input = Buffer.from(bytes);
  assert(input.length >= 28, 'GLB is too short');
  assert.equal(input.readUInt32LE(0), 0x46546c67, 'Invalid GLB magic');
  assert.equal(input.readUInt32LE(4), 2, 'GLB must be version 2');
  assert.equal(input.readUInt32LE(8), input.length, 'GLB declared/file lengths differ');
  let offset = 12;
  const chunks = [];
  while (offset < input.length) {
    assert(offset + 8 <= input.length, 'Truncated GLB chunk header');
    const length = input.readUInt32LE(offset), type = input.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, 'GLB chunk is not 4-byte aligned');
    assert(offset + 8 + length <= input.length, 'GLB chunk extends beyond the file');
    chunks.push({ type, bytes: input.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  assert.equal(offset, input.length);
  assert.equal(chunks.length, 2, 'Expected one JSON and one embedded BIN chunk');
  assert.equal(chunks[0].type, 0x4e4f534a);
  assert.equal(chunks[1].type, 0x004e4942);
  const json = JSON.parse(chunks[0].bytes.toString('utf8'));
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].uri, undefined, 'External buffer URI is forbidden');
  assert(json.buffers[0].byteLength <= chunks[1].bytes.length);
  assert(chunks[1].bytes.length - json.buffers[0].byteLength < 4);
  assert.equal(json.images?.length ?? 0, 0, 'External/art textures are not allowed in this export');
  assert.equal(json.textures?.length ?? 0, 0);
  for (const view of json.bufferViews) {
    assert.equal(view.buffer, 0);
    assert((view.byteOffset ?? 0) >= 0 && view.byteLength >= 0);
    assert((view.byteOffset ?? 0) + view.byteLength <= json.buffers[0].byteLength, 'Buffer view is out of range');
  }
  return { json, binaryBytes: chunks[1].bytes.length, jsonBytes: chunks[0].bytes.length };
}

function arrayBytes(attribute) {
  const array = attribute.array;
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function sourceMeshes(scene) {
  const entries = new Map();
  scene.updateMatrixWorld(true);
  let index = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const id = `reclaim-mesh-${String(index++).padStart(4, '0')}`;
    object.userData.reclaimOriginalWorldExportId = id;
    assert(object.geometry.getAttribute('position'), `Missing vertices: ${object.name}`);
    entries.set(id, object);
  });
  return entries;
}

function meshTotals(scene) {
  let meshObjects = 0, instancedMeshes = 0, instances = 0, triangles = 0;
  const geometries = new Set();
  const materials = new Set();
  const bounds = new T.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshObjects++;
    geometries.add(object.geometry);
    const count = object.isInstancedMesh ? object.count : 1;
    if (object.isInstancedMesh) { instancedMeshes++; instances += count; }
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * count;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    if (object.isInstancedMesh) object.computeBoundingBox();
    bounds.expandByObject(object);
  });
  return { meshObjects, instancedMeshes, instances, triangles: Math.round(triangles),
    uniqueGeometries: geometries.size, materials: materials.size, textures: 0,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}

function disposeParsed(scene) {
  const geometries = new Set(), materials = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    if (object.isInstancedMesh) object.dispose();
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  scene.clear();
}

async function verifyRoundTrip(bytes, originalScene) {
  const structure = readGlb(bytes);
  assert(structure.json.extensionsRequired?.includes('EXT_mesh_gpu_instancing'), 'Expected GPU-instancing extension');
  const manager = new T.LoadingManager();
  manager.setURLModifier(() => { throw new Error('External requests are forbidden for this embedded GLB'); });
  const packed = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader(manager).parseAsync(packed, '');
  try {
    const originals = sourceMeshes(originalScene);
    const actuals = new Map();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const id = object.userData.reclaimOriginalWorldExportId;
      assert(id && !actuals.has(id), 'Round-trip mesh identifier is missing/duplicate');
      actuals.set(id, object);
    });
    assert.equal(actuals.size, originals.size, 'Mesh-object count differs after GLB parse');
    let maxInstanceMatrixDelta = 0, maxWorldMatrixDelta = 0;
    for (const [id, original] of originals) {
      const actual = actuals.get(id);
      assert(actual, `Missing round-trip mesh ${id}`);
      assert.equal(Boolean(actual.isInstancedMesh), Boolean(original.isInstancedMesh), `Lost instancing: ${id}`);
      for (const attributeName of ['position', 'color']) {
        const before = original.geometry.getAttribute(attributeName), after = actual.geometry.getAttribute(attributeName);
        assert.equal(Boolean(after), Boolean(before), `Lost ${attributeName}: ${id}`);
        if (before) assert.equal(hash(arrayBytes(after)), hash(arrayBytes(before)), `Changed ${attributeName}: ${id}`);
      }
      assert.equal(Boolean(actual.geometry.index), Boolean(original.geometry.index));
      if (original.geometry.index) assert.equal(hash(arrayBytes(actual.geometry.index)), hash(arrayBytes(original.geometry.index)), `Changed triangle indices: ${id}`);
      for (let i = 0; i < 16; i++) {
        const delta = Math.abs(actual.matrixWorld.elements[i] - original.matrixWorld.elements[i]);
        assert(Number.isFinite(delta));
        maxWorldMatrixDelta = Math.max(maxWorldMatrixDelta, delta);
      }
      if (original.isInstancedMesh) {
        assert.equal(actual.count, original.count, `Changed instance count: ${id}`);
        assert.equal(Boolean(actual.instanceColor), Boolean(original.instanceColor), `Lost instance colour: ${id}`);
        if (original.instanceColor) assert.equal(hash(arrayBytes(actual.instanceColor)), hash(arrayBytes(original.instanceColor)), `Changed instance colours: ${id}`);
        assert.equal(actual.instanceMatrix.array.length, original.instanceMatrix.array.length);
        for (let i = 0; i < original.instanceMatrix.array.length; i++) {
          const delta = Math.abs(actual.instanceMatrix.array[i] - original.instanceMatrix.array[i]);
          assert(Number.isFinite(delta));
          maxInstanceMatrixDelta = Math.max(maxInstanceMatrixDelta, delta);
        }
      }
    }
    // Quaternion decomposition uses float32 storage for instanced transforms.
    assert(maxInstanceMatrixDelta <= 0.0002, `Instance transform drift: ${maxInstanceMatrixDelta}`);
    assert(maxWorldMatrixDelta <= 0.000001, `World transform drift: ${maxWorldMatrixDelta}`);
    const before = meshTotals(originalScene), after = meshTotals(gltf.scene);
    for (const key of ['meshObjects', 'instancedMeshes', 'instances', 'triangles']) assert.equal(after[key], before[key], `Changed ${key}`);
    const maxBoundsDelta = Math.max(...['min', 'max'].flatMap(side => before.bounds[side].map((value, i) => Math.abs(value - after.bounds[side][i]))));
    assert(maxBoundsDelta <= .002, `Geometry bounds drift: ${maxBoundsDelta}`);
    return { structuralGlbValidation: 'PASS', nodeThreeParserRoundTrip: 'PASS', vertexAndIndexHashes: 'PASS',
      instanceColours: 'PASS', stats: after, maxInstanceMatrixDelta, maxWorldMatrixDelta, maxBoundsDelta,
      requiredExtensions: structure.json.extensionsRequired, usedExtensions: structure.json.extensionsUsed,
      glbJsonBytes: structure.jsonBytes, glbBinaryBytes: structure.binaryBytes,
      blender522Import: 'UNVERIFIED', blender522Render: 'UNVERIFIED', browserVisualRoundTrip: 'UNVERIFIED' };
  } finally { disposeParsed(gltf.scene); }
}

function inputRecords() {
  return ['src/world/areas.ts', 'src/world/types.ts', 'src/world/random.ts', 'src/world/terrain.ts',
    'src/world/area-loader.ts', 'src/world/vegetation.ts', 'src/world/assets.ts', 'src/world/landmarks.ts',
    'tools/blender/export_original_world_glb.mjs', 'package-lock.json'].map(path => {
    const bytes = readFileSync(resolve(ROOT, path));
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
}

async function main() {
  const args = process.argv.slice(2), mode = args.shift();
  assert(['--write', '--verify'].includes(mode), 'Use --write (new outputs only) or --verify (read-only)');
  let outputDirectory = resolve(ROOT, 'release');
  if (args.length) {
    assert.equal(args.length, 2, 'Optional argument: --output-directory ABSOLUTE_PATH');
    assert.equal(args[0], '--output-directory');
    outputDirectory = resolve(args[1]);
  }
  const target = resolve(outputDirectory, GLB_NAME), receipt = resolve(outputDirectory, MANIFEST_NAME);
  if (mode === '--write') {
    assert(!existsSync(target) && !existsSync(receipt), 'Existing output refused; choose a new --output-directory');
  } else {
    assert(existsSync(target) && existsSync(receipt), 'GLB and manifest must both exist for --verify');
  }
  if (typeof globalThis.FileReader === 'undefined') globalThis.FileReader = NodeFileReader;
  const area = getAreaDefinition(CONFIG.areaId);
  const loader = new AreaLoader(area, CONFIG.quality);
  const started = performance.now();
  try {
    loader.update(CONFIG.focus.x, CONFIG.focus.z);
    // Non-glTF sky/fog and hemisphere illumination stay as metadata, not fake assets.
    loader.scene.traverse(object => { if (object.isLight || object.isCamera) object.visible = false; });
    sourceMeshes(loader.scene);
    const sourceStats = loader.stats(), sceneStats = meshTotals(loader.scene), sources = inputRecords();
    let bytes;
    if (mode === '--verify') {
      const previous = JSON.parse(readFileSync(receipt, 'utf8'));
      assert.equal(previous.schema, SCHEMA);
      assert.deepEqual(previous.configuration, CONFIG);
      assert.deepEqual(previous.sourceFiles, sources, 'Source files changed since the GLB was generated');
      bytes = readFileSync(target);
      assert.equal(hash(bytes), previous.output.sha256, 'GLB/manifest SHA-256 differs');
      assert.equal(bytes.length, previous.output.bytes);
    } else {
      const exported = await new GLTFExporter().parseAsync(loader.scene, { binary: true, onlyVisible: true });
      bytes = Buffer.from(exported);
    }
    const verification = await verifyRoundTrip(bytes, loader.scene);
    const manifest = { schema: SCHEMA, generator: 'Original AreaLoader + installed Three GLTFExporter',
      configuration: CONFIG, nodeVersion: process.version, threeRevision: T.REVISION, coordinates: 'Y-up metres, unchanged runtime coordinates',
      sourceFiles: sources, areaVersion: area.version, seed: area.seed, sourceStats, sceneStats,
      sourceOwnership: 'Original procedural RECLAIM geometry; no Fab/third-party art, textures, photographs, or network calls',
      thirdPartyArt: false, textures: [], externalAssetDependencies: [],
      installedCodeDependency: { name: 'three', version: '0.185.1', license: 'MIT', newInstallRequired: false },
      output: { name: GLB_NAME, bytes: bytes.length, sha256: hash(bytes) }, verification,
      wallTimeMilliseconds: Number((performance.now() - started).toFixed(3)),
      scope: { staticSnapshotOnly: true, activeChunks: sourceStats.activeChunks, focus: CONFIG.focus,
        fullWorldBaked: false, gameControlsOrCombatEmbedded: false, blenderBlendFileGenerated: false,
        renderEnvironment: { skyColor: area.climate.skyColor, fogColor: area.climate.fogColor, fogNear: area.climate.fogNear, fogFar: area.climate.fogFar },
        notes: ['Only the current Balanced chunk window is baked, including the cabin, lake and introductory main trail.',
          'EXT_mesh_gpu_instancing is required; instance transforms/colours survived the actual installed Three parser.',
          'Three Lambert materials map to glTF PBR; sky/fog/hemisphere lighting are metadata. A GLB visual need not match the game pixel-for-pixel.',
          'Blender 5.2.2 import/render and browser visual round-trip remain UNVERIFIED. No .blend file is claimed.'] } };
    if (mode === '--write') {
      mkdirSync(outputDirectory, { recursive: true });
      let createdTarget = false;
      try {
        writeFileSync(target, bytes, { flag: 'wx' }); createdTarget = true;
        writeFileSync(receipt, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
      } catch (error) {
        if (createdTarget) unlinkSync(target);
        throw error;
      }
    }
    process.stdout.write(JSON.stringify({ mode, glb: target, manifest: receipt, bytes: bytes.length, sha256: hash(bytes),
      sourceStats, verification }, null, 2) + '\n');
  } finally { loader.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
