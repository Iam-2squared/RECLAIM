import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const BOSS_MODEL_IDS = Object.freeze(['boar', 'owl']);
export const BOSS_CLIPS = Object.freeze(['Idle', 'Walk', 'Chase', 'Attack', 'Hit', 'Death']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** EXT meshopt has a virtual fallback buffer; only its compressed bytes live in BIN. */
export function validateBossGlb(bytes, id = 'boss') {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw Error(`Invalid boss GLB: ${id}`);
  const jsonSize = bytes.readUInt32LE(12), binHeader = 20 + jsonSize;
  if (jsonSize % 4 || binHeader + 8 > bytes.length || bytes.readUInt32LE(binHeader + 4) !== 0x004e4942 || bytes.readUInt32LE(binHeader) + binHeader + 8 !== bytes.length) throw Error(`Invalid boss GLB chunks: ${id}`);
  const gltf = JSON.parse(bytes.subarray(20, binHeader).toString('utf8'));
  if (gltf.asset?.version !== '2.0' || !gltf.meshes?.length || !gltf.skins?.length || !gltf.extensionsRequired?.includes('EXT_meshopt_compression')) throw Error(`Boss lacks animated geometry: ${id}`);
  if ([...(gltf.buffers ?? []), ...(gltf.images ?? [])].some(asset => asset.uri)) throw Error(`Boss requires an external asset: ${id}`);
  const binarySize = bytes.readUInt32LE(binHeader);
  if (!gltf.buffers?.[0] || gltf.buffers[0].byteLength > binarySize || gltf.buffers.slice(1).some(buffer => !buffer.extensions?.EXT_meshopt_compression?.fallback)) throw Error(`Boss buffer exceeds embedded BIN: ${id}`);
  for (const view of gltf.bufferViews ?? []) {
    const buffer = gltf.buffers[view.buffer ?? 0];
    if (!buffer || !Number.isInteger(view.byteLength) || view.byteLength < 0 || (view.byteOffset ?? 0) < 0 || (view.byteOffset ?? 0) + view.byteLength > buffer.byteLength) throw Error(`Invalid boss buffer view: ${id}`);
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (compressed && (compressed.buffer !== 0 || !Number.isInteger(compressed.byteOffset) || !Number.isInteger(compressed.byteLength) || compressed.byteOffset < 0 || compressed.byteLength < 0 || compressed.byteOffset + compressed.byteLength > gltf.buffers[0].byteLength)) throw Error(`Invalid compressed boss view: ${id}`);
  }
  if (!BOSS_CLIPS.every(name => gltf.animations?.some(clip => clip.name === name && clip.channels?.length))) throw Error(`Boss animation clips are incomplete: ${id}`);
  return gltf;
}

/** Copy only validated motion exports, without changing the authored originals. */
export async function syncBossAssets(workspace, publicDirectory) {
  const directory = resolve(publicDirectory, 'mission-bosses');
  await mkdir(directory, { recursive: true });
  const models = [];
  for (const [id, name] of [['boar', '錆猪'], ['owl', '哨戒梟']]) {
    const sourceDirectory = resolve(workspace, 'motion/characters', name), meta = JSON.parse(await readFile(resolve(sourceDirectory, 'animation.json'), 'utf8'));
    const record = meta.files.find(file => file.path.endsWith('_animated.glb'));
    if (meta.asset_id !== id || !record || record.path !== `${name}_animated.glb`) throw Error(`Invalid boss source metadata: ${id}`);
    const source = resolve(sourceDirectory, record.path), bytes = await readFile(source);
    if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) throw Error(`Boss source hash differs from metadata: ${id}`);
    validateBossGlb(bytes, id);
    await copyFile(source, resolve(directory, `${id}.glb`));
    models.push({ id, name, file: `${id}.glb`, bytes: bytes.length, sha256: record.sha256, clips: [...BOSS_CLIPS], source: `motion/characters/${name}/${record.path}`, front: '+Z', units: 'metres' });
  }
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({ version: 1, models }, null, 2) + '\n');
  return models;
}

export async function collectBossAssets(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'mission-bosses/manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.models) || manifest.models.length !== BOSS_MODEL_IDS.length || new Set(manifest.models.map(model => model.id)).size !== BOSS_MODEL_IDS.length || manifest.models.some(model => !BOSS_MODEL_IDS.includes(model.id))) throw Error('Incomplete boss manifest');
  const payload = {}, records = [];
  for (const id of BOSS_MODEL_IDS) {
    const model = manifest.models.find(model => model.id === id);
    if (model.file !== `${id}.glb`) throw Error(`Unexpected boss asset filename: ${id}`);
    const bytes = await readFile(resolve(directory, 'mission-bosses', model.file));
    if (bytes.length !== model.bytes || sha(bytes) !== model.sha256) throw Error(`Boss asset hash differs from manifest: ${id}`);
    validateBossGlb(bytes, id);
    payload[id] = bytes.toString('base64');
    records.push({ id, file: model.file, bytes: model.bytes, sha256: model.sha256, clips: [...BOSS_CLIPS] });
  }
  return { payload, records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  console.log(JSON.stringify(await syncBossAssets(resolve(root, '..'), resolve(root, 'public')), null, 2));
}
