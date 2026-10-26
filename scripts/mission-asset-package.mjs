import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const MISSION_MODEL_IDS = Object.freeze(['jonesy', 'ramirez', 'humanoid-lv1', 'drone-lv1', 'humanoid-lv5', 'drone-lv5']);
export const MISSION_WEAPON_IDS = Object.freeze(['assault', 'sniper', 'knife']);
const MODEL_CLIPS = Object.freeze({
  player: ['Idle','Walk','Run','Jump','Aim','Shoot','Reload','Hit','Death','Melee'],
  humanoid: ['Idle','Walk','Run','Attack','Hit','Death'],
  drone: ['Hover','Patrol','Chase','Ram','Hit','Death'],
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Verify binary structure and that no sidecar texture/buffer can escape file://. */
export function validateEmbeddedGlb(bytes, id = 'model') {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw new Error(`Invalid mission GLB header: ${id}`);
  let cursor = 12, document = null, binarySize = 0, jsonChunks = 0, binaryChunks = 0;
  while (cursor < bytes.length) {
    if (cursor + 8 > bytes.length) throw new Error(`Truncated mission GLB chunk: ${id}`);
    const size = bytes.readUInt32LE(cursor), kind = bytes.readUInt32LE(cursor + 4);
    cursor += 8;
    if (size % 4 || cursor + size > bytes.length) throw new Error(`Invalid mission GLB chunk size: ${id}`);
    if (kind === 0x4e4f534a) {
      if (cursor !== 20) throw new Error(`Mission GLB JSON must be its first chunk: ${id}`);
      document = JSON.parse(bytes.subarray(cursor, cursor + size).toString('utf8'));
      jsonChunks++;
    } else if (kind === 0x004e4942) { binarySize += size; binaryChunks++; }
    cursor += size;
  }
  if (!document || jsonChunks !== 1 || binaryChunks !== 1 || document.asset?.version !== '2.0' || !document.meshes?.length)
    throw new Error(`Mission GLB lacks geometry or binary data: ${id}`);
  const assets = [...(document.buffers ?? []), ...(document.images ?? [])];
  if (assets.some(asset => asset.uri && !asset.uri.startsWith('data:')))
    throw new Error(`Mission GLB requires an external asset: ${id}`);
  const binaryBuffers = (document.buffers ?? []).filter(buffer => !buffer.uri);
  if (binaryBuffers.length !== 1 || !Number.isInteger(binaryBuffers[0].byteLength) || binaryBuffers[0].byteLength < 0 || binaryBuffers[0].byteLength > binarySize)
    throw new Error(`Mission GLB buffer exceeds its binary chunk: ${id}`);
  for (const view of document.bufferViews ?? []) {
    const buffer = document.buffers?.[view.buffer ?? 0];
    if (!buffer || !Number.isInteger(view.byteLength) || view.byteLength < 0 || (view.byteOffset ?? 0) < 0 ||
        (view.byteOffset ?? 0) + view.byteLength > buffer.byteLength)
      throw new Error(`Mission GLB has an invalid buffer view: ${id}`);
  }
  for (const image of document.images ?? []) {
    if (!image.uri && !document.bufferViews?.[image.bufferView]) throw new Error(`Mission GLB image has no embedded data: ${id}`);
  }
  return document;
}

/** Called only by standalone packaging, never by the normal Vite browser bundle. */
export async function collectMissionAssets(directory, {includeDevModels=true}={}) {
  const payload = { models: {}, weapons: {} }, records = { models: [], weapons: [] };
  for (const [section, folder, ids] of [['models','mission-models',MISSION_MODEL_IDS], ['weapons','mission-weapons',MISSION_WEAPON_IDS]]) {
    const manifest = JSON.parse(await readFile(resolve(directory, folder, 'manifest.json'), 'utf8'));
    const entries = manifest[section];
    if (!Array.isArray(entries) || entries.length !== ids.length || new Set(entries.map(entry => entry.id)).size !== ids.length ||
        entries.some(entry => !ids.includes(entry.id))) throw new Error(`Incomplete mission asset manifest: ${folder}`);
    for (const id of ids) {
      // Lv5 is selectable only by the Vite development fixture, not the game.
      if(section==='models'&&!includeDevModels&&id.endsWith('-lv5'))continue;
      const entry = entries.find(item => item.id === id);
      if (entry.file !== `${id}.glb`) throw new Error(`Unexpected mission asset filename: ${id}`);
      const bytes = await readFile(resolve(directory, folder, entry.file));
      const digest = sha(bytes);
      if (entry.sha256 !== digest || entry.bytes !== bytes.length) throw new Error(`Mission asset hash differs from manifest: ${id}`);
      const gltf = validateEmbeddedGlb(bytes, id);
      if (section === 'models') {
        const required = MODEL_CLIPS[id.startsWith('drone') ? 'drone' : id.startsWith('humanoid') ? 'humanoid' : 'player'];
        const clips = (gltf.animations ?? []).map(clip => clip.name);
        if (!required.every(name => clips.includes(name)) || !Array.isArray(entry.clips) || !required.every(name => entry.clips.includes(name)))
          throw new Error(`Mission animation clips are incomplete: ${id}`);
      }
      payload[section][id] = bytes.toString('base64');
      records[section].push({ id, file: entry.file, bytes: bytes.length, sha256: digest, ...(section === 'models' ? { clips: entry.clips } : {}) });
    }
  }
  return { payload, records };
}
