import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeName, parseHome, chooseGun, GUNS, MELEE, ROUTE, RARITIES } from '../src/home-state.ts';

test('home data is versioned, whitelisted and cannot confer progress or a connected party', () => {
  for (const raw of [null, 'bad', 'null', '42', '[]', '{"version":2}']) assert.deepEqual(parseHome(raw), defaults());
  const parsed = parseHome('{"version":1,"appearance":{"name":" 北の生存者 ","palette":"slate"},"primary":"rifle","secondary":"rifle","held":"secondary","screen":"combat","party":4,"xp":99999}');
  assert.equal(parsed.appearance.name, '北の生存者'); assert.equal(parsed.appearance.palette, 'slate');
  assert.equal(parsed.primary, 'assault'); assert.equal(parsed.secondary, 'sniper');
  assert.equal(parsed.held, 'secondary');
  assert.deepEqual(Object.keys(parsed).sort(), ['appearance', 'held', 'primary', 'secondary', 'version']);
});

test('the selectable firearms are assault and sniper, with a separate survival knife', () => {
  assert.deepEqual(GUNS.map(gun => gun.id), ['assault', 'sniper']);
  assert.equal(MELEE.id, 'knife');
  assert.equal(MELEE.name, 'サバイバルナイフ');
  assert.equal(GUNS.some(gun => gun.id === 'rifle' || gun.id === 'knife'), false);
});

test('legacy rifle saves migrate to distinct current firearms while keeping appearance and the held slot', () => {
  for (const [primary, secondary, expectedPrimary, expectedSecondary] of [
    ['rifle', 'sniper', 'assault', 'sniper'],
    ['rifle', 'assault', 'sniper', 'assault'],
    ['sniper', 'rifle', 'sniper', 'assault'],
    ['assault', 'rifle', 'assault', 'sniper'],
    ['rifle', 'rifle', 'assault', 'sniper'],
  ]) {
    for (const held of ['primary', 'secondary']) {
      const raw = { version: 1, appearance: { name: '旧装備の生存者', palette: 'clay' }, primary, secondary, held };
      const migrated = parseHome(JSON.stringify(raw));
      assert.deepEqual(migrated.appearance, raw.appearance);
      assert.equal(migrated.primary, expectedPrimary);
      assert.equal(migrated.secondary, expectedSecondary);
      assert.equal(migrated.held, held);
      assert.deepEqual(parseHome(JSON.stringify(migrated)), migrated);
    }
  }
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

test('removed rifles and the dedicated knife cannot enter either firearm slot through selection', () => {
  const initial = defaults();
  for (const id of ['rifle', 'knife', 'unknown']) {
    for (const slot of ['primary', 'secondary']) {
      const changed = chooseGun(initial, slot, id);
      assert.strictEqual(changed, initial);
      assert.deepEqual([changed.primary, changed.secondary].sort(), ['assault', 'sniper']);
      assert.deepEqual(initial, defaults());
    }
  }
  const invalidSave = { ...initial, primary: 'knife', secondary: 'knife' };
  assert.deepEqual(parseHome(JSON.stringify(invalidSave)), initial);
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
