import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JAPAN_PREFECTURES, JAPAN_REGIONS, catalogCoverage } from '../src/world/japan-catalog.ts';

// The public page is a snapshot of the same authoritative catalog, not an
// invented second list of completed environments or unlocked mission areas.
const html = await readFile(new URL('../public/reviews/japan-catalog.html', import.meta.url), 'utf8');
const serialized = html.match(/<script type="application\/json" id="prefecture-data">([\s\S]*?)<\/script>/);
assert(serialized, 'public atlas must contain machine-readable, offline metadata');
const records = JSON.parse(serialized[1]);

test('national atlas lists the exact existing JIS-order 47 prefectures in nine regions', () => {
  const source = JAPAN_PREFECTURES.map(p => ({
    code:p.code, nameJa:p.nameJa, region:p.region,
    stage:p.stage, prototypeAreaIds:[...p.prototypeAreaIds],
  }));
  assert.deepEqual(records, source, 'the public review must mirror the source catalog');
  assert.equal(records.length, 47);
  assert.equal(new Set(records.map(p => p.code)).size, 47);
  assert.deepEqual(new Set(records.map(p => p.region)), new Set(JAPAN_REGIONS));
  assert.equal(records[0].nameJa, '北海道');
  assert.equal(records.at(-1).nameJa, '沖縄県');
});

test('catalogue-only coverage does not masquerade as explorable terrain', () => {
  assert.deepEqual(catalogCoverage(), {
    catalogued:47, withLocalPrototype:1,
    terrainPrototypes:0, explorable:0, polished:0,
  });
  assert(records.every(p => p.stage === 'catalog-only'));
  assert(records.slice(1).every(p => p.prototypeAreaIds.length === 0));
  assert.equal(records[0].prototypeAreaIds.length, 4);
  assert.match(html, /県全域ではありません/);
});

test('standalone review never writes game progress or imports remote scripts', () => {
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<main class="wrap">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie|indexedDB|XMLHttpRequest|\bfetch\s*\(/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet[^>]+href=/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /grid\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(html, /innerHTML\s*=/);
});
