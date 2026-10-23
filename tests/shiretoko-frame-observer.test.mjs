import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { selectRenderedTerrainView } from '../scripts/shiretoko-frame-observer.mjs';

// A deterministic model of a real draw held back by an occupied GPU queue.
// The evaluated callbacks are the actual browser callbacks in the helper.
function fixture({ drawAt = 45, duplicateAt = Infinity } = {}) {
  let frame = 0, draws = 10, pending = false;
  const events = [];
  const api = {
    diagnostics: () => ({ renderCallsTotal: draws }),
    setView(i) {
      events.push(['view', i]);
      pending = true;
      if (drawAt === 0) { draws++; pending = false; }
    },
  };
  const sandbox = vm.createContext({ window: { __SHIRETOKO_TERRAIN__: api } });
  const call = (fn, arg) => {
    sandbox.argument = arg;
    return vm.runInContext(`(${fn.toString()})(argument)`, sandbox);
  };
  const tick = () => {
    frame++;
    if (pending && frame >= drawAt) { draws++; pending = false; }
    if (frame === duplicateAt) draws++;
  };
  const page = {
    evaluate: async (fn, arg) => call(fn, arg),
    waitForFunction: async (fn, arg, options) => {
      assert.equal(options, undefined, 'do not extend the existing browser wait deadline');
      events.push(['wait', arg]);
      for (let i = 0; i < 100; i++) {
        if (call(fn, arg)) return;
        tick();
      }
      throw new Error('renderer never acknowledged the requested frame');
    },
  };
  const idle = () => {
    // Same 30-frame warmup and 20-frame zero-redraw assertion as V3.
    for (let i = 0; i < 30; i++) tick();
    const before = draws;
    for (let i = 0; i < 20; i++) tick();
    return draws - before;
  };
  return { page, api, idle, events, frame: () => frame };
}

test('reproduces the old 1 !== 0 failure when a legitimate requested frame arrives late', () => {
  const f = fixture();
  f.api.setView(0);
  assert.equal(f.idle(), 1);
});
test('awaits the requested draw before measuring the same strict zero-redraw idle window', async () => {
  const f = fixture();
  await selectRenderedTerrainView(f.page, 0);
  assert.equal(f.frame(), 45);
  assert.equal(f.idle(), 0);
  assert.deepEqual(f.events, [['view', 0], ['wait', 10]]);
});
test('an immediately submitted frame is acknowledged without requesting a second draw', async () => {
  const f = fixture({ drawAt: 0 });
  await selectRenderedTerrainView(f.page, 3);
  assert.equal(f.frame(), 0);
  assert.equal(f.idle(), 0);
  assert.deepEqual(f.events, [['view', 3], ['wait', 10]]);
});
test('still detects a real duplicate during the unchanged 20-frame idle measurement', async () => {
  const f = fixture({ duplicateAt: 85 });
  await selectRenderedTerrainView(f.page, 0);
  assert.equal(f.idle(), 1);
});
test('missing renderer acknowledgement and invalid view fail closed', async () => {
  const f = fixture({ drawAt: Infinity });
  await assert.rejects(selectRenderedTerrainView(f.page, 0), /never acknowledged/);
  for (const value of [-1, 5, 0.5, NaN]) {
    await assert.rejects(selectRenderedTerrainView(f.page, value), RangeError);
  }
});
