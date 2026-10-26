import test from 'node:test';
import assert from 'node:assert/strict';
import {HumanoidEnemy,RamDrone,ENEMY_RULES} from '../src/mission/enemy-ai.ts';
const flat=()=>0;
const player=(x=0,z=0,y=0)=>({x,y,z});
function simulate(enemy,seconds,target,visible=true,canMove,dt=1/120){let damage=0;const events=[];for(let t=0;t<seconds-1e-9;t+=dt){const d=enemy.step(Math.min(dt,seconds-t),target,flat,visible,canMove);damage+=d;if(d)events.push({clock:enemy.clock,damage:d,position:{...enemy.position}});}return{damage,events};}

test('weaponless drone cannot damage a player 8 metres away without physical movement',()=>{
  const drone=new RamDrone(0,0,0);
  const result=simulate(drone,15,player(0,8),true,()=>false);
  assert.equal(result.damage,0);assert.ok(Math.hypot(drone.position.x,drone.position.z)<.01);
});
test('drone telegraphs then dives into actual player capsule for one ram hit',()=>{
  const drone=new RamDrone(0,0,0),target=player(0,2.5);
  assert.equal(simulate(drone,1.25,target).damage,0);
  const result=simulate(drone,1.2,target);
  assert.equal(result.damage,ENEMY_RULES.drone.damage);assert.equal(result.events.length,1);
  const contact=result.events[0].position;
  assert.ok(Math.hypot(contact.x-target.x,contact.z-target.z)<=.85);
  assert.ok(contact.y<1.9);assert.equal(drone.state,'recover');
});
test('dodging a committed ram prevents damage instead of magnetically following player',()=>{
  const drone=new RamDrone(0,0,0),target=player(0,2.5);
  for(let i=0;i<400&&drone.state!=='attack';i++)drone.step(1/120,target,flat,true);
  assert.equal(drone.state,'attack');const lockedYaw=drone.yaw;
  const result=simulate(drone,.6,player(4,2.5));
  assert.equal(result.damage,0);assert.equal(drone.yaw,lockedYaw);
});
test('occlusion cancels windup and prevents damage through walls',()=>{
  for(const enemy of [new RamDrone(0,0,0),new HumanoidEnemy(0,0,0)]){
    const target=player(0,.8);simulate(enemy,.7,target);
    assert.equal(enemy.state,'windup');
    assert.equal(simulate(enemy,5,target,false).damage,0);
  }
});
test('a blocker stops a ram even if visibility probe remains true',()=>{
  const drone=new RamDrone(0,0,0),target=player(0,2.5);
  for(let i=0;i<400&&drone.state!=='attack';i++)drone.step(1/120,target,flat,true);
  const before={...drone.position};assert.equal(simulate(drone,.3,target,true,()=>false).damage,0);
  assert.ok(Math.hypot(drone.position.x-before.x,drone.position.z-before.z)<1e-6);
});
test('humanoid uses a close melee reach and a full windup',()=>{
  const enemy=new HumanoidEnemy(0,0,0),target=player(0,1);
  assert.equal(simulate(enemy,1.2,target).damage,0);
  const result=simulate(enemy,.5,target);
  assert.equal(result.damage,ENEMY_RULES.humanoid.damage);assert.equal(result.events.length,1);
  assert.equal(enemy.position.y,0);
});
test('humanoid cannot hit a vertically separated player or a distant player',()=>{
  for(const target of [player(0,.8,3),player(0,5)]){
    const enemy=new HumanoidEnemy(0,0,0);
    assert.equal(simulate(enemy,8,target,true,()=>false).damage,0);
  }
});
test('hits interrupt attacks and death rejects later hits or damage',()=>{
  for(const enemy of [new RamDrone(0,0,0),new HumanoidEnemy(0,0,0)]){
    const target=player(0,.7);simulate(enemy,1,target);assert.equal(enemy.hit(8),true);assert.equal(enemy.state,'hit');
    assert.equal(enemy.hp,16);assert.equal(enemy.hits,1);assert.equal(simulate(enemy,.18,target).damage,0);
    assert.equal(enemy.hit(100),true);assert.equal(enemy.state,'dead');assert.equal(enemy.hp,0);
    assert.equal(enemy.hit(1),false);assert.equal(enemy.hits,2);assert.equal(simulate(enemy,5,target).damage,0);
    assert.ok(enemy.position.y>=0);
  }
});
test('enemies stay within their territory and disengage for unreachable distant targets',()=>{
  for(const enemy of [new RamDrone(0,0,0),new HumanoidEnemy(0,0,0)]){
    simulate(enemy,30,player(0,100),false);
    assert.ok(Math.hypot(enemy.position.x,enemy.position.z)<=ENEMY_RULES[enemy.kind].leash+.35);
    assert.equal(enemy.state,'patrol');
  }
});
test('invalid time and player coordinates cannot poison an enemy transform',()=>{
  const enemy=new RamDrone(1,2,0),before=enemy.snapshot();
  for(const dt of [NaN,Infinity,-1,0])assert.equal(enemy.step(dt,player(),flat),0);
  assert.equal(enemy.step(.1,player(NaN),flat),0);assert.deepEqual(enemy.snapshot(),before);
  assert.equal(enemy.hit(NaN),false);assert.equal(enemy.hit(-1),false);
});
test('level5 retains same moves with explicit tougher provisional health and reset',()=>{
  const enemy=new HumanoidEnemy(1,2,0,5);assert.equal(enemy.level,5);assert.equal(enemy.hp,72);
  enemy.hit(72);enemy.reset();assert.equal(enemy.hp,72);assert.equal(enemy.hits,0);assert.equal(enemy.state,'patrol');
  const defeated=new RamDrone(1,2,0,1,true);assert.equal(defeated.state,'dead');assert.equal(defeated.hp,0);
  assert.equal(simulate(defeated,2,player()).damage,0);defeated.reset();assert.equal(defeated.hp,24);
});
test('enemy yaw uses the same negative Z forward convention as player and actors',()=>{
  const front=new HumanoidEnemy(0,0,0),right=new RamDrone(0,0,0);
  simulate(front,.2,player(0,-5));simulate(right,.2,player(5,0));
  assert.ok(Math.abs(front.yaw)<1e-6);assert.ok(Math.abs(right.yaw+Math.PI/2)<1e-6);
});
test('unaware enemies patrol locally while the player is more than 100 metres away',()=>{
  for(const enemy of [new RamDrone(0,0,0),new HumanoidEnemy(0,0,0)]){
    const start={...enemy.position};const result=simulate(enemy,4,player(0,150),false);
    assert.equal(result.damage,0);assert.equal(enemy.state,'patrol');assert.equal(enemy.snapshot().returning,false);
    assert.ok(Math.hypot(enemy.position.x-start.x,enemy.position.z-start.z)>.3,'patrol must visibly move');
    assert.ok(Math.hypot(enemy.position.x-enemy.origin.x,enemy.position.z-enemy.origin.z)<2,'patrol remains local');
    assert.ok(enemy.clock>=4-1e-7);
  }
});
test('a far unseen shot still plays the full hit flinch before returning to unaware patrol',()=>{
  for(const enemy of [new RamDrone(0,0,0),new HumanoidEnemy(0,0,0)]){
    simulate(enemy,3,player(0,150),false);assert.equal(enemy.hit(8),true);
    assert.equal(enemy.state,'hit');assert.equal(enemy.motion,'Hit');
    assert.equal(simulate(enemy,.18,player(0,150),false).damage,0);
    assert.equal(enemy.state,'hit');assert.equal(enemy.motion,'Hit');assert.equal(enemy.hp,16);
    simulate(enemy,.05,player(0,150),false);assert.equal(enemy.state,'patrol');
    assert.equal(enemy.snapshot().returning,false);assert.equal(enemy.hits,1);
    enemy.hit(100);simulate(enemy,.2,player(0,150),false);assert.equal(enemy.state,'dead');assert.equal(enemy.motion,'Death');
  }
});
test('losing sight during pursuit still disengages and returns the enemy toward its home',()=>{
  for(const enemy of [new RamDrone(0,0,0),new HumanoidEnemy(0,0,0)]){
    simulate(enemy,3,player(0,10),true);assert.equal(enemy.state,'chase');
    const chasedDistance=Math.hypot(enemy.position.x,enemy.position.z);assert.ok(chasedDistance>1);
    simulate(enemy,1.2,player(0,10),false);assert.equal(enemy.snapshot().returning,true);
    simulate(enemy,5,player(0,100),false);
    assert.ok(Math.hypot(enemy.position.x,enemy.position.z)<2);assert.equal(enemy.state,'patrol');
    assert.equal(enemy.snapshot().returning,false);
  }
});
