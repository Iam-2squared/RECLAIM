import{test}from'node:test';
import assert from'node:assert/strict';
import{HordeDirector,HORDE_DEFAULTS}from'../src/mission/horde-director.ts';

const player={x:0,y:0,z:0};
const flatTerrain={heightAt:()=>0,inWater:()=>false,blockedAt:()=>false};
const idle={combatEnabled:false};
function director(extra={}){
  return new HordeDirector({road:[{x:0,y:0,z:0},{x:0,y:0,z:-300}],warehouseRoad:{humanoid:[{x:10,y:0,z:-100},{x:0,y:0,z:-100}],drone:[{x:12,y:0,z:-100},{x:0,y:0,z:-100}]},terrain:flatTerrain,devices:[{kind:'humanoid',position:{x:10,y:0,z:-100}},{kind:'drone',position:{x:12,y:0,z:-100}}],...extra});
}

test('initial two enemies are followed by alternating five-second spawns continuously through total50 at240s',()=>{
  const d=director();assert.equal(d.units.length,2);assert.deepEqual(d.units.map(u=>u.kind),['humanoid','drone']);
  assert.equal(d.snapshot().target,50);assert.equal(d.snapshot().nextSpawnIn,5);
  d.step(4.9,player,idle);assert.equal(d.scheduled,2);assert.ok(Math.abs(d.snapshot().nextSpawnIn-.1)<1e-6);
  let result=d.step(.1,player,idle);assert.equal(d.scheduled,3);assert.equal(result.events.filter(e=>e.type==='spawn').at(-1).kind,'humanoid');
  assert.ok(Math.abs(d.snapshot().nextSpawnIn-5)<1e-6);
  d.step(4.9,player,idle);assert.equal(d.scheduled,3);result=d.step(.1,player,idle);assert.equal(d.scheduled,4);assert.equal(result.events.filter(e=>e.type==='spawn').at(-1).kind,'drone');
  for(let at=15;at<=235;at+=5){result=d.step(5,player,idle);const spawned=result.events.filter(e=>e.type==='spawn');assert.equal(spawned.length,1);assert.ok(Math.abs(spawned[0].at-at)<1e-6);assert.equal(d.spawned,2+at/5);}
  d.step(4.9,player,idle);assert.equal(d.scheduled,49);d.step(.1,player,idle);
  assert.equal(d.scheduled,50);assert.equal(d.spawned,50);assert.equal(d.finished,true);assert.equal(d.snapshot().nextSpawnIn,null);
  assert.ok(Math.abs(d.elapsed-240)<1e-6);
  for(const unit of d.units)assert.equal(unit.kind,unit.slot%2?'humanoid':'drone');
  d.step(120,player,idle);assert.equal(d.units.length,50);assert.equal(new Set(d.units.map(u=>u.id)).size,50);
});

test('both spawn devices have500HP, survive499 damage and are destroyed by the last point',()=>{
  const d=director();assert.equal(HORDE_DEFAULTS.deviceHp,500);
  for(const device of d.devices){
    assert.equal(device.hp,500);assert.equal(device.maxHp,500);
    assert.equal(d.hitDevice(device.id,499),true);assert.equal(device.hp,1);assert.equal(device.destroyed,false);
    assert.equal(d.hitDevice(device.id,1),true);assert.equal(device.hp,0);assert.equal(device.destroyed,true);
  }
  assert.equal(d.snapshot().nextSpawnIn,null);d.reset();
  assert.ok(d.devices.every(device=>device.hp===500&&device.maxHp===500&&!device.destroyed));assert.equal(d.snapshot().nextSpawnIn,5);
});

test('destroyed spawn device permanently skips only its assigned kind without replacement',()=>{
  const d=director();assert.equal(d.hitDevice('spawn-humanoid',HORDE_DEFAULTS.deviceHp),true);
  assert.equal(d.hitDevice('spawn-humanoid',1),false);assert.equal(d.hitDevice('spawn-drone',NaN),false);
  const result=d.step(240,player,idle);
  assert.equal(d.scheduled,50);assert.equal(d.spawned,26);assert.equal(d.skipped,24);
  assert.equal(d.units.filter(u=>u.kind==='humanoid').length,1,'The initial humanoid survives; no replacements of that kind appear');
  assert.equal(d.units.filter(u=>u.kind==='drone').length,25);
  assert.equal(result.events.filter(e=>e.type==='skipped').length,24);
  d.hitDevice('spawn-drone',500);assert.equal(d.devices.every(device=>device.destroyed),true);
  const stopped=director();for(const device of stopped.devices)stopped.hitDevice(device.id,500);
  stopped.step(240,player,idle);assert.equal(stopped.spawned,2);assert.equal(stopped.scheduled,2);assert.equal(stopped.finished,true);assert.equal(stopped.snapshot().nextSpawnIn,null);
});

test('fixed steps are deterministic across frame partitions; invalid time does not advance the encounter',()=>{
  const a=director(),b=director();a.step(121,player,idle);for(let frame=0;frame<1210;frame++)b.step(.1,player,idle);
  assert.deepEqual(a.snapshot(),b.snapshot());
  const before=a.elapsed;a.step(NaN,player);a.step(-1,player);a.step(1,{x:NaN,y:0,z:0});assert.equal(a.elapsed,before);
});

test('road navigation follows a bent route rather than cutting through fields and respects movement probes',()=>{
  const road=[{x:0,y:0,z:0},{x:0,y:0,z:-50},{x:50,y:0,z:-50},{x:50,y:0,z:-100}],seen=[];
  const d=director({road,warehouseRoad:{humanoid:[{x:60,y:0,z:-50},{x:50,y:0,z:-50}],drone:[{x:62,y:0,z:-50},{x:50,y:0,z:-50}]}});
  for(let frame=0;frame<1800;frame++)d.step(1/30,{x:50,y:0,z:-100},{combatEnabled:false,canMove:(from,to)=>{seen.push({...to});return true;}});
  assert.ok(d.units[0].roadDistance>100);assert.ok(seen.some(p=>p.x>20));
  for(const p of seen){const distance=Math.min(Math.hypot(p.x,p.z-Math.max(-50,Math.min(0,p.z))),Math.hypot(p.x-Math.max(0,Math.min(62,p.x)),p.z+50),Math.hypot(p.x-50,p.z-Math.max(-100,Math.min(-50,p.z))));assert.ok(distance<1.5,'No field shortcut across the L-shaped route and its warehouse approach');}
  const stopped=director();const before={...stopped.units[0].position};stopped.step(20,{x:0,y:0,z:-200},{combatEnabled:false,canMove:()=>false});assert.deepEqual(stopped.units[0].position,before);
});

test('visibility and intro combat gate prevent damage; hits, deaths and reset remain finite and reproducible',()=>{
  const d=director({config:{initialRoadDistances:[.6,1.1]}});
  assert.equal(d.step(20,player,{visible:()=>false}).damage,0);
  assert.equal(d.step(20,player,{combatEnabled:false}).damage,0);
  d.reset();assert.ok(d.step(20,player,{visible:()=>true}).damage>0);
  const id=d.units[0].id;assert.equal(d.hit(id,NaN),false);assert.equal(d.hit(id,-1),false);assert.equal(d.hit(id,24),true);assert.equal(d.hit(id,24),false);assert.equal(d.killed,1);
  const events=d.drainEvents();assert.equal(events.filter(e=>e.type==='death').length,1);
  d.hitDevice('spawn-drone',500);d.step(121,player,idle);d.reset();
  assert.equal(d.elapsed,0);assert.equal(d.spawned,2);assert.equal(d.killed,0);assert.equal(d.scheduled,2);
  assert.equal(d.devices.every(device=>device.hp===device.maxHp&&!device.destroyed),true);
  assert.deepEqual(d.units.map(u=>u.id),['horde-humanoid-001','horde-drone-002']);
});
