/**
 * Append Shiretoko's opt-in 3D review to the normal production build without
 * touching the approved TITLE/HOME page or any existing dist asset.
 * Build in private staging, preflight every output, then expose HTML last.
 */
import { readFile, readdir, mkdir, mkdtemp, copyFile, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REVIEW = 'shiretoko-terrain.html';

export function reviewBuildOptions(root, outputDirectory) {
  return {
    configFile: false,
    publicDir: false,
    root,
    base: './',
    build: {
      outDir: outputDirectory,
      emptyOutDir: true,
      target: ['es2022', 'safari15.4'],
      chunkSizeWarningLimit: 800,
      rollupOptions: { input: { 'shiretoko-terrain': resolve(root, REVIEW) } },
    },
  };
}

async function scanFiles(top, prefix = '', list = []) {
  const entries = await readdir(resolve(top, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const rel = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw Error('Review output contains symlink: ' + rel);
    if (entry.isDirectory()) await scanFiles(top, rel, list);
    else if (entry.isFile()) list.push(rel);
    else throw Error('Unsupported review output entry: ' + rel);
  }
  return list;
}

/** Never publish the entry page while an asset might still be missing. */
export async function appendShiretokoReview({ root = ROOT, build, stageParent = tmpdir() } = {}) {
  if (typeof build !== 'function') throw TypeError('Expected a Vite build function');
  const dist = resolve(root, 'dist');
  await stat(resolve(dist, 'index.html'));
  const staging = await mkdtemp(join(stageParent, 'reclaim-shiretoko-review-'));
  try {
    await build(reviewBuildOptions(root, staging));
    const files = await scanFiles(staging);
    if (!files.includes(REVIEW)) throw Error('Vite did not emit Shiretoko review page');
    const html = await readFile(resolve(staging, REVIEW), 'utf8');
    if (!/<!doctype html>|<html[\s>]/i.test(html) || !/shiretoko/i.test(html)) {
      throw Error('Invalid Shiretoko review HTML');
    }
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const src = match[1];
      if (/^(?:https?:|\/\/|javascript:|data:)/i.test(src)) {
        throw Error('External runtime review asset rejected: ' + src);
      }
      const plain = src.split(/[?#]/)[0];
      if (!plain || plain.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(plain)) {
        throw Error('Unsafe review asset path: ' + src);
      }
      const local = plain.replace(/^\.\//, '');
      // HTML uses URL separators; scanFiles uses native filesystem separators.
      if (files.includes(local.split('/').join(sep))) continue;
      try { await stat(resolve(dist, local)); }
      catch (error) {
        if (error?.code === 'ENOENT') throw Error('Missing review asset: ' + src);
        throw error;
      }
    }
    if (files.some(f => f.toLowerCase().endsWith('.html') && f !== REVIEW)) {
      throw Error('Unexpected additional HTML in independent Shiretoko bundle');
    }
    const toCopy = [];
    for (const rel of files) {
      const target = resolve(dist, rel);
      if (!target.startsWith(dist + sep)) throw Error('Output escaped dist: ' + rel);
      let existing;
      try { existing = await readFile(target); }
      catch (error) {
        if (error?.code === 'ENOENT') { toCopy.push(rel); continue; }
        throw error;
      }
      const proposed = await readFile(resolve(staging, rel));
      if (!existing.equals(proposed)) throw Error('Review asset collides with existing dist file: ' + rel);
    }
    await stat(resolve(dist, 'index.html'));
    const ordered = [...toCopy.filter(f => f !== REVIEW), ...toCopy.filter(f => f === REVIEW)];
    for (const rel of ordered) {
      const destination = resolve(dist, rel);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(staging, rel), destination, constants.COPYFILE_EXCL);
    }
    return Object.freeze({ review: REVIEW, created: toCopy.length, reused: files.length - toCopy.length });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { build } = await import('vite');
  const result = await appendShiretokoReview({ build });
  console.log('Shiretoko independent review appended: dist/' + result.review);
}
