import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainIntro} from '../src/shiretoko-phase1/intro.ts';
test('intro supports direct exploration and cancellable optional camera travel',()=>{
 const intro=new TerrainIntro();assert.equal(intro.explore(),false);intro.open();assert.equal(intro.explore(),true);assert.equal(intro.explore(),false);
 intro.open();assert.equal(intro.fly(),true);assert.equal(intro.explore(),false);assert.equal(intro.fly(),false);assert.equal(intro.land(),true);assert.equal(intro.explore(),true);
 intro.open();intro.fly();intro.cancel();assert.equal(intro.land(),false);assert.equal(intro.state,'closed');
 intro.open();intro.dispose();assert.equal(intro.open(),false);assert.equal(intro.explore(),false);assert.equal(intro.cancel(),false);assert.equal(intro.state,'disposed');
});
