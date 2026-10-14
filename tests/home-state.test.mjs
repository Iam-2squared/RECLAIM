import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeName, parseHome, chooseGun, ROUTE, RARITIES } from '../src/home-state.ts';

test('home data is versioned, whitelisted and cannot confer progress or a connected party', () => {
  for (const raw of [null, 'bad', 'null', '42', '[]', '{"version":2}']) assert.deepEqual(parseHome(raw), defaults());
  const parsed = parseHome('{"version":1,"appearance":{"name":" 北の生存者 ","palette":"slate"},"primary":"rifle","secondary":"rifle","held":"secondary","screen":"combat","party":4,"xp":99999}');
  assert.equal(parsed.appearance.name, '北の生存者'); assert.equal(parsed.appearance.palette, 'slate');
  assert.equal(parsed.primary, 'rifle'); assert.notEqual(parsed.secondary, 'rifle');
  assert.deepEqual(Object.keys(parsed).sort(), ['appearance', 'held', 'primary', 'secondary', 'version']);
});
test('names preserve Japanese and Unicode, enforce a codepoint limit, and default when blank', () => {
  assert.equal(normalizeName('  知床の生存者  '), '知床の生存者');
  assert.equal(normalizeName('\n\t'), 'SURVIVOR');
  assert.equal(normalizeName('A\u0000B'), 'AB');
  assert.equal(Array.from(normalizeName('🦊'.repeat(30))).length, 16);
  assert.equal(normalizeName('<b>北</b>'), '<b>北</b>'); // Display must use textContent, not HTML.
});
test('gun selection swaps a duplicate consistently in either direction without mutating its input', () => {
  const initial = defaults();
  const changed = chooseGun(initial, 'primary', 'sniper');
  assert.equal(changed.primary, 'sniper'); assert.equal(changed.secondary, 'assault');
  assert.deepEqual(initial, defaults());
  const reverse = chooseGun(changed, 'secondary', 'sniper');
  assert.equal(reverse.primary, 'assault'); assert.equal(reverse.secondary, 'sniper');
});
test('local appearance and a held secondary round-trip, including hostile input types', () => {
  const initial = defaults(); initial.appearance.palette = 'clay'; initial.held = 'secondary';
  assert.deepEqual(parseHome(JSON.stringify(initial)), initial);
  assert.deepEqual(parseHome('{"version":1,"appearance":{"name":42,"palette":"god"},"primary":[],"secondary":{},"held":false}'), defaults());
});
test('campaign starts at Shiretoko, distinguishes two Tokyo visits, and keeps the specified rarity spelling', () => {
  assert.equal(ROUTE[0][0], 'shiretoko'); assert.equal(ROUTE.length, 18);
  assert.equal(ROUTE.filter(r => r[0].startsWith('tokyo')).length, 2);
  assert.equal(RARITIES.length, 6); assert.equal(RARITIES.at(-1), 'ディビィアン');
});
