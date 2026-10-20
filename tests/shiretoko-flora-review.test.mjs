import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFloraReview, FLORA_REVIEW_CHUNKS } from '../src/shiretoko-phase1/flora-review.ts';
import { planFlora } from '../src/shiretoko-phase1/vegetation-plan.ts';

const surface = {
  height: (x,z) => 110 + .001 * (x + z),
  slope: () => .12,
  wetness: () => .18,
  routeDistance: () => 80,
  water: () => false,
};
test('floral meshes use the existing seeded, coordinate-based planner exactly once per instance', () => {
  const review = createFloraReview(surface);
  const expected = FLORA_REVIEW_CHUNKS.flatMap(([x,z]) => planFlora(x,z,surface,'low'));
  assert.equal(review.count, expected.length);
  assert.equal(Object.values(review.byKind).reduce((a,b)=>a+b,0), expected.length);
  assert(review.drawCalls > 1 && review.drawCalls <= 13);
  for (const child of review.group.children) {
    assert.equal(child.count, review.byKind[child.name.split('/')[1]]);
    assert.equal(child.instanceMatrix.count, child.count * 16);
  }
  review.dispose();
  assert.equal(review.group.children.length,0);
});
test('water/route exclusion prevents any visual flora from being drawn',()=>{
  const allWater = createFloraReview({ ...surface, water:()=>true });
  const allPath = createFloraReview({ ...surface, routeDistance:()=>0 });
  assert.equal(allWater.count,0);
  assert.equal(allWater.drawCalls,0);
  assert.equal(allPath.count,0);
  allWater.dispose();allPath.dispose();
});
test('low detail remains a subset of balanced, with a bounded fixed chunk budget',()=>{
  const low = createFloraReview(surface, 'low'), balanced=createFloraReview(surface,'balanced');
  assert.equal(FLORA_REVIEW_CHUNKS.length,20);
  assert(balanced.count>low.count);
  assert(balanced.count<20*900);
  for(const kind of Object.keys(low.byKind))assert(balanced.byKind[kind]>=low.byKind[kind]);
  low.dispose();balanced.dispose();
});
test('disposing all instanced geometry is idempotent and does not change terrain samples',()=>{
  let calls=0;
  const watched={...surface,height:(x,z)=>{calls++;return surface.height(x,z);}};
  const review=createFloraReview(watched);
  const before=calls;
  let disposals=0;
  for(const child of review.group.children)child.geometry.addEventListener('dispose',()=>{disposals++;});
  review.dispose();review.dispose();
  assert.equal(disposals,review.drawCalls);
  assert.equal(calls,before);
});
test('out-of-range quality does not allocate instances',()=>{
  assert.throws(()=>createFloraReview(surface,'cinematic'),RangeError);
});
