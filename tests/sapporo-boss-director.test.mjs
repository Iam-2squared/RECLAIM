import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SapporoBossDirector,SAPPORO_BOSS_RULES} from '../src/mission/sapporo-boss-director.ts';
import {resolveSegmentImpact} from '../src/mission/trajectory-effects.ts';

const arenas={tower:{center:{x:346.89,y:.3,z:176.97},radius:28},station:{center:{x:55.02,y:.3,z:-830.09},radius:42}};
const terrain={heightAt:()=>.3,blockedAt:()=>false},away={x:-1000,y:.3,z:1000};
const create=()=>new SapporoBossDirector(arenas,terrain);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('tower and station bosses have no model requests, damage targets or HP rows before their phase',()=>{
  const d=create();assert.equal(d.phase,1);assert.deepEqual(d.bosses,[]);assert.deepEqual(d.targets(),[]);assert.equal(d.defeated,false);
  assert.equal(d.hit('sapporo-boss-spider',100),false);d.activatePhase(2);assert.deepEqual(d.bosses,[]);
  assert.deepEqual(d.snapshot().scheduled.map(b=>[b.name,b.rank,b.phase,b.active]),[['電纏蜘蛛','小ボス',3,false],['氷路開拓機','中ボス',4,false]]);
  d.activatePhase(3);assert.equal(d.bosses.length,1);const spider=d.bosses[0];assert.equal(spider.kind,'spider');assert.equal(spider.hp,1000);assert.deepEqual(spider.origin,arenas.tower.center);
  for(const p of [1,2,3,NaN,Infinity,-1])d.activatePhase(p);assert.equal(d.phase,3);assert.equal(d.bosses.length,1);
  d.activatePhase(4);d.activatePhase(4);assert.deepEqual(d.bosses.map(b=>[b.kind,b.maxHp]),[['spider',1000],['snowblower',1000]]);assert.deepEqual(d.bosses[1].origin,arenas.station.center);
});

test('real projectile targets damage only the activated boss and victory requires both encounters',()=>{
  const d=create();d.activatePhase(3);const spider=d.bosses[0];
  const from={x:spider.position.x-8,y:spider.position.y+1.8,z:spider.position.z},to={...from,x:spider.position.x+8};
  assert.equal(resolveSegmentImpact(from,to,{solids:[],drone:null,targets:d.targets(),heightAt:()=>-999}).targetId,spider.id);
  assert.equal(d.hit(spider.id,15),true);assert.equal(spider.hp,985);assert.equal(spider.motion,'Hit');
  assert.equal(d.hit('sapporo-boss-snowblower',9999),false);d.hit(spider.id,9999);assert.equal(spider.motion,'Death');assert.equal(d.targets().length,0);assert.equal(d.defeated,false);
  d.activatePhase(4);const medium=d.bosses[1];assert.equal(medium.hp,1000);assert.equal(d.targets().length,5);assert.equal(d.defeated,false);
  d.hit(medium.id,9999);assert.equal(d.defeated,true);assert.equal(d.targets().length,0);assert.equal(d.hit(medium.id,1),false);
});

test('authored two-second attacks warn then strike once, respect occlusion and allow dodging',()=>{
  for(const phase of [3,4]){
    const d=create();d.activatePhase(phase);const boss=d.bosses.at(-1),player={...boss.position,z:boss.position.z-2.4};
    assert.equal(d.step(.7,player).damage,0);assert.equal(boss.motion,'Attack');
    assert.equal(d.step(.5,player).damage,SAPPORO_BOSS_RULES[boss.kind].damage);assert.equal(d.step(.7,player).damage,0);
    const occluded=create();occluded.activatePhase(phase);const target=occluded.bosses.at(-1),at={...target.position};
    occluded.step(.5,at);assert.equal(occluded.step(2,at,{canSee:()=>false}).damage,0);
    const dodged=create();dodged.activatePhase(phase);dodged.step(.5,{...dodged.bosses.at(-1).position});assert.equal(dodged.step(2,away).damage,0);
  }
});

test('each boss stays within its own plaza and never crosses colliders or terrain discontinuities',()=>{
  const d=create();d.activatePhase(4);d.step(40,away,{combatEnabled:false});assert.ok(d.bosses.every(b=>distance(b.position,b.origin)>.1));
  for(const boss of d.bosses){assert.ok(distance(boss.position,boss.arena.center)+boss.bodyRadius<boss.arena.radius);assert.ok(distance(boss.position,boss.origin)<4);}
  const blocked=create();blocked.activatePhase(4);const before=blocked.bosses.map(b=>({...b.position}));blocked.step(40,away,{canMove:()=>false});assert.deepEqual(blocked.bosses.map(b=>b.position),before);
  let obstructed=false;const wall=new SapporoBossDirector(arenas,{...terrain,blockedAt:()=>obstructed});wall.activatePhase(4);obstructed=true;wall.step(40,away);assert.deepEqual(wall.bosses.map(b=>b.position),before);
  const towerPlayer={...arenas.tower.center,z:arenas.tower.center.z+20};d.step(8,towerPlayer);assert.equal(d.bosses[1].state==='attack',false);d.step(40,away);assert.ok(d.bosses.every(b=>distance(b.position,b.origin)<4));
});

test('reset removes bosses and targets until their future phases; invalid clocks cannot advance AI',()=>{
  const d=create();d.activatePhase(4);d.hit(d.bosses[0].id,50);d.step(3,away);const before=d.snapshot();
  for(const dt of [0,-1,NaN,Infinity])d.step(dt,away);d.step(5,{x:NaN,y:0,z:0});assert.deepEqual(d.snapshot(),before);
  d.reset();assert.equal(d.phase,1);assert.equal(d.elapsed,0);assert.equal(d.targets().length,0);assert.equal(d.bosses.length,0);assert.equal(d.defeated,false);
  d.activatePhase(4);assert.ok(d.bosses.every(b=>b.hp===1000&&b.motion==='Idle'&&b.hits===0));
  const a=create(),b=create();a.activatePhase(4);b.activatePhase(4);a.step(12,away);for(let i=0;i<120;i++)b.step(.1,away);assert.deepEqual(a.snapshot(),b.snapshot());
  assert.throws(()=>new SapporoBossDirector({...arenas,tower:{...arenas.tower,radius:1}},terrain),RangeError);
});

test('waiting at an arena centre cannot be trapped by the phase boss materialising',()=>{
  for(const phase of [3,4]){
    const d=create(),player={...(phase===3?arenas.tower:arenas.station).center};d.activatePhase(phase,player);
    const boss=d.bosses.at(-1);assert.ok(distance(boss.position,player)>=boss.bodyRadius+1.55);assert.deepEqual(boss.position,boss.origin);
    assert.ok(distance(boss.position,boss.arena.center)+boss.bodyRadius<boss.arena.radius);
    const fixed={...boss.position};d.activatePhase(phase,player);assert.deepEqual(boss.position,fixed,'Repeated phase calls must not teleport an already active boss');
    d.step(20,away);assert.ok(distance(boss.position,boss.arena.center)+boss.bodyRadius<boss.arena.radius);
    d.reset();d.activatePhase(phase,away);assert.deepEqual(d.bosses.at(-1).origin,(phase===3?arenas.tower:arenas.station).center);
  }
});

test('boss activation searches clear terrain near walls and defers a completely blocked landing',()=>{
  const tower=arenas.tower.center,wall=(x,z,_y,radius)=>x+radius>tower.x+1&&z-radius<tower.z+10&&z+radius>tower.z-10;
  const d=new SapporoBossDirector(arenas,{...terrain,blockedAt:wall});d.activatePhase(3,{...tower});const boss=d.bosses[0];
  assert.ok(boss);assert.equal(wall(boss.position.x,boss.position.z,boss.position.y,boss.bodyRadius),false);assert.ok(distance(boss.position,tower)>=boss.bodyRadius+1.55);
  let closed=true;const blocked=new SapporoBossDirector(arenas,{...terrain,blockedAt:()=>closed});blocked.activatePhase(3,tower);assert.equal(blocked.bosses.length,0);assert.equal(blocked.targets().length,0);
  closed=false;blocked.activatePhase(3,tower);assert.equal(blocked.bosses.length,1);assert.ok(distance(blocked.bosses[0].position,tower)>=blocked.bosses[0].bodyRadius+1.55);
  const cliff=new SapporoBossDirector(arenas,{heightAt:(x,z)=>Math.hypot(x-tower.x,z-tower.z)<1?.3:100,blockedAt:()=>false});cliff.activatePhase(3,tower);assert.equal(cliff.bosses.length,0,'A cliff or rooftop must not be accepted as an offset landing');
});
