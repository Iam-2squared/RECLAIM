import{test}from'node:test';
import assert from'node:assert/strict';
import{HordeDirector}from'../src/mission/horde-director.ts';

const terrain={heightAt:()=>0,inWater:()=>false,blockedAt:()=>false},player={x:0,y:0,z:0},idle={combatEnabled:false};
function fixture(){
 const source=(id,cap,z)=>({id,cap,warehouseRoad:{humanoid:[{x:10,y:0,z},{x:0,y:0,z}],drone:[{x:12,y:0,z},{x:0,y:0,z}]},devices:[{kind:'humanoid',position:{x:10,y:0,z}},{kind:'drone',position:{x:12,y:0,z}}]});
 return new HordeDirector({road:[{x:0,y:0,z:0},{x:0,y:0,z:-300}],terrain,sources:[source('original',20,-100),source('additional',30,-200)]});
}
const bySource=(d,id)=>d.summary().sources.find(source=>source.id===id);

test('both warehouses start empty and independently alternate every five seconds to20 and30',()=>{
 const d=fixture();assert.equal(d.units.length,0);assert.equal(d.devices.length,4);assert.equal(d.summary().target,50);assert.equal(d.summary().nextSpawnIn,5);
 assert.ok(d.devices.every(device=>device.hp===500&&device.maxHp===500));assert.equal(new Set(d.devices.map(device=>device.id)).size,4);
 d.step(4.9,player,idle);assert.equal(d.spawned,0);let result=d.step(.1,player,idle);
 assert.deepEqual(result.events.filter(event=>event.type==='spawn').map(event=>[event.sourceId,event.kind,event.initial]),[['original','humanoid',false],['additional','humanoid',false]]);
 for(let at=10;at<=150;at+=5){
  result=d.step(5,player,idle);const events=result.events.filter(event=>event.type==='spawn');assert.equal(events.length,at<=100?2:1);
  for(const event of events){assert.ok(Math.abs(event.at-at)<1e-6);assert.equal(event.kind,(at/5)%2?'humanoid':'drone');}
  assert.equal(bySource(d,'original').spawned,Math.min(20,at/5));assert.equal(bySource(d,'additional').spawned,at/5);
  if(at===100){assert.equal(bySource(d,'original').finished,true);assert.equal(bySource(d,'original').nextSpawnIn,null);assert.equal(d.finished,false);}
 }
 assert.equal(d.spawned,50);assert.equal(d.scheduled,50);assert.equal(d.finished,true);assert.equal(d.summary().nextSpawnIn,null);
 for(const [id,count]of[['original',10],['additional',15]])for(const kind of['humanoid','drone'])assert.equal(d.units.filter(unit=>unit.sourceId===id&&unit.kind===kind).length,count);
 assert.equal(new Set(d.units.map(unit=>unit.id)).size,50);assert.equal(new Set(d.units.map(unit=>unit.slot)).size,50);
 for(const unit of d.units){assert.equal(unit.kind,unit.sourceSlot%2?'humanoid':'drone');assert.equal(unit.snapshot().sourceId,unit.sourceId);}
 d.step(30,player,idle);assert.equal(d.spawned,50);
});

test('destroying one kind skips only that warehouse slots and never replaces its ten enemies',()=>{
 const d=fixture(),device=d.devices.find(device=>device.sourceId==='original'&&device.kind==='humanoid');
 assert.equal(d.hitDevice(device.id,499),true);assert.equal(device.hp,1);assert.equal(device.destroyed,false);assert.equal(d.hitDevice(device.id,1),true);
 const result=d.step(150,player,idle);assert.equal(d.spawned,40);assert.equal(d.scheduled,50);assert.equal(d.skipped,10);
 assert.equal(d.units.filter(unit=>unit.sourceId==='original'&&unit.kind==='humanoid').length,0);assert.equal(d.units.filter(unit=>unit.sourceId==='original'&&unit.kind==='drone').length,10);
 assert.equal(bySource(d,'additional').spawned,30);assert.equal(bySource(d,'additional').skipped,0);
 assert.equal(result.events.filter(event=>event.type==='skipped'&&event.sourceId==='original').length,10);
});

test('destroying both devices stops only its warehouse; zero time pauses timers and reset restores all four',()=>{
 const d=fixture(),initial=d.snapshot();for(const device of d.devices.filter(device=>device.sourceId==='original'))d.hitDevice(device.id,500);
 d.step(15,player,idle);assert.equal(bySource(d,'original').finished,true);assert.equal(bySource(d,'original').scheduled,0);assert.equal(bySource(d,'additional').spawned,3);assert.equal(d.finished,false);
 const paused=d.snapshot();d.step(0,player,idle);d.step(NaN,player,idle);assert.deepEqual(d.snapshot(),paused);
 const victim=d.units[0];d.hit(victim.id,victim.maxHp);assert.equal(bySource(d,'additional').killed,1);
 d.reset();assert.deepEqual(d.snapshot(),initial);assert.equal(d.devices.every(device=>device.hp===500&&!device.destroyed),true);
 d.step(5,player,idle);assert.equal(d.spawned,2);assert.deepEqual(d.units.map(unit=>unit.sourceSlot),[1,1]);
 for(const device of d.devices)d.hitDevice(device.id,500);const count=d.spawned;d.step(200,player,idle);assert.equal(d.spawned,count);assert.equal(d.finished,true);assert.equal(d.summary().nextSpawnIn,null);
});

test('independent warehouse timers and routes remain deterministic across frame partitions',()=>{
 const a=fixture(),b=fixture();a.step(151,player,idle);for(let frame=0;frame<1510;frame++)b.step(.1,player,idle);assert.deepEqual(a.snapshot(),b.snapshot());
 const snapshot=a.snapshot();snapshot.sources[0].spawned=999;snapshot.devices[0].position.x=999;assert.equal(a.summary().sources[0].spawned,20);assert.notEqual(a.devices[0].position.x,999);
 const routes=fixture();routes.step(25,player,idle);for(const unit of routes.units){assert.ok(unit.position.x>=-.01&&unit.position.x<=12.01);if(unit.lane==='warehouse')assert.ok(Math.abs(unit.position.z-(unit.sourceId==='original'?-100:-200))<.01);}
});
