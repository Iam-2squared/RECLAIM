import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionProjectilePipeline } from '../src/mission/projectile-pipeline.ts';
import { DroneImpactBridge } from '../src/mission/drone-impact-bridge.ts';
import { WeaponFeedback, DroneCrashRig, FEEDBACK_LIMITS } from '../src/mission/feedback.ts';
import { PROJECTILE_RULES } from '../src/mission/ballistics.ts';

const wall = {id:'warehouse-wall',material:'metal',bounds:{minX:-.8,maxX:.8,minY:0,maxY:3,minZ:2.8,maxZ:3.2}};
const enemy = () => ({id:'scout',hp:100,hits:0,hit(damage) {if(this.hp<=0)return false;this.hp=Math.max(0,this.hp-damage);this.hits++;return true;}});
const world=(covered)=>({solids:covered?[wall]:[],drone:{id:'scout',center:{x:0,y:2,z:6},radius:.55},heightAt:()=>-10});
const launch=(pipeline,feedback)=>{const id=pipeline.fire({x:0,y:2,z:0},{x:0,y:0,z:1},{owner:'player',weapon:'assault',damage:25});assert(id!==null);feedback.fire('assault');return id;};
function runUntilImpact(pipeline,worldState){
 const frames=[],impacts=[];
 for(let i=0;i<240;i++){
  const frame=pipeline.tick(worldState,PROJECTILE_RULES.fixedStep);
  frames.push(frame);
  impacts.push(...frame.impacts);
  if(impacts.length||frame.expirations.length)break;
 }
 return {frames,impacts};
}

test('actual path: wall blocks damage and displayed final tracer has the exact contact point',()=>{
 const pipe=new MissionProjectilePipeline(),motion=new WeaponFeedback(),bridge=new DroneImpactBridge(),d=enemy();
 launch(pipe,motion);
 assert(motion.pose.rear>0&&motion.pose.rear<=FEEDBACK_LIMITS.maxRear);
 const {frames,impacts}=runUntilImpact(pipe,world(true));
 assert.equal(impacts.length,1);assert.equal(impacts[0].impact.material,'metal');
 const final=frames.at(-1).tracer.find(t=>t.projectileId===impacts[0].projectileId&&t.terminal);
 assert(final);assert.deepEqual(final.to,impacts[0].impact.point);
 assert.deepEqual(final.to,impacts[0].to);
 const result=bridge.apply(frames.at(-1),d,()=>{throw new Error('wall shot must not defeat enemy');});
 assert.equal(result.acceptedHits,0);assert.equal(d.hp,100);assert.equal(pipe.active,0);
});

test('four legitimate drone impacts trigger one defeat and a settled, non-bouncing crash',()=>{
 const pipe=new MissionProjectilePipeline(),motion=new WeaponFeedback(),bridge=new DroneImpactBridge(),crash=new DroneCrashRig(),d=enemy();
 let defeated=0;
 for(let k=0;k<4;k++){
  launch(pipe,motion);
  const {frames,impacts}=runUntilImpact(pipe,world(false));
  assert.equal(impacts.length,1);assert.equal(impacts[0].impact.material,'drone');
  const last=frames.at(-1);
  const res=bridge.apply(last,d,()=>defeated++);
  assert.equal(res.acceptedHits,1);
  assert.equal(bridge.apply(last,d,()=>defeated++).acceptedHits,0,'duplicate frame must not injure again');
  motion.step(PROJECTILE_RULES.fixedStep);
 }
 assert.equal(d.hp,0);assert.equal(defeated,1);assert.equal(d.hits,4);
 let prev=2.5,pose;
 for(let i=0;i<220;i++){
  pose=crash.step(1/60,2.5,0);
  assert(pose.y<=prev+1e-9,'wreck must not move upward while falling');
  assert(pose.y>=.25);prev=pose.y;
 }
 assert(pose.settled);assert.equal(pose.y,.25);assert(pose.bank>=0&&pose.bank<=.95);
 assert.deepEqual(crash.step(1/60,2.5,0),pose,'settled wreck remains motionless');
 pipe.clear();motion.clear();crash.reset();bridge.reset();
 assert.equal(pipe.active,0);assert.equal(pipe.pendingReceipts,0);assert.equal(motion.pose.rear,0);
 assert.equal(crash.step(1/60,2.5,0).settled,false,'new attempt resets the wreck');
});
