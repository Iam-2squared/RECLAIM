import test from 'node:test';
import assert from 'node:assert/strict';
import {natureReviewFocus} from '../src/shiretoko-phase1/review-focus.ts';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';

const height = (x,z) => 100 + x / 100 + z / 200;
const focus = (search) => natureReviewFocus(new URLSearchParams(search),height);

test('baseline and unknown flags never change the canonical aerial opening',()=>{
  assert.equal(focus(''),null);
  assert.equal(focus('elevation=1&route=1'),null);
  assert.equal(focus('flora=none&boardwalk=0&cabin=false'),null);
  assert.equal(focus('highland=1'),null,'highland cannot activate without real vegetation');
  assert.equal(focus('flora=none&highland=1'),null);
});

test('each existing nature mode immediately frames its actual authored feature',()=>{
  assert.equal(focus('flora=low').kind,'flora');
  assert.equal(focus('flora=balanced').kind,'flora');
  assert.equal(focus('flora=1').kind,'flora');
  assert.equal(focus('boardwalk=1').kind,'boardwalk');
  assert.equal(focus('boardwalk=true').kind,'boardwalk');
  assert.equal(focus('cabin=on').kind,'cabin');
  assert.equal(focus('flora=low&highland=1').kind,'highland');
  assert.equal(focus('flora=balanced&highland=true').kind,'highland');
});

test('cabin outranks boardwalk, which outranks flora without affecting the requested meshes',()=>{
  assert.equal(focus('flora=low&boardwalk=1&cabin=1').kind,'cabin');
  assert.equal(focus('flora=balanced&boardwalk=1').kind,'boardwalk');
  assert.equal(focus('flora=balanced&cabin=0').kind,'flora');
  assert.equal(focus('flora=balanced&highland=1&cabin=1').kind,'cabin');
  assert.equal(focus('flora=low&highland=1&boardwalk=1').kind,'boardwalk');
});

test('review camera tracks the real terrain elevation at BOTH camera and target',()=>{
  for (const query of ['flora=low','boardwalk=1','cabin=1','flora=low&highland=1']) {
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
  assert.deepEqual(cabin.position,[-60,height(-60,820)+12,820]);
  assert.deepEqual(cabin.target,[-100,height(-100,835)+2,835]);
});


test('real highland starts on an oblique slope view, not the prior nearly top-down empty plain',()=>{
  const terrain=new ShiretokoTerrain();
  const view=natureReviewFocus(new URLSearchParams('flora=low&highland=1'),
    (x,z)=>terrain.heightAt(x,z));
  assert(view && view.kind==='highland');
  const [x,y,z]=view.position,[tx,ty,tz]=view.target;
  const horizontal=Math.hypot(x-tx,z-tz),vertical=y-ty;
  assert(horizontal>40,'show depth, not an aerial map');
  assert(vertical>5&&vertical<horizontal*.45,
    'mountain vegetation should fill a low-oblique view rather than almost straight-down ground');
  assert(y>terrain.heightAt(x,z)+30,'camera remains above local ground');
  assert(ty>terrain.heightAt(tx,tz),'target still follows the actual 5m mountain mesh');
});

test('real 5m terrain initial nature cameras remain above their subjects without OrbitControls clamp',()=>{
  const terrain=new ShiretokoTerrain();
  for(const [query,kind] of [['cabin=1','cabin'],['flora=low','flora'],['boardwalk=1','boardwalk'],['flora=low&highland=1','highland']]) {
    const view=natureReviewFocus(new URLSearchParams(query),(x,z)=>terrain.heightAt(x,z));
    assert.equal(view.kind,kind);
    const [x,y,z]=view.position,[tx,ty,tz]=view.target;
    const horizontal=Math.hypot(x-tx,z-tz),polar=Math.atan2(horizontal,y-ty);
    assert(y>ty,kind+' viewer must be above target on actual terrain');
    assert(polar<Math.PI*.49,kind+' initial camera must not be clamped by OrbitControls');
    assert(y>terrain.heightAt(x,z) && ty>terrain.heightAt(tx,tz));
  }
});
