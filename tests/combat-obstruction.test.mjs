import {test} from 'node:test';
import assert from 'node:assert/strict';
import {obstructionDistance} from '../src/mission/combat.ts';

// Frozen pre-optimization behavior: scalar broadphase must preserve all results.
function reference(origin,direction,range,colliders,terrain){
 let result=range;
 for(const c of colliders){
  const bounds=c.type==='aabb'?c:{minX:c.x-c.radius,maxX:c.x+c.radius,minZ:c.z-c.radius,maxZ:c.z+c.radius,minY:c.minY,maxY:c.maxY};let lo=0,hi=result;
  for(const[o,d,min,max]of[[origin.x,direction.x,bounds.minX,bounds.maxX],[origin.y,direction.y,bounds.minY,bounds.maxY],[origin.z,direction.z,bounds.minZ,bounds.maxZ]]){
   if(Math.abs(d)<1e-8){if(o<min||o>max){hi=-1;break;}}else{let a=(min-o)/d,b=(max-o)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);}
  }
  if(hi>=lo&&lo>=0)result=Math.min(result,lo);
 }
 for(let t=.35;t<result;t+=.45)if(origin.y+direction.y*t<terrain.heightAt(origin.x+direction.x*t,origin.z+direction.z*t)+.03){result=t;break;}
 return result;
}

test('allocation-free obstruction matches prior nearest-cover and terrain results for seeded rays',()=>{
 let seed=101;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const colliders=Array.from({length:240},(_,i)=>{const x=random()*160-80,z=random()*160-80,r=.2+random()*4,minY=random()*6-2,maxY=minY+random()*8+.1;return i%2?{type:'cylinder',x,z,radius:r,minY,maxY,tag:'test'}:{type:'aabb',minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r,minY,maxY,tag:'test'};});
 const terrain={heightAt:(x,z)=>Math.sin(x*.06)*2+Math.cos(z*.07)};
 for(let i=0;i<700;i++){const origin={x:random()*100-50,y:random()*12,z:random()*100-50},direction={x:random()-.5,y:random()-.5,z:random()-.5};if(i%7===0)direction.x=0;if(i%11===0)direction.y=1e-10;if(i%13===0)direction.z=0;const n=Math.hypot(direction.x,direction.y,direction.z)||1;for(const axis of['x','y','z'])direction[axis]/=n;const range=random()*100;assert.equal(obstructionDistance(origin,direction,range,colliders,terrain),reference(origin,direction,range,colliders,terrain));}
});

test('inside cover, parallel boundaries and obstacles behind the ray retain exact semantics',()=>{
 const colliders=[{type:'aabb',minX:-1,maxX:1,minY:0,maxY:3,minZ:-1,maxZ:1,tag:'wall'}],terrain={heightAt:()=>-100};
 for(const origin of[{x:0,y:1,z:0},{x:1,y:1,z:-5},{x:2,y:1,z:-5},{x:0,y:4,z:0}])for(const direction of[{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:1,y:0,z:0}])assert.equal(obstructionDistance(origin,direction,30,colliders,terrain),reference(origin,direction,30,colliders,terrain));
});
