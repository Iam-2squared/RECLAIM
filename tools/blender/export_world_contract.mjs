// Optional authoring snapshot, generated only from this repository's area data.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAreaDefinition } from '../../src/world/areas.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'tools/blender/shiretoko_contract.json');
const schema = 'reclaim.blender-world-contract.v1';
const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--write'].includes(args[0])) {
  throw new Error('Use exactly one mode: --check (read-only) or --write (explicit snapshot update)');
}
const sourceFiles = ['src/world/areas.ts', 'src/world/terrain.ts', 'src/world/random.ts'].map(path => ({
  path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
const contract = {
  schema, area: getAreaDefinition('shiretoko'), sourceFiles,
  coordinates: { runtime: 'Y-up metres', blender: 'Z-up metres', runtimeToBlender: '[x,-z,y]', glbExport: 'standard Y-up [x,z,-y]; round trip preserves runtime coordinates' },
  collision: { cellSize: 2, diagonal: 'b-c', source: 'src/world/terrain.ts' },
  authoringOnly: true, note: 'The game keeps its procedural terrain. This snapshot does not replace runtime collision data.',
};
const generatedBytes = Buffer.from(JSON.stringify(contract, null, 2) + '\n', 'utf8');
if (args[0] === '--check') {
  if (!existsSync(output)) throw new Error('Missing world contract snapshot; review and run --write to create it');
  if (!readFileSync(output).equals(generatedBytes)) {
    throw new Error('Stale world contract snapshot/source hashes; review and run --write to regenerate it');
  }
  process.stdout.write('PASS: world contract bytes and source hashes match current repository definitions.\n');
} else {
  if (existsSync(output)) {
    const current = JSON.parse(readFileSync(output, 'utf8'));
    if (current.schema !== schema) throw new Error('Refusing to replace an unowned contract file');
  }
  writeFileSync(output, generatedBytes, { flag: existsSync(output) ? 'w' : 'wx' });
  process.stdout.write('Generated tools/blender/shiretoko_contract.json from current repository definitions.\n');
}
