import{test}from'node:test';
import assert from'node:assert/strict';
import{BossDirector,BOSS_RULES}from'../src/mission/boss-director.ts';
import{resolveSegmentImpact}from'../src/mission/trajectory-effects.ts';

const arena={center:{x:-118,y:109.6,z:-290},radius:14};
const terrain={heightAt:()=>109.6,blockedAt:()=>false};
const away={x:0,y:0,z:0};
const create=()=>new BossDirector(arena,terrain);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('two named bosses use independent supplied dimensions, HP and shot targets',()=>{
  const d=create();assert.deepEqual(d.bosses.map(b=>[b.kind,b.name,b.hp]),[['boar','錆猪',2000],['owl','哨戒梟',1500]]);
  assert.ok(d.bosses.every(b=>distance(b.position,arena.center)+b.bodyRadius<arena.radius));
  assert.ok(distance(d.bosses[0].position,d.bosses[1].position)>9);
  for(const boss of d.bosses){
    assert.equal(boss.hitboxes.length,5);assert.ok(boss.barHeight>boss.bodyHeight);assert.equal(boss.motion,'Idle');
    const from={...boss.position,x:boss.position.x-8,y:boss.position.y+1.1},to={...from,x:boss.position.x+8};
    assert.equal(resolveSegmentImpact(from,to,{solids:[],drone:null,targets:d.targets(),heightAt:()=>-999}).targetId,boss.id);
  }
  const [boar,owl]=d.bosses;assert.equal(d.hit(boar.id,8),true);assert.equal(boar.hp,1992);assert.equal(owl.hp,1500);assert.equal(boar.motion,'Hit');
  for(const damage of [NaN,Infinity,0,-1])assert.equal(d.hit(owl.id,damage),false);
  assert.equal(d.hit('not-a-boss',10),false);
});

test('patrols move supplied walk clips but never leave the clearing or ignore movement probes',()=>{
  const d=create(),seen=[];
  const initial=d.bosses.map(b=>({...b.position}));d.step(5,away,{combatEnabled:false,canMove:(from,to,radius,kind)=>{seen.push({to,radius,kind});return true;}});
  assert.ok(seen.length>0);assert.ok(d.bosses.some((b,i)=>distance(b.position,initial[i])>.2));
  assert.ok(d.bosses.every(b=>b.motion==='Walk'||b.motion==='Idle'));
  for(let n=0;n<30;n++)d.step(10,away,{combatEnabled:false});
  assert.ok(d.bosses.every(b=>distance(b.position,arena.center)+b.bodyRadius<arena.radius));
  const blocked=create(),before=blocked.bosses.map(b=>({...b.position}));blocked.step(20,away,{canMove:()=>false});
  assert.deepEqual(blocked.bosses.map(b=>b.position),before);
  const terrainBlocked=new BossDirector(arena,{...terrain,blockedAt:()=>true}),old=terrainBlocked.bosses.map(b=>({...b.position}));terrainBlocked.step(20,away);assert.deepEqual(terrainBlocked.bosses.map(b=>b.position),old);
});

test('attacks warn, strike once per authored clip, respect occlusion and can be dodged',()=>{
  const d=create(),boar=d.bosses[0],player={...boar.position,z:boar.position.z-2.4};
  assert.equal(d.step(.5,player).damage,0);assert.equal(boar.motion,'Attack');
  assert.equal(d.step(.3,player).damage,BOSS_RULES.boar.damage);
  assert.equal(d.step(.7,player).damage,0,'The same attack cannot damage twice');
  const gated=create(),p={...gated.bosses[0].position};
  assert.equal(gated.step(15,p,{combatEnabled:false}).damage,0);assert.equal(gated.step(15,p,{canSee:()=>false}).damage,0);
  const dodged=create(),at={...dodged.bosses[0].position};dodged.step(.5,at);
  assert.equal(dodged.step(2,away).damage,0);assert.notEqual(dodged.bosses[0].state,'attack');
  const occluded=create(),op={...occluded.bosses[0].position};occluded.step(.5,op);
  assert.equal(occluded.step(1,op,{canSee:()=>false}).damage,0);
});

test('boss pursuit leashes to arena, and leaving the area returns each boss home',()=>{
  const d=create(),player={x:arena.center.x,y:arena.center.y,z:arena.center.z+12};
  d.step(5,player);assert.ok(d.bosses.some(b=>distance(b.position,b.origin)>2));
  assert.ok(d.bosses.every(b=>distance(b.position,arena.center)+b.bodyRadius<arena.radius));
  assert.equal(d.step(30,away).damage,0);assert.ok(d.bosses.every(b=>distance(b.position,b.origin)<1.8));
});

test('flinches do not restart continuously; death removes only its targets and reset restores both',()=>{
  const d=create(),[boar,owl]=d.bosses;
  d.hit(boar.id,8);d.step(.3,away);const hitTime=boar.stateTime;
  d.hit(boar.id,8);assert.equal(boar.stateTime,hitTime);d.step(.4,away);assert.notEqual(boar.state,'hit');
  assert.equal(d.hit(boar.id,9999),true);assert.equal(boar.hp,0);assert.equal(boar.motion,'Death');assert.equal(d.hit(boar.id,1),false);
  assert.equal(d.targets().length,5);assert.ok(d.targets().every(t=>t.id===owl.id));assert.equal(d.defeated,false);
  d.hit(owl.id,9999);assert.equal(d.defeated,true);assert.equal(d.targets().length,0);
  assert.equal(d.step(20,{...boar.position}).damage,0);
  d.reset();assert.equal(d.elapsed,0);assert.equal(d.defeated,false);assert.equal(d.targets().length,10);
  assert.ok(d.bosses.every(b=>b.hp===b.maxHp&&b.motion==='Idle'&&b.hits===0));
});

test('fixed-step partitioning is deterministic, invalid time and players do not advance bosses',()=>{
  const a=create(),b=create();a.step(12,away);for(let n=0;n<120;n++)b.step(.1,away);
  assert.deepEqual(a.snapshot(),b.snapshot());const before=a.snapshot();
  for(const seconds of [NaN,Infinity,-1,0])a.step(seconds,away);a.step(1,{x:NaN,y:0,z:0});assert.deepEqual(a.snapshot(),before);
  assert.throws(()=>new BossDirector({...arena,radius:0},terrain),RangeError);
});
