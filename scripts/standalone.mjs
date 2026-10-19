/**
 * Preserve the approved self-contained TITLE/HOME preview after adding a
 * second, optional Shiretoko Vite page. A multi-page Vite build may emit shared
 * JS chunks; inlining only the entry chunk breaks file:// previews. Generate a
 * separate single-entry bundle in a private temporary directory instead.
 * The published dist/ build (including /shiretoko-terrain.html) is untouched.
 */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const tempDir = await mkdtemp(join(tmpdir(), 'reclaim-standalone-'));
try {
  // Disable the repository's multi-page config ONLY for the standalone build.
  // Keep its approved transpilation targets and relative asset base.
  await build({
    configFile: false,
    root,
    base: './',
    build: {
      outDir: tempDir,
      emptyOutDir: true,
      target: ['es2022', 'safari15.4'],
      chunkSizeWarningLimit: 800,
      rollupOptions: { input: resolve(root, 'index.html') },
    },
  });
  let html = await readFile(resolve(tempDir, 'index.html'), 'utf8');
  const script = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
  const css = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
  if (!script || !css) throw new Error('Unexpected standalone Vite output: missing entry JS/CSS');
  const js = await readFile(resolve(tempDir, script[1]), 'utf8');
  const styles = await readFile(resolve(tempDir, css[1]), 'utf8');
  // A standalone preview must not depend on a separate JS module, stylesheet,
  // CDN, or HTTP server. The full browser interaction gate checks file://.
  if (/\bimport\s*(?:\(|["'{*])|\bexport\s+(?:\{|\*|default)/.test(js)) {
    throw new Error('Standalone JS still contains module imports or exports');
  }
  html = html.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
             .replace(css[0], () => `<style>${styles}</style>`);
  const license = await readFile(resolve(root, 'node_modules/three/LICENSE'), 'utf8');
  const sourceCommit = process.env.RECLAIM_BUILD_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const workingTree = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() ? 'dirty' : 'clean';
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Expected a full source commit SHA');
  html = html.replace('</head>', () => `<meta name="reclaim-source-commit" content="${sourceCommit}">\n<meta name="reclaim-working-tree" content="${workingTree}">\n<!-- Three.js MIT license\n${license.replaceAll('--', '—')}-->\n</head>`);
  await mkdir(resolve(root, 'release'), { recursive: true });
  for (const filename of ['RECLAIM_World_Preview.html','RECLAIM_PC_Menu_Preview.html','RECLAIM_Title_Preview.html','RECLAIM_Home_Preview.html','RECLAIM_Home_V2_Preview.html']) {
    await writeFile(resolve(root, 'release', filename), html);
  }
  console.log(`Standalone world: release/RECLAIM_World_Preview.html (source ${sourceCommit}; compatible aliases retained; no runtime CDN or API)`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
