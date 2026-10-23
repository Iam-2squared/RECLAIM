import test from 'node:test';
import assert from 'node:assert/strict';
import { DroneImpactBridge, DAMAGE_BRIDGE_LIMITS } from '../src/mission/drone-impact-bridge.ts';

const target=()=>({id:'scout',hp:10000,hits:0,hit(damage){if(this.hp<=0)return false;this.hp-=damage;this.hits++;return true;}});
const frame=(...ids)=>({impacts:ids.map(projectileId=>({projectileId,owner:'player',damage:1,impact:{material:'drone',targetId:'scout'}}))});
const apply=(bridge,t,...ids)=>bridge.apply(frame(...ids),t,()=>{});

test('late out-of-order impacts do not evict a still-valid high projectile receipt',()=>{
 const b=new DroneImpactBridge(),t=target();
 assert.equal(apply(b,t,1000).acceptedHits,1);
 for(let id=745;id<=999;id++)assert.equal(apply(b,t,id).acceptedHits,1);
 assert.equal(apply(b,t,1001).acceptedHits,1);
 const replay=apply(b,t,1000);
 assert.equal(replay.acceptedHits,0);
 assert.equal(replay.absorbed,1);
 assert.equal(t.hits,257);
});

test('numeric replay window has an inclusive lower cutoff',()=>{
 const b=new DroneImpactBridge(),t=target();
 apply(b,t,1000);apply(b,t,1256);
 assert.equal(apply(b,t,1000).acceptedHits,0);
 assert.equal(apply(b,t,1255).acceptedHits,1);
 assert.equal(apply(b,t,1255).acceptedHits,0);
 assert.equal(t.hits,3);
});

test('large sparse jumps and encounter reset keep the receipt bound',()=>{
 const b=new DroneImpactBridge(),t=target();
 apply(b,t,1);apply(b,t,100000);
 assert.equal(apply(b,t,1).acceptedHits,0);
 assert.equal(apply(b,t,99999).acceptedHits,1);
 assert.equal(apply(b,t,99999).acceptedHits,0);
 b.reset();assert.equal(apply(b,t,1).acceptedHits,1);
 assert.equal(DAMAGE_BRIDGE_LIMITS.maxSeen,256);
});
