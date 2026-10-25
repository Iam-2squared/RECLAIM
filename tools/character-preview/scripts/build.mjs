import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
await fs.mkdir(dist, { recursive: true });
// Keep this standalone tool independent of the parent game's TypeScript settings.
const output = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: ['es2022'], tsconfigRaw: { compilerOptions: { alwaysStrict: false } }, write: false, outdir: 'bundle' });
const js = output.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = output.outputFiles.find(f => f.path.endsWith('.css')).text;
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const license = await fs.readFile(path.join(root, 'node_modules/three/LICENSE'), 'utf8');
html = html.replace('<!doctype html>', () => `<!doctype html>\n<!--\nThree.js license\n${license.replaceAll('--', '—')}\n-->`);
html = html.replace('</head>', () => `<style>${css}</style></head>`).replace('<script type="module" src="./src/main.js"></script>', () => `<script>${js.replaceAll('</script', '<\\/script')}</script>`);
await fs.writeFile(path.join(dist, 'index.html'), html);
const embedded = {};
for (const gender of ['male', 'female']) {
  const file = path.join(root, `assets/${gender}/${gender}-game.glb`);
  const bytes = await fs.readFile(file);
  embedded[gender] = bytes.toString('base64');
  await fs.mkdir(path.join(dist, `assets/${gender}`), { recursive: true });
  await fs.copyFile(file, path.join(dist, `assets/${gender}/${gender}.glb`));
}
const standalone = html.replace('<script>', () => `<script>window.RECLAIM_EMBEDDED_MODELS=${JSON.stringify(embedded)};</script><script>`);
await fs.writeFile(path.join(dist, 'RECLAIM_Character_Studio.html'), standalone);
console.log(JSON.stringify({ dist, standaloneBytes: Buffer.byteLength(standalone), assets: Object.keys(embedded) }));
