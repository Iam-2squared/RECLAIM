import test from 'node:test';
import assert from 'node:assert/strict';
import {WeaponState,WEAPON_RULES} from '../src/mission/weapon-state.ts';

function advance(gun,seconds,dt=1/120){const shots=[];for(let t=0;t<seconds-1e-9;t+=dt)shots.push(...gun.step(Math.min(dt,seconds-t)));return shots;}
function tap(gun){gun.trigger(true);gun.trigger(false);return gun.step(1/120);}

test('a complete click between fixed ticks fires exactly once',()=>{
  const gun=new WeaponState();assert.equal(tap(gun).length,1);
  assert.equal(advance(gun,1).length,0);assert.equal(gun.snapshot().ammo,23);
});
test('held assault repeats at its cadence and cannot fire past magazine capacity',()=>{
  const gun=new WeaponState();gun.trigger(true);
  const shots=advance(gun,8);assert.equal(shots.length,WEAPON_RULES.assault.magazine);
  assert.equal(gun.snapshot().ammo,0);assert.equal(gun.snapshot().reserve,120);
  assert.equal(new Set(shots.map(s=>s.id)).size,shots.length);
  assert.ok(shots.every(s=>!s.melee&&s.damage===8&&s.speed<=300&&s.spread>0));
});
test('automatic cadence remains consistent at 30, 60 and 120 fixed ticks',()=>{
  const counts=[30,60,120].map(fps=>{const gun=new WeaponState();gun.trigger(true);return advance(gun,2,1/fps).length;});
  assert.equal(counts[0],counts[1]);assert.equal(counts[1],counts[2]);
});
test('holding sniper fires once and later clicks respect its cooldown',()=>{
  const gun=new WeaponState('sniper');gun.trigger(true);
  assert.equal(advance(gun,2).length,1);gun.trigger(false);
  assert.equal(tap(gun).length,1);assert.equal(gun.snapshot().ammo,3);
  assert.equal(tap(gun).length,0);assert.equal(advance(gun,.9).length,1);
  assert.equal(gun.snapshot().ammo,2);
});
test('reload commits one ammo transfer only on completion',()=>{
  const gun=new WeaponState();tap(gun);advance(gun,.2);tap(gun);
  assert.equal(gun.snapshot().ammo,22);assert.equal(gun.reload(),true);
  assert.equal(advance(gun,1).length,0);assert.equal(gun.snapshot().ammo,22);
  assert.equal(gun.snapshot().reserve,120);assert.ok(gun.snapshot().reloadProgress>0);
  assert.equal(advance(gun,1).length,0);assert.equal(gun.snapshot().ammo,24);
  assert.equal(gun.snapshot().reserve,118);assert.equal(gun.snapshot().reloading,false);
  advance(gun,5);assert.equal(gun.snapshot().reserve,118);assert.equal(gun.reload(),false);
});
test('switching cancels uncommitted reload without manufacturing ammunition',()=>{
  const gun=new WeaponState();tap(gun);assert.equal(gun.reload(),true);advance(gun,.9);
  gun.select('sniper');advance(gun,3);gun.select('assault');
  assert.equal(gun.snapshot().ammo,23);assert.equal(gun.snapshot().reserve,120);assert.equal(gun.snapshot().reloading,false);
  assert.equal(advance(gun,1).length,0);
});
test('switching away and back cannot bypass a weapon cooldown',()=>{
  const gun=new WeaponState('sniper');assert.equal(tap(gun).length,1);
  gun.select('knife');gun.select('sniper');assert.equal(tap(gun).length,0);
  assert.equal(advance(gun,.9).length,1);assert.equal(gun.snapshot().ammo,3);
});
test('pause clears a buffered click, held fire, reload and recoil',()=>{
  const gun=new WeaponState();gun.trigger(true);gun.trigger(false);gun.clearInput();
  assert.equal(advance(gun,1).length,0);assert.equal(gun.snapshot().ammo,24);
  tap(gun);assert.ok(gun.pose.cameraPitch>0);gun.reload();gun.clearInput();
  assert.equal(advance(gun,3).length,0);assert.equal(gun.snapshot().ammo,23);assert.equal(gun.snapshot().reserve,120);
  assert.deepEqual(gun.pose,{rear:0,drop:0,rise:0,flash:0,cameraPitch:0,cameraYaw:0,reload:0,swing:0,aim:0});
});
test('aiming improves spread while movement broadens it',()=>{
  const hip=new WeaponState(),aim=new WeaponState(),moving=new WeaponState();
  aim.setAiming(true);moving.setAiming(true);moving.setMoving(true);
  const h=tap(hip)[0],a=tap(aim)[0],m=tap(moving)[0];
  assert.ok(a.spread<h.spread);assert.ok(m.spread>a.spread);assert.equal(a.damage,h.damage);
});
test('knife swings once per click and never generates a projectile or spends ammunition',()=>{
  const gun=new WeaponState('knife');gun.trigger(true);const shots=advance(gun,1);
  assert.equal(shots.length,1);assert.equal(shots[0].melee,true);assert.equal(shots[0].speed,0);
  assert.equal(gun.snapshot().ammo,null);assert.equal(gun.snapshot().reserve,null);
  assert.equal(gun.reload(),false);gun.setAiming(true);assert.equal(gun.snapshot().aiming,false);
  gun.trigger(false);assert.equal(tap(gun).length,1);advance(gun,.1);assert.ok(gun.pose.swing>0);
});
test('recoil is finite, bounded and returns without permanent camera drift',()=>{
  const gun=new WeaponState();gun.trigger(true);advance(gun,3);
  assert.ok(gun.pose.cameraPitch<=.085&&Math.abs(gun.pose.cameraYaw)<=.025);
  assert.ok(gun.pose.rear<=.17&&gun.pose.rise<=.13);gun.trigger(false);advance(gun,4);
  assert.ok(gun.pose.cameraPitch<1e-10&&Math.abs(gun.pose.cameraYaw)<1e-10);
  assert.ok(gun.pose.rear<1e-10);assert.equal(gun.pose.flash,0);
  const before=gun.snapshot();gun.step(NaN);gun.step(Infinity);gun.step(-1);
  assert.deepEqual(gun.snapshot(),before);
});
test('reset restores all three weapon inventories and drops old input',()=>{
  const gun=new WeaponState();gun.trigger(true);advance(gun,4);gun.select('sniper');tap(gun);gun.reset();
  assert.equal(gun.snapshot().ammo,5);gun.select('assault');assert.equal(gun.snapshot().ammo,24);
  assert.equal(gun.snapshot().reserve,120);assert.equal(advance(gun,1).length,0);
});
test('all reserve ammunition is finite and reload cannot replenish an exhausted inventory',()=>{
  const gun=new WeaponState();let count=0;
  for(let magazine=0;magazine<6;magazine++){
    gun.trigger(true);count+=advance(gun,5).length;gun.trigger(false);
    if(magazine<5){assert.equal(gun.reload(),true);advance(gun,2);}
  }
  assert.equal(count,144);assert.equal(gun.snapshot().ammo,0);assert.equal(gun.snapshot().reserve,0);
  assert.equal(gun.reload(),false);assert.equal(tap(gun).length,0);
});
