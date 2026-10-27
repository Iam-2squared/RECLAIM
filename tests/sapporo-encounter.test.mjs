import{test}from'node:test';
import assert from'node:assert/strict';
import{SapporoEncounterDirector,SAPPORO_ENCOUNTER_DEFAULTS}from'../src/mission/sapporo-encounter.ts';

const ground={heightAt:()=>0,inWater:()=>false,blockedAt:()=>false};
const distant={x:10000,y:0,z:10000};
const roads=[];
for(const at of[-400,-200,0,200,400]){roads.push({id:'east-'+at,width:18,points:[{x:-500,y:0,z:at},{x:500,y:0,z:at}]});roads.push({id:'north-'+at,width:18,points:[{x:at,y:0,z:-500},{x:at,y:0,z:500}]});}
const create=(options={})=>new SapporoEncounterDirector({roads,terrain:ground,...options});

test('Sapporo starts with50 distributed guards, adds50 at five active minutes, and only adds bosses in phases3/4',()=>{
 const d=create();assert.equal(SAPPORO_ENCOUNTER_DEFAULTS.phaseSeconds,300);assert.equal(d.phase,1);assert.equal(d.units.length,50);assert.equal(d.devices.length,0);assert.equal(d.units.filter(u=>u.kind==='humanoid').length,25);assert.equal(d.units.filter(u=>u.kind==='drone').length,25);
 assert.ok(d.snapshot().placement.minimumSpacing>20);const initial=d.units.map(u=>({...u.position}));
 d.step(299.9,distant);assert.equal(d.phase,1);assert.equal(d.units.length,50);d.step(.1,distant);assert.equal(d.phase,2);assert.equal(d.units.length,100);assert.ok(Math.abs(d.elapsed-300)<1e-7);assert.equal(d.summary().nextSpawnIn,null);assert.equal(d.activeSmallBoss,false);
 assert.deepEqual(d.units.slice(0,50).map(u=>u.position),initial,'distant guards should remain scattered instead of converging on the player');assert.equal(new Set(d.units.map(u=>u.id)).size,100);assert.ok(d.units.slice(50).every(u=>!u.initial&&u.lane==='road'));assert.equal(d.units.filter(u=>u.kind==='humanoid').length,50);
 let result=d.step(300,distant);assert.equal(d.phase,3);assert.equal(d.activeSmallBoss,true);assert.equal(d.activeMediumBoss,false);assert.equal(d.units.length,100);assert.deepEqual(result.events.filter(e=>e.type==='phase'),[{type:'phase',phase:3,at:600}]);
 result=d.step(300,distant);assert.equal(d.phase,4);assert.equal(d.activeSmallBoss,true);assert.equal(d.activeMediumBoss,true);assert.equal(d.units.length,100);assert.deepEqual(result.events.filter(e=>e.type==='phase'),[{type:'phase',phase:4,at:900}]);assert.equal(d.summary().nextPhaseIn,null);d.step(30,distant);assert.equal(d.units.length,100);
});

test('street placement rejects water, obstacles, boss circles and the arrival point before evenly distributing enemies',()=>{
 const terrain={heightAt:(x,z)=>x>450?NaN:0,inWater:(x,z)=>Math.hypot(x,z)<80,blockedAt:(x,z)=>x>150&&x<230&&Math.abs(z)<60};
 const excluded={position:{x:-400,y:0,z:-400},radius:45};const d=create({terrain,exclusions:[excluded]});
 for(const p of d.spawnPoints){assert.ok(Number.isFinite(p.y));assert.equal(terrain.inWater(p.x,p.z),false);assert.equal(terrain.blockedAt(p.x,p.z),false);assert.ok(Math.hypot(p.x+400,p.z+400)>=46);assert.ok(roads.some(r=>r.points[0].x===r.points[1].x?Math.abs(p.x-r.points[0].x)<1e-7:Math.abs(p.z-r.points[0].z)<1e-7));}
 assert.throws(()=>new SapporoEncounterDirector({roads:[{width:8,points:[{x:0,y:0,z:0},{x:10,y:0,z:0}]}],terrain:ground}),/enough clear guard positions/);
});

test('damage and death affect one guard; reset restores the first50 and resets every phase/clock',()=>{
 const d=create(),victim=d.units[0],neighbor=d.units[1];assert.equal(d.hit(victim.id,8),true);assert.equal(victim.hp,16);assert.equal(neighbor.hp,24);assert.equal(d.hit(victim.id,16),true);assert.equal(victim.hp,0);assert.equal(d.killed,1);assert.equal(d.hit(victim.id,1),false);assert.equal(d.hit(neighbor.id,NaN),false);assert.equal(d.targets.length,49);assert.equal(d.hitDevice('fake-device',500),false);
 d.step(901,distant);assert.equal(d.phase,4);assert.equal(d.spawned,100);d.reset();assert.equal(d.phase,1);assert.equal(d.elapsed,0);assert.equal(d.spawned,50);assert.equal(d.killed,0);assert.ok(d.units.every(u=>u.hp===u.maxHp));assert.equal(d.activeSmallBoss,false);assert.equal(d.activeMediumBoss,false);
});

test('fixed steps are partition-independent; paused/invalid calls never advance active time',()=>{
 const a=create(),b=create();a.step(601,distant);for(let i=0;i<6010;i++)b.step(.1,distant);assert.deepEqual(a.snapshot(),b.snapshot());const before=a.snapshot();for(const seconds of[0,-1,NaN,Infinity])a.step(seconds,distant);a.step(30,{x:NaN,y:0,z:0});a.step(60,distant,{paused:true});assert.deepEqual(a.snapshot(),before);
});

test('near guards use supplied humanoid and drone attacks while walls and movement probes prevent damage/pathing',()=>{
 const options={roads:[{width:18,points:[{x:-45,y:0,z:0},{x:45,y:0,z:0}]}],terrain:ground,config:{initialCount:1,reinforcementCount:1}};
 const d=new SapporoEncounterDirector(options),human=d.units[0],player={x:human.position.x+.8,y:0,z:human.position.z};let damage=0;for(let i=0;i<120;i++)damage+=d.step(1/30,player,{visible:()=>true}).damage;assert.ok(damage>=5);assert.equal(human.machine.kind,'humanoid');
 const blocked=new SapporoEncounterDirector(options),guard=blocked.units[0],position={...guard.position};for(let i=0;i<150;i++)assert.equal(blocked.step(1/30,{x:position.x+8,y:0,z:0},{visible:()=>false,canMove:()=>false}).damage,0);assert.deepEqual(guard.position,position);
 const droneTest=new SapporoEncounterDirector({...options,phaseSeconds:.5});droneTest.step(.5,distant);const drone=droneTest.units.find(u=>u.kind==='drone');assert.ok(drone);damage=0;for(let i=0;i<180;i++)damage+=droneTest.step(1/30,{x:drone.machine.origin.x,y:0,z:1.5},{visible:()=>true}).damage;assert.ok(damage>=4,'provided drone ram should hit the player capsule');
 const far=create();far.step(.1,distant);assert.equal(far.summary().activeAi,0);assert.equal(far.summary().sleepingAi,50);
});
