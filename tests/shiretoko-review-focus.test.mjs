import test from 'node:test';
import assert from 'node:assert/strict';
import {natureReviewFocus} from '../src/shiretoko-phase1/review-focus.ts';

const height = (x,z) => 100 + x / 100 + z / 200;
const focus = (search) => natureReviewFocus(new URLSearchParams(search),height);

test('baseline and unknown flags never change the canonical aerial opening',()=>{
  assert.equal(focus(''),null);
  assert.equal(focus('elevation=1&route=1'),null);
  assert.equal(focus('flora=none&boardwalk=0&cabin=false'),null);
});

test('each existing nature mode immediately frames its actual authored feature',()=>{
  assert.equal(focus('flora=low').kind,'flora');
  assert.equal(focus('flora=balanced').kind,'flora');
  assert.equal(focus('flora=1').kind,'flora');
  assert.equal(focus('boardwalk=1').kind,'boardwalk');
  assert.equal(focus('boardwalk=true').kind,'boardwalk');
  assert.equal(focus('cabin=on').kind,'cabin');
});

test('cabin outranks boardwalk, which outranks flora without affecting the requested meshes',()=>{
  assert.equal(focus('flora=low&boardwalk=1&cabin=1').kind,'cabin');
  assert.equal(focus('flora=balanced&boardwalk=1').kind,'boardwalk');
  assert.equal(focus('flora=balanced&cabin=0').kind,'flora');
});

test('review camera tracks the real terrain elevation at BOTH camera and target',()=>{
  for (const query of ['flora=low','boardwalk=1','cabin=1']) {
    const view=focus(query);
    assert(view);
    const [x,y,z]=view.position,[tx,ty,tz]=view.target;
    assert(Number.isFinite(y)&&Number.isFinite(ty));
    assert(y>height(x,z));
    assert(ty>height(tx,tz));
    assert(Math.hypot(x-tx,z-tz)>20,'real look direction is not a zero-length vector');
    assert.match(view.title,/。$/);
  }
  const cabin=focus('cabin=1');
  assert.deepEqual(cabin.position,[-38,height(-38,881)+12,881]);
  assert.deepEqual(cabin.target,[-100,height(-100,835)+2,835]);
});
