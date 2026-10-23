import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoutDrone, COMBAT_TUNING } from '../src/mission/combat.ts';

const ground = () => 0;
const adjacent = {x:0,y:0,z:3};
const remote = {x:0,y:0,z:100};

test('long idle observation never pre-charges the first drone attack', () => {
  const drone = new ScoutDrone(0,0,0);
  for(let i=0;i<1000;i++)assert.equal(drone.step(.1,remote,ground),0);
  assert.equal(drone.attackClock,0);
  assert.equal(drone.state,'idle');
  assert.equal(drone.step(.1,adjacent,ground),0,
    'being seen for the first time should telegraph instead of dealing instant damage');
  assert.equal(drone.state,'attacking');
  let hits=0;
  for(let i=1;i<23;i++)hits+=drone.step(.1,adjacent,ground);
  assert.equal(hits,0,'a target must be given a full response window');
  for(let i=0;i<2;i++)hits+=drone.step(.1,adjacent,ground);
  assert.equal(hits,COMBAT_TUNING.attackDamage,'exactly one hit after the wind-up');
});

test('loss of line of sight clears the attack timer before re-entry', () => {
  const drone = new ScoutDrone(0,0,0);
  for(let i=0;i<20;i++)assert.equal(drone.step(.1,adjacent,ground),0);
  assert(drone.attackClock>1.9);
  assert.equal(drone.step(.1,adjacent,ground,false),0);
  assert.equal(drone.attackClock,0,'an occluded drone cannot store a nearly finished shot');
  assert.equal(drone.step(.1,adjacent,ground,true),0);
  for(let i=0;i<22;i++)assert.equal(drone.step(.1,adjacent,ground),0);
  assert.equal(drone.state,'attacking');
});

test('invalid clock input cannot poison future wind-up or produce a free hit', () => {
  const drone = new ScoutDrone(0,0,0);
  for(const bad of [NaN,Infinity,-Infinity,-20]) {
    assert.equal(drone.step(bad,adjacent,ground),0);
    assert.equal(drone.attackClock,0);
    assert(Number.isFinite(drone.clock));
  }
  for(let i=0;i<24;i++)drone.step(.1,adjacent,ground);
  assert.equal(drone.hit(COMBAT_TUNING.droneHp),true);
  assert.equal(drone.step(.1,adjacent,ground),0);
  assert.equal(drone.state,'stopped');
});
