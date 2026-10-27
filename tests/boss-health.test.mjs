import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { BossHealthPresentation } from '../src/mission/boss-health.ts';

const states=()=>[
 {id:'boss-boar',name:'錆猪',kind:'boar',position:{x:-3,y:0,z:0},hp:1000,maxHp:1000,barHeight:4.6},
 {id:'boss-owl',name:'哨戒梟',kind:'owl',position:{x:3,y:0,z:0},hp:1000,maxHp:1000,barHeight:5.3},
];
function fixture(){const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,1,.05,500);camera.position.set(0,3,15);scene.add(camera);return{scene,camera,view:new BossHealthPresentation(scene,camera)};}

test('two independent boss bars follow their own positions, fill fractions and camera orientation',()=>{
 const {scene,camera,view}=fixture(),bosses=states();view.update(bosses);
 assert.equal(view.snapshot().visibleBars,2);assert.equal(view.snapshot().capacity,2);
 let bars=scene.children.filter(object=>object.name==='Boss overhead health bar');
 assert.equal(bars.length,2);assert.equal(bars[0].position.y,4.6);assert.equal(bars[1].position.y,5.3);
 bosses[0].hp=250;bosses[1].position.x=4;camera.rotation.y=.12;view.update(bosses);
 assert.equal(bars[0].children[2].scale.x,3.08*.25);assert.equal(bars[1].children[2].scale.x,3.08);
 assert.equal(bars[1].position.x,4);assert.ok(bars.every(bar=>bar.quaternion.angleTo(camera.quaternion)<1e-7));
 view.dispose();assert.deepEqual(view.snapshot().resources,{geometries:0,materials:0});assert.equal(scene.children.length,1);
});

test('overhead bars hide for defeated, distant or behind-camera bosses without changing HP authority',()=>{
 const {view}=fixture(),bosses=states();view.update(bosses);assert.equal(view.snapshot().visibleBars,2);
 bosses[0].hp=0;view.update(bosses);assert.equal(view.snapshot().visibleBars,1);assert.equal(view.snapshot().bosses[0].alive,false);
 bosses[1].position.z=-250;view.setViewDistance(30);view.update(bosses);assert.equal(view.snapshot().visibleBars,0);
 bosses[0].hp=1000;bosses[0].position.z=40;view.update(bosses);assert.equal(view.snapshot().visibleBars,0);
 assert.equal(bosses[1].hp,1000);view.dispose();
});

test('boss bars remain bounded and can immediately reuse both slots after reset or replacement',()=>{
 const {view}=fixture(),bosses=states();view.update([...bosses,{...bosses[0],id:'third'}]);assert.equal(view.snapshot().bars,2);
 const resources=view.snapshot().resources;
 for(let i=0;i<20;i++){view.reset();assert.equal(view.snapshot().bars,0);view.update(bosses);assert.equal(view.snapshot().capacity,2);assert.deepEqual(view.snapshot().resources,resources);}
 view.update(bosses.map(boss=>({...boss,id:`${boss.id}-new`})));assert.equal(view.snapshot().bars,2);assert.ok(view.snapshot().bosses.every(boss=>boss.id.endsWith('-new')));
 view.update([{...bosses[0],hp:NaN}]);assert.equal(view.snapshot().bars,0);
 view.dispose();view.dispose();view.update(bosses);assert.equal(view.snapshot().capacity,0);
});
