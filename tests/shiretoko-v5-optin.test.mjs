import test from 'node:test';
import assert from 'node:assert/strict';
import {farCoastReliefV5,RELIEF_V5} from '../src/shiretoko-phase1/coast-relief-v5.ts';
import {ShiretokoTerrain,TERRAIN,coastDistance,rawHeight} from '../src/shiretoko-phase1/terrain.ts';

const coast=()=>0;
test('V5 smooths synthetic X and Z headwalls without a visual-only displacement',()=>{
 const xStep=(x,z)=>x>=0?195:-28, zStep=(x,z)=>z>=-2000?195:-28;
 const v=(b,x,z)=>farCoastReliefV5(x,z,b,coast);
 assert(Math.abs(v(xStep,0,-2000)-v(xStep,-20,-2000))<80);
 assert(Math.abs(v(zStep,0,-2000)-v(zStep,0,-2020))<80);
});
test('V5 leaves walkable border, outward far tail and masked coast untouched',()=>{
 const base=(x,z)=>103+Math.sin(x*.017)*21+z*.002;
 for(const z of [-6000,-5600,-1200,-800,0,850,1200])
   for(const x of [-2800,-1000,-170,0,990,2100])
     assert.equal(farCoastReliefV5(x,z,base,coast),base(x,z));
 let calls=0;
 const hit=(x,z)=>{calls++;return 73;};
 assert.equal(farCoastReliefV5(0,-2000,hit,()=>1400),73);
 assert.equal(calls,1);
});
test('V5 has finite deterministic 9-sample budget and handles invalid neighbours',()=>{
 let calls=0;
 const base=(x,z)=>{calls++;return x*.002+Math.cos(z*.002);};
 const a=farCoastReliefV5(0,-2100,base,coast);
 assert.equal(calls,RELIEF_V5.maxBaseSamplesPerVertex);
 assert.equal(a,farCoastReliefV5(0,-2100,base,coast));
 assert.equal(farCoastReliefV5(0,-2100,(x,z)=>x===140?NaN:73,coast),73);
});
test('default v4 and experimental V5 keep every 5m walkable height sample bit-identical',()=>{
 const v4=new ShiretokoTerrain(), v5=new ShiretokoTerrain('v5');
 assert.equal(v4.reliefProfile,'v4');assert.equal(v5.reliefProfile,'v5');
 assert.equal(v4.heights.byteLength,v5.heights.byteLength);
 assert(Buffer.from(v4.heights.buffer).equals(Buffer.from(v5.heights.buffer)));
 for(const [x,z] of [[-1200,-1200],[1200,-1200],[0,0],[-170,850],[1200,1200],[0,-1195],[-995,705]])
   assert.equal(v5.surfaceAt(x,z),v4.surfaceAt(x,z));
 assert.equal(TERRAIN.seed,431071);
});
test('opt-in distant profile changes actual height queries, while default remains v4',()=>{
 const v4=new ShiretokoTerrain(),v5=new ShiretokoTerrain('v5');
 let changed=null;
 for(const z of [-1800,-2600,-4200]){
   for(let x=-2750;x<=2750;x+=20){
     const d=coastDistance(x,z);
     if(d<-200||d>500)continue;
     const old=v4.surfaceAt(x,z),next=v5.surfaceAt(x,z);
     assert(Number.isFinite(old)&&Number.isFinite(next));
     assert.equal(old,rawHeight(x,z));
     if(Math.abs(next-old)>.05){changed={x,z,old,next};break;}
   }
   if(changed)break;
 }
 assert(changed,'V5 has no discoverable opt-in geometry change');
 const {x,z}=changed;
 const vertex=v5.vertexAt(x,z);
 assert.equal(vertex.y,v5.surfaceAt(x,z),'render surface and collision sample must share height');
 assert(vertex.normal.every(Number.isFinite));
});
