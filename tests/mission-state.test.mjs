import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CharacterController,PLAYER_TUNING} from '../src/mission/controller.ts';
import {ScoutDrone,raySphere,obstructionDistance,COMBAT_TUNING} from '../src/mission/combat.ts';
const terrain={heightAt:()=>0},bounds={minX:-50,maxX:50,minZ:-50,maxZ:50};
const input={forward:1,right:0,sprint:false,jump:false};
const player=colliders=>new CharacterController(terrain,()=>colliders??[],bounds,{x:0,z:0,yaw:0});
test('WASD displacement, normalized diagonals, sprint and immediate stop',()=>{const p=player();p.step(input,.1);assert.equal(p.position.z,-PLAYER_TUNING.walkSpeed*.1);const before={...p.position};p.step({...input,forward:0},.1);assert.deepEqual(p.position,before);const d=player();d.step({...input,right:1},.1);assert(Math.abs(Math.hypot(d.position.x,d.position.z)-PLAYER_TUNING.walkSpeed*.1)<1e-8);const s=player();s.step({...input,sprint:true},.1);assert(Math.abs(s.position.z)>Math.abs(p.position.z));});
test('jump needs grounded press, falls to shared terrain and cannot auto repeat while held',()=>{const p=player();p.step({...input,forward:0,jump:true},1/60);assert(p.position.y>0);assert.equal(p.grounded,false);for(let i=0;i<100;i++)p.step({...input,forward:0,jump:true},1/60);assert.equal(p.position.y,0);assert.equal(p.grounded,true);p.step({...input,forward:0,jump:false},1/60);p.step({...input,forward:0,jump:true},1/60);assert(p.position.y>0);});
test('pause or key release clears held Space even without physics, so the first fresh jump works',()=>{
 const p=player(),held={...input,forward:0,jump:true};
 for(let i=0;i<100;i++)p.step(held,1/60);
 assert.equal(p.grounded,true);assert.equal(p.jumpHeld,true);
 const before={position:{...p.position},velocity:p.verticalVelocity,grounded:p.grounded};
 p.clearInput(); // A pause/release does not execute any physics step.
 assert.deepEqual({position:p.position,velocity:p.verticalVelocity,grounded:p.grounded},before);
 p.step(held,1/60);assert.equal(p.grounded,false);assert(p.position.y>0);
 const airborneVelocity=p.verticalVelocity;p.clearInput();p.step(held,1/60);
 assert(Math.abs(p.verticalVelocity-(airborneVelocity-PLAYER_TUNING.gravity/60))<1e-9); // No second impulse in midair.
});
test('cabin wall and trunk prevent tunnelling and allow sliding',()=>{const wall={type:'aabb',minX:-5,maxX:5,minY:-1,maxY:4,minZ:-2,maxZ:-1,tag:'wall'},p=player([wall]);for(let i=0;i<90;i++)p.step({...input,right:.3,sprint:true},1/60);assert(p.position.z>-.7);assert(p.position.x>1);assert.equal(p.blocked(0,-1.2),true);const tree={type:'cylinder',x:0,z:-1,radius:.4,minY:0,maxY:8,tag:'tree'},t=player([tree]);for(let i=0;i<30;i++)t.step(input,1/60);assert(t.position.z>-.29);});
test('steep slope blocked; walkable grade shares terrain elevation',()=>{const steep=new CharacterController({heightAt:(x,z)=>-z*2},()=>[],bounds,{x:0,z:0,yaw:0});steep.step(input,.1);assert.equal(steep.position.z,0);const gentle=new CharacterController({heightAt:(x,z)=>-z*.2},()=>[],bounds,{x:0,z:0,yaw:0});for(let i=0;i<60;i++)gentle.step(input,1/60);assert(gentle.position.z<-2);assert(Math.abs(gentle.position.y-gentle.terrain.heightAt(gentle.position.x,gentle.position.z))<1e-8);});
test('out of bounds recovery and unsafe checkpoint rejection',()=>{const p=player();p.position.x=90;p.step(input,.1);assert.equal(p.recoveries,1);assert.equal(p.position.x,0);assert.equal(p.restore({x:900,y:0,z:0,yaw:0,pitch:0}),false);assert.equal(p.restore({x:1,y:0,z:1,yaw:1,pitch:1}),true);const b=player([{type:'cylinder',x:1,z:1,radius:1,minY:0,maxY:8,tag:'tree'}]);assert.equal(b.restore({x:1,y:0,z:1,yaw:0,pitch:0}),false);});
test('invalid/negative/large timestep cannot break position or explode movement',()=>{const p=player();p.step(input,NaN);p.step(input,-9);assert.equal(p.position.z,0);p.step(input,100000);assert(p.distance<=PLAYER_TUNING.walkSpeed*.1+1e-8);p.look(NaN,Infinity);assert.equal(p.yaw,0);});
test('scout moves toward visible player, attacks weakly and stops on real HP0',()=>{const d=new ScoutDrone(0,20,0),p={x:0,y:0,z:0};for(let i=0;i<100;i++)d.step(.1,p,()=>0);assert(d.position.z<20);assert(['following','attacking'].includes(d.state));let damage=0;for(let i=0;i<100;i++)damage+=d.step(.1,{x:0,y:0,z:d.position.z-3},()=>0);assert(damage>0);assert.equal(d.hit(8),true);assert.equal(d.hp,16);d.hit(16);assert.equal(d.state,'stopped');assert.equal(d.hit(8),false);assert.equal(d.step(.1,p,()=>0),0);assert.equal(d.hits,2);});
test('occluded enemy cannot attack and retreats to its leash origin',()=>{const d=new ScoutDrone(0,0,0);d.position.z=20;assert.equal(d.step(.1,{x:0,y:0,z:20},()=>0,false),0);assert.equal(d.state,'retreating');assert(d.position.z<20);});
test('raycast misses, hits and returns nearer physical cover instead of claiming a kill',()=>{const origin={x:0,y:1.6,z:0},direction={x:0,y:0,z:1},target={x:0,y:1.6,z:10};assert.equal(raySphere(origin,direction,target,1),9);assert.equal(raySphere(origin,{x:1,y:0,z:0},target,1),null);const wall={type:'aabb',minX:-2,maxX:2,minY:0,maxY:4,minZ:4,maxZ:5,tag:'wall'};assert.equal(obstructionDistance(origin,direction,100,[wall],terrain),4);assert(obstructionDistance(origin,{x:0,y:-.5,z:.866},100,[],terrain)<4);});
test('restored destroyed drone has stopped state and produces no fake hit',()=>{const d=new ScoutDrone(0,0,0,true);assert.equal(d.state,'stopped');assert.equal(d.hp,0);assert.equal(d.hit(8),false);assert.equal(COMBAT_TUNING.status,'PROVISIONAL');});
