import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SimulationClock,SIMULATION_TIMING} from '../src/mission/clock.ts';
import {CharacterController,PLAYER_TUNING} from '../src/mission/controller.ts';

const idle={forward:0,right:0,sprint:false,jump:false};
const terrain={heightAt:()=>0},bounds={minX:-50,maxX:50,minZ:-50,maxZ:50};
const player=colliders=>new CharacterController(terrain,()=>colliders??[],bounds,{x:0,z:0,yaw:0});

test('subframe time carries into fixed steps, and pause reset discards its fraction',()=>{
 const c=new SimulationClock(),steps=[];
 assert.equal(c.advance(1/120,dt=>{steps.push(dt);}),0);
 assert.equal(c.advance(1/120,dt=>{steps.push(dt);}),1);
 assert.deepEqual(steps,[1/60]);
 c.advance(1/120,()=>{assert.fail('half frame must wait');});c.reset();
 assert.equal(c.advance(1/120,()=>{assert.fail('paused fraction must not resume');}),0);
 assert.equal(c.advance(1/120,dt=>{steps.push(dt);}),1);
 assert.deepEqual(steps,[1/60,1/60]);
});

test('five renders per second preserve walking distance and jump flight at fixed physics steps',()=>{
 const slow=player(),reference=player(),c=new SimulationClock();
 for(let render=0;render<15;render++)c.advance(.2,dt=>{slow.step({...idle,forward:1},dt);});
 for(let tick=0;tick<180;tick++)reference.step({...idle,forward:1},1/60);
 assert(Math.abs(slow.distance-PLAYER_TUNING.walkSpeed*3)<1e-9);
 assert.deepEqual(slow.position,reference.position);
 const jump=player(),jumpClock=new SimulationClock();let rising=false,landedAt=null,elapsed=0;
 for(let render=0;render<5;render++)jumpClock.advance(.2,dt=>{
  jump.step({...idle,jump:elapsed===0},dt);elapsed+=dt;
  if(!jump.grounded)rising=true;
  else if(rising&&landedAt===null)landedAt=elapsed;
 });
 assert(rising);assert(landedAt>.3&&landedAt<.7);assert.equal(jump.grounded,true);assert.equal(jump.position.y,0);
});

test('a long delayed render has a bounded catch-up and cannot tunnel through a cabin wall',()=>{
 const wall={type:'aabb',minX:-5,maxX:5,minY:-1,maxY:4,minZ:-2,maxZ:-1,tag:'wall'};
 const p=player([wall]),c=new SimulationClock(),steps=[];
 assert.equal(c.advance(3600,dt=>{steps.push(dt);p.step({...idle,forward:1,sprint:true},dt);}),15);
 assert.equal(steps.length,SIMULATION_TIMING.maxSteps);assert(steps.every(dt=>dt===1/60));
 assert(Math.abs(steps.reduce((sum,dt)=>sum+dt,0)-.25)<1e-9);
 assert(p.distance<=PLAYER_TUNING.sprintSpeed*.25);assert(p.position.z>=-.68-1e-9);
 assert.equal(p.blocked(p.position.x,p.position.z),false);
 assert.equal(c.advance(1/60,()=>{}),1); // No hour-sized backlog is carried onward.
});

test('invalid and backwards clocks neither move the player nor poison the next frame',()=>{
 const c=new SimulationClock(),p=player();c.advance(1/120,dt=>p.step({...idle,forward:1},dt));
 for(const seconds of [NaN,Infinity,-Infinity,-100,0])assert.equal(c.advance(seconds,()=>{assert.fail('invalid time stepped');}),0);
 assert.equal(p.distance,0);
 assert.equal(c.advance(1/120,dt=>p.step({...idle,forward:1},dt)),1);
 assert(Math.abs(p.distance-PLAYER_TUNING.walkSpeed/60)<1e-9);
});

test('pause or death stops catch-up immediately and resume has no residual physics',()=>{
 const c=new SimulationClock(),p=player();let ticks=0,hp=4;
 assert.equal(c.advance(.2,dt=>{ticks++;p.step({...idle,forward:1},dt);hp-=4;c.reset();return hp>0;}),1);
 assert.equal(hp,0);assert.equal(ticks,1);assert(Math.abs(p.distance-PLAYER_TUNING.walkSpeed/60)<1e-9);
 assert.equal(c.accumulator,0);
 assert.equal(c.advance(1/120,()=>{assert.fail('resume must wait for a full fresh step');}),0);
 assert.equal(c.advance(1/120,()=>{ticks++;}),1);assert.equal(ticks,2);
});
