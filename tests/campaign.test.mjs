import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_KEY, CAMPAIGN_RULES, CampaignStore, OPENING, campaignDefaults,
  isAreaUnlocked, parseCampaign, unlockedAreaIds, visibleAreas, visibleRoute,
} from '../src/campaign/index.ts';
import { ROUTE, HOME_KEY } from '../src/home-state.ts';

const p = (x = 0, z = -1.5, y = 0) => ({ x, y, z });
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return { data, writes, getItem: key => data.get(key) ?? null, setItem: (key, value) => { writes.push(key); data.set(key, value); } };
}
function position(store, areaId, pos, grounded = true) { return store.record({ type: 'position', areaId, position: pos, grounded }); }
function opening(store, step, pos = p(), skipped = false) {
  return store.record({ type: 'opening', step, areaId: 'shiretoko', position: pos, grounded: true, skipped });
}
function beginShiretoko(store) {
  assert.equal(position(store, 'shiretoko', p()), true);
  assert.equal(opening(store, 'wake'), true);
  assert.equal(opening(store, 'radio', p(-3, -3)), true);
  assert.equal(opening(store, 'friend-contact', p(-3, -3)), true);
  assert.equal(position(store, 'shiretoko', p(0, 6)), true);
  assert.equal(opening(store, 'leave-cabin', p(0, 6)), true);
}
function defeatDrone(store) { return store.record({ type: 'drone-defeated', areaId: 'shiretoko', enemyId: 'shiretoko-scout-01', remainingHp: 0, hitCount: 3 }); }
function walkTo(store, areaId, target) {
  const start = store.value.traversal.lastPosition;
  const count = Math.max(1, Math.ceil(Math.hypot(target.x - start.x, target.z - start.z) / 4));
  for (let i = 1; i <= count; i++) assert.equal(position(store, areaId, p(start.x + (target.x - start.x) * i / count, start.z + (target.z - start.z) * i / count, target.y ?? 0)), true);
}
function walkRoute(store, areaId) {
  const rule = CAMPAIGN_RULES[areaId];
  if (store.value.traversal?.areaId !== areaId) assert.equal(position(store, areaId, p(rule.spawn.x, rule.spawn.z)), true);
  for (const landmark of rule.checkpoints) walkTo(store, areaId, landmark);
  walkTo(store, areaId, rule.exit);
}
function exit(store, areaId) {
  const rule = CAMPAIGN_RULES[areaId];
  return store.record({ type: 'area-exit', areaId, position: p(rule.exit.x, rule.exit.z), grounded: true });
}
function reachSapporo(store) {
  beginShiretoko(store); assert.equal(defeatDrone(store), true);
  for (const areaId of ['shiretoko', 'ishikari-mountains', 'hidaka-mountains']) {
    walkRoute(store, areaId); assert.equal(exit(store, areaId), true);
  }
}

test('campaign initial normal UI exposes only Shiretoko and no future place or Tokyo plot labels', () => {
  const initial = campaignDefaults(), route = visibleRoute(initial);
  assert.equal(route.length, 18);
  assert.equal(route[0].name, '知床');
  for (const row of route.slice(1)) { assert.equal(row.name, '???'); assert.equal(row.description, '???'); assert.equal(row.revealed, false); }
  const exposed = JSON.stringify([route, visibleAreas(initial)]);
  for (const hidden of ['札幌', '函館', '石狩', '日高', '撤退', '再突入', 'tokyo-first', 'tokyo-return', 'hakodate']) assert.equal(exposed.includes(hidden), false);
  assert.deepEqual(unlockedAreaIds(initial), ['shiretoko']);
});

test('campaign presentation preserves exactly the canonical 18 stops without inserting subareas', () => {
  assert.equal(ROUTE.length, 18);
  assert.deepEqual(visibleRoute(campaignDefaults()).map(r => [r.x, r.y]), ROUTE.map(r => [r[2], r[3]]));
  assert.deepEqual(OPENING.map(s => s.id), ['wake', 'radio', 'friend-contact', 'leave-cabin']);
  assert.equal(OPENING.every(s => s.provisional === true), true);
});

test('corrupt, unknown, legacy and hostile saves default safely and cannot read home-preview progress', () => {
  for (const raw of [null, '', 'invalid', 'null', '42', '[]', '{"version":0}', '{"version":2}', JSON.stringify({ version: 1, appearance: { name: 'survivor' } }), ' '.repeat(65537)]) assert.deepEqual(parseCampaign(raw), campaignDefaults());
  const home = memoryStorage({ [HOME_KEY]: JSON.stringify({ version: 1, completedAreaIds: ['shiretoko'], unlockedAreaIds: ['sapporo'] }) });
  assert.deepEqual(new CampaignStore(home).value, campaignDefaults());
});

test('injected unlock/completed arrays without genuine ordered receipts do not confer progress', () => {
  const parsed = parseCampaign(JSON.stringify({ version: 1, introStep: 4, droneDefeated: true, completedAreaIds: ['shiretoko', 'ishikari-mountains', 'hidaka-mountains', 'sapporo'], unlockedAreaIds: ['hakodate'], checkpoint: { areaId: 'sapporo', x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, traversal: { areaId: 'sapporo', distance: 900, lastPosition: p(), passedCheckpointIds: [] } }));
  assert.deepEqual(parsed.completedAreaIds, []);
  assert.deepEqual(unlockedAreaIds(parsed), ['shiretoko']);
  assert.equal(parsed.checkpoint, null); assert.equal(parsed.traversal, null);
});

test('campaign snapshots and their nested positions, receipts and arrays cannot be mutated', () => {
  const store = new CampaignStore();
  assert.throws(() => { store.value.introStep = 4; }, TypeError);
  assert.throws(() => { store.value.completedAreaIds.push('sapporo'); }, TypeError);
  position(store, 'shiretoko', p());
  assert.throws(() => { store.value.traversal.lastPosition.z = 500; }, TypeError);
  assert.throws(() => { store.value.traversal.passedCheckpointIds.push('trail-checkpoint'); }, TypeError);
});

test('normal opening is ordered and radio hearing requires actual proximity inside the cabin', () => {
  const store = new CampaignStore();
  assert.equal(opening(store, 'friend-contact'), false);
  assert.equal(opening(store, 'radio', p(-3, -3)), false);
  assert.equal(opening(store, 'wake', p(0, 10)), false);
  assert.equal(opening(store, 'wake'), true);
  assert.equal(opening(store, 'wake'), false);
  assert.equal(opening(store, 'radio'), false);
  assert.equal(opening(store, 'radio', p(-3, -3)), true);
  assert.equal(opening(store, 'friend-contact', p(0, 8)), false);
  assert.equal(opening(store, 'friend-contact', p(-3, -3)), true);
  assert.equal(opening(store, 'leave-cabin', p()), false);
  assert.equal(store.value.introStep, 3);
});

test('explicit skip advances only three indoors opening steps and cannot fabricate leaving', () => {
  const store = new CampaignStore();
  assert.equal(position(store, 'shiretoko', p()), true);
  for (const step of ['wake', 'radio', 'friend-contact']) assert.equal(opening(store, step, p(), true), true);
  assert.equal(opening(store, 'leave-cabin', p(), true), false);
  assert.equal(opening(store, 'leave-cabin', p(200, 200), true), false);
  assert.equal(position(store, 'shiretoko', p(0, 6)), true);
  assert.equal(opening(store, 'leave-cabin', p(0, 6), true), true);
  assert.equal(store.value.introStep, 4);
});

test('runtime event flags are strict booleans and malformed event shapes never unlock', () => {
  const store = new CampaignStore();
  assert.equal(store.record(null), false);
  assert.equal(store.record({ type: 'unlock', areaId: 'shiretoko' }), false);
  assert.equal(store.record({ type: 'opening', areaId: 'shiretoko', step: 'wake', position: p(), grounded: 'true' }), false);
  assert.equal(store.record({ type: 'position', areaId: 'shiretoko', position: null, grounded: true }), false);
  assert.equal(store.record({ type: 'position', areaId: 'shiretoko', position: p(), grounded: 'yes' }), false);
  assert.equal(opening(store, 'wake'), true);
  assert.equal(store.record({ type: 'opening', areaId: 'shiretoko', step: 'radio', position: p(), grounded: true, skipped: 'true' }), false);
});

test('movement cannot start at an arbitrary exit, jump across terrain or visit a locked region', () => {
  const store = new CampaignStore();
  assert.equal(position(store, 'shiretoko', p(4, 104)), false);
  assert.equal(position(store, 'ishikari-mountains', p(0, 0)), false);
  assert.equal(position(store, 'shiretoko', p()), true);
  assert.equal(position(store, 'shiretoko', p(0, 60)), false);
  assert.equal(position(store, 'shiretoko', p(241, -1.5)), false);
  assert.equal(position(store, 'shiretoko', p(NaN, 0)), false);
  assert.equal(position(store, 'shiretoko', p(0, 0, Infinity)), false);
  assert.equal(position(store, 'shiretoko', p(0, 0, 30)), false);
  assert.equal(store.value.traversal.distance, 0);
});

test('airborne movement updates bounded position but does not award grounded traversal checkpoints', () => {
  const store = new CampaignStore();
  position(store, 'shiretoko', p());
  assert.equal(position(store, 'shiretoko', p(0, 3), false), true);
  assert.equal(store.value.traversal.distance, 0);
  assert.deepEqual(store.value.traversal.passedCheckpointIds, []);
  assert.equal(position(store, 'shiretoko', p(0, 4)), true);
  assert.equal(store.value.traversal.distance, 1);
});

test('safe controller respawn restores movement sampling without earning teleport distance or a new POI', () => {
  const store = new CampaignStore(); beginShiretoko(store);
  walkTo(store, 'shiretoko', { x: 0, z: 40 });
  const distance = store.value.traversal.distance;
  assert.equal(position(store, 'shiretoko', p()), true);
  assert.equal(store.value.traversal.distance, distance);
  assert.deepEqual(store.value.traversal.passedCheckpointIds, []);
  assert.equal(position(store, 'shiretoko', p(0, 0)), true);
  assert.equal(store.value.traversal.distance, distance + 1.5);
});

test('checkpoint save needs a real sampled unlocked position and safely normalizes camera angles', () => {
  const store = new CampaignStore();
  const cp = { areaId: 'shiretoko', ...p(), yaw: Math.PI * 3, pitch: 1.5, hp: 82 };
  assert.equal(store.checkpoint(cp), false);
  position(store, 'shiretoko', p());
  assert.equal(store.checkpoint({ ...cp, z: 104 }), false);
  assert.equal(store.checkpoint({ ...cp, areaId: 'sapporo' }), false);
  assert.equal(store.checkpoint({ ...cp, x: Infinity }), false);
  assert.equal(store.checkpoint(cp), true);
  assert.ok(Math.abs(Math.abs(store.value.checkpoint.yaw) - Math.PI) < 1e-8);
  assert.equal(store.value.checkpoint.pitch, 1.45);
  assert.equal(store.value.checkpoint.hp, 82);
});

test('menus, unknown objectives and exit coordinates alone cannot complete Shiretoko', () => {
  const store = new CampaignStore();
  assert.equal(exit(store, 'shiretoko'), false);
  for (const event of ['map-open', 'next-area', 'clear', 'unlock-all']) assert.equal(store.record({ type: event, areaId: 'shiretoko' }), false);
  walkRoute(store, 'shiretoko');
  assert.equal(exit(store, 'shiretoko'), false);
  assert.deepEqual(unlockedAreaIds(store.value), ['shiretoko']);
});

test('drone defeat requires the real scout id, stopped HP, at least one hit and completed introduction', () => {
  const store = new CampaignStore();
  assert.equal(defeatDrone(store), false);
  beginShiretoko(store);
  const event = { type: 'drone-defeated', areaId: 'shiretoko', enemyId: 'shiretoko-scout-01', remainingHp: 0, hitCount: 1 };
  for (const changed of [{ enemyId: 'boss' }, { remainingHp: 1 }, { remainingHp: -1 }, { hitCount: 0 }, { hitCount: NaN }, { hitCount: 1.5 }]) assert.equal(store.record({ ...event, ...changed }), false);
  assert.equal(store.record(event), true);
  assert.equal(defeatDrone(store), false);
  assert.equal(store.value.droneDefeated, true);
});

test('genuine drone defeat still cannot skip the actual trail checkpoint on the way to the exit', () => {
  const store = new CampaignStore(); beginShiretoko(store); defeatDrone(store);
  walkTo(store, 'shiretoko', { x: -50, z: 40 });
  walkTo(store, 'shiretoko', { x: -50, z: 110 });
  walkTo(store, 'shiretoko', CAMPAIGN_RULES.shiretoko.exit);
  assert.equal(store.value.traversal.distance > 50, true);
  assert.deepEqual(store.value.traversal.passedCheckpointIds, []);
  assert.equal(exit(store, 'shiretoko'), false);
  walkTo(store, 'shiretoko', CAMPAIGN_RULES.shiretoko.checkpoints[0]);
  walkTo(store, 'shiretoko', CAMPAIGN_RULES.shiretoko.exit);
  assert.equal(exit(store, 'shiretoko'), true);
});

test('actual ordered passage reveals exactly one new subarea per exit and Sapporo after Hidaka only', () => {
  const store = new CampaignStore(); beginShiretoko(store); defeatDrone(store);
  for (const [index, id] of ['shiretoko', 'ishikari-mountains', 'hidaka-mountains'].entries()) {
    walkRoute(store, id); assert.equal(exit(store, id), true);
    assert.equal(store.value.completedAreaIds.length, index + 1);
    assert.equal(visibleAreas(store.value).length, index + 2);
    assert.equal(isAreaUnlocked(store.value, 'sapporo'), index === 2);
    assert.equal(visibleRoute(store.value)[1].name, index === 2 ? '札幌' : '???');
    assert.equal(exit(store, id), false);
  }
  assert.equal(visibleRoute(store.value).filter(r => r.revealed).length, 2);
  for (const r of visibleRoute(store.value).slice(2)) assert.equal(r.description, '???');
});

test('Sapporo playable prototype endpoint never invents a story clear or unlocks Hakodate', () => {
  const store = new CampaignStore(); reachSapporo(store);
  assert.equal(store.prototypeEndReached, false);
  walkRoute(store, 'sapporo');
  assert.equal(store.prototypeEndReached, true);
  assert.equal(exit(store, 'sapporo'), false);
  assert.deepEqual(store.value.completedAreaIds, ['shiretoko', 'ishikari-mountains', 'hidaka-mountains']);
  assert.equal(visibleRoute(store.value)[2].name, '???');
});

test('save reload restores real progression, opening, drone state and same-area safe checkpoint', () => {
  const storage = memoryStorage(), original = new CampaignStore(storage); reachSapporo(original);
  position(original, 'sapporo', p(0, 0)); walkTo(original, 'sapporo', { x: 0, z: 40 });
  assert.equal(original.checkpoint({ areaId: 'sapporo', ...p(0, 40), yaw: .4, pitch: -.2, hp: 76 }), true);
  const restored = new CampaignStore(storage);
  assert.deepEqual(restored.value, original.value);
  assert.equal(position(restored, 'sapporo', p(0, 40)), true);
  assert.equal(restored.value.traversal.distance, original.value.traversal.distance);
  assert.equal(restored.saveStatus, 'saved');
  assert.equal(storage.writes.every(key => key === CAMPAIGN_KEY), true);
});

test('fresh mission session resets same-area traversal/checkpoint and safely accepts spawn without clearing story', () => {
  const storage = memoryStorage(), store = new CampaignStore(storage); beginShiretoko(store); defeatDrone(store);
  walkTo(store, 'shiretoko', { x: 0, z: 40 });
  assert.equal(store.checkpoint({ areaId: 'shiretoko', ...p(0, 40), yaw: 0, pitch: 0 }), true);
  assert.equal(store.beginSession('shiretoko', false), true);
  assert.equal(store.value.checkpoint, null); assert.equal(store.value.traversal, null);
  assert.equal(store.value.introStep, 4); assert.equal(store.value.droneDefeated, true);
  assert.equal(position(store, 'shiretoko', p()), true);
  assert.equal(store.value.traversal.distance, 0);
  assert.deepEqual(store.value.completedAreaIds, []);
  assert.equal(store.beginSession('sapporo', false), false);
});

test('same-store reopened resume preserves the exact reached checkpoint and permits new bounded movement', () => {
  const storage = memoryStorage(), store = new CampaignStore(storage); beginShiretoko(store);
  walkTo(store, 'shiretoko', { x: 0, z: 40 });
  assert.equal(store.checkpoint({ areaId: 'shiretoko', ...p(0, 40), yaw: .3, pitch: -.1, hp: 90 }), true);
  const previous = store.value;
  assert.equal(store.beginSession('shiretoko', true), true);
  assert.deepEqual(store.value, previous);
  assert.equal(position(store, 'shiretoko', p(0, 40)), true);
  assert.equal(position(store, 'shiretoko', p(0, 42)), true);
  assert.equal(store.value.traversal.distance, previous.traversal.distance + 2);
  assert.equal(store.beginSession('shiretoko', 'resume'), false);
  assert.equal(store.beginSession('unknown', true), false);
});

test('malformed, inconsistent and out-of-bounds saved checkpoints are rejected while valid story survives', () => {
  const store = new CampaignStore(); beginShiretoko(store);
  const saved = JSON.parse(JSON.stringify(store.value));
  const cp = { areaId: 'shiretoko', ...p(0, 6), yaw: 0, pitch: 0, hp: 80 };
  for (const invalid of [{ ...cp, x: 9999 }, { ...cp, z: 200 }, { ...cp, y: -9999 }, { ...cp, yaw: 1000000 }, { ...cp, pitch: 2 }, { ...cp, areaId: 'unknown' }]) {
    const parsed = parseCampaign(JSON.stringify({ ...saved, checkpoint: invalid }));
    assert.equal(parsed.checkpoint, null); assert.equal(parsed.introStep, 4);
  }
  const healthy = parseCampaign(JSON.stringify({ ...saved, checkpoint: { ...cp, hp: 0 } }));
  assert.equal(healthy.checkpoint.hp, 100);
  assert.equal(healthy.introStep, 4);
});

test('corrupt passage receipts restore only the valid prefix and never grant hidden-area checkpoints', () => {
  const store = new CampaignStore(); reachSapporo(store);
  const saved = JSON.parse(JSON.stringify(store.value));
  saved.passages[1].position.x = 5000;
  saved.checkpoint = { areaId: 'hidaka-mountains', ...p(0, 0), yaw: 0, pitch: 0, hp: 100 };
  saved.traversal = { areaId: 'hidaka-mountains', distance: 100, lastPosition: p(0, 0), passedCheckpointIds: [] };
  const restored = parseCampaign(JSON.stringify(saved));
  assert.deepEqual(restored.completedAreaIds, ['shiretoko']);
  assert.deepEqual(unlockedAreaIds(restored), ['shiretoko', 'ishikari-mountains']);
  assert.equal(restored.checkpoint, null); assert.equal(restored.traversal, null);
  saved.passages[0].passedCheckpointIds = [];
  assert.deepEqual(parseCampaign(JSON.stringify(saved)).completedAreaIds, []);
});

test('reordered, duplicate, unsigned and Sapporo receipts cannot manufacture additional clears', () => {
  const store = new CampaignStore(); reachSapporo(store);
  const original = JSON.parse(JSON.stringify(store.value));
  for (const mutate of [v => { v.passages[0].areaId = 'hidaka-mountains'; }, v => { v.passages[0].provisional = false; }, v => { v.passages[0].distance = Infinity; }, v => { v.passages[0].position.z = NaN; }, v => { v.droneDefeated = false; }, v => { v.introStep = 3; }]) {
    const v = structuredClone(original); mutate(v); assert.deepEqual(parseCampaign(JSON.stringify(v)).completedAreaIds, []);
  }
  const v = structuredClone(original); v.passages[1] = v.passages[0];
  assert.deepEqual(parseCampaign(JSON.stringify(v)).completedAreaIds, ['shiretoko']);
  original.passages.push({ areaId: 'sapporo', position: p(0, 132), distance: 150, passedCheckpointIds: ['city-edge-checkpoint', 'future-mission-poi'], provisional: true });
  assert.equal(parseCampaign(JSON.stringify(original)).completedAreaIds.length, 3);
});

test('storage denial preserves session play and reports read/write persistence separately', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const store = new CampaignStore(denied);
  assert.equal(store.saveStatus, 'storage-denied'); assert.equal(store.lastPersistenceError, 'read');
  beginShiretoko(store); assert.equal(defeatDrone(store), true); walkRoute(store, 'shiretoko'); assert.equal(exit(store, 'shiretoko'), true);
  assert.equal(store.saveStatus, 'storage-denied'); assert.equal(store.lastPersistenceError, 'write');
  assert.equal(store.storageAvailable, false); assert.equal(visibleAreas(store.value).length, 2);
  const memory = new CampaignStore(); beginShiretoko(memory);
  assert.equal(memory.saveStatus, 'memory-only'); assert.equal(memory.storageAvailable, false);
});

test('reset requires strict confirmation, clears only campaign state and preserves appearance/equipment', () => {
  const home = '{"version":1,"appearance":{"name":"北の生存者","palette":"clay"},"primary":"rifle"}';
  const storage = memoryStorage({ [HOME_KEY]: home }), store = new CampaignStore(storage); beginShiretoko(store);
  const previous = store.value;
  assert.equal(store.reset(false), false); assert.equal(store.value, previous);
  assert.equal(store.reset('yes'), false); assert.equal(store.value, previous);
  assert.equal(store.reset(true), true); assert.deepEqual(store.value, campaignDefaults());
  assert.equal(storage.getItem(HOME_KEY), home);
  assert.deepEqual(new CampaignStore(storage).value, campaignDefaults());
});

test('idle movement sampling avoids localStorage writes every frame and still persists real checkpoints', () => {
  const storage = memoryStorage(), store = new CampaignStore(storage);
  position(store, 'shiretoko', p());
  for (let i = 0; i < 100; i++) position(store, 'shiretoko', p());
  assert.equal(storage.writes.length, 0);
  assert.equal(store.checkpoint({ areaId: 'shiretoko', ...p(), yaw: 0, pitch: 0, hp: 100 }), true);
  assert.equal(storage.writes.length, 1);
});
