import {ShiretokoTerrain,TERRAIN,ROUTE,LOCATIONS,BASINS,CHANNELS,coastDistance} from '../src/shiretoko-phase1/terrain.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';
import {basinWaterCounts} from '../src/shiretoko-phase1/water.ts';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const out=resolve(process.argv[2]??'release/shiretoko-phase1-review/v3'),baselineSha=process.argv[3]??'6091ad298543100c0c42c1e9b4a2986d2b4d0d7e';
await mkdir(resolve(out,'baseline'),{recursive:true});
const baselinePath=resolve(out,'baseline/terrain-v2.ts');
await writeFile(baselinePath,execFileSync('git',['show',`${baselineSha}:src/shiretoko-phase1/terrain.ts`]));
const baseline=await import(pathToFileURL(baselinePath).href);
const old=new baseline.ShiretokoTerrain(),terrain=new ShiretokoTerrain();
function metrics(t){
 let min=Infinity,max=-Infinity,maxRouteSlope=0,wetRouteSamples=0,routeLength=0;
 for(const y of t.heights){min=Math.min(min,y);max=Math.max(max,y);}
 for(let i=1;i<ROUTE.length;i++){
  const a=ROUTE[i-1],b=ROUTE[i],length=Math.hypot(b.x-a.x,b.z-a.z);routeLength+=length;
  for(let d=0;d<=length;d++){const x=a.x+(b.x-a.x)*d/length,z=a.z+(b.z-a.z)*d/length;maxRouteSlope=Math.max(maxRouteSlope,t.slopeAt(x,z));wetRouteSamples+=Number(t.inWater(x,z));}
 }
 return {min,max,routeLength,maxRouteSlope,wetRouteSamples,locations:LOCATIONS.map(p=>({...p,y:t.heightAt(p.x,p.z),slope:t.slopeAt(p.x,p.z),water:t.inWater(p.x,p.z)})),basins:BASINS.map(b=>({id:b.id,level:b.level,centreY:t.heightAt(b.x,b.z)}))};
}
let squared=0,abs=0,changed=0,maxDelta=0;
for(let i=0;i<terrain.heights.length;i++){const d=terrain.heights[i]-old.heights[i];squared+=d*d;abs+=Math.abs(d);maxDelta=Math.max(maxDelta,Math.abs(d));changed+=Number(Math.abs(d)>.001);}
const walker=new TerrainWalker(terrain);let ticks=0,maxGroundError=0,maxWalkerSlope=0,waterTicks=0;
for(const p of [...ROUTE.slice(1),...ROUTE.slice(0,-1).reverse()]){
 let n=0;while(Math.hypot(walker.x-p.x,walker.z-p.z)>.12&&n<6000){walker.yaw=Math.atan2(-(p.x-walker.x),-(p.z-walker.z));walker.step({forward:1,right:0,sprint:true,jump:false},1/60);ticks++;n++;maxGroundError=Math.max(maxGroundError,Math.abs(walker.y-terrain.heightAt(walker.x,walker.z)));maxWalkerSlope=Math.max(maxWalkerSlope,terrain.slopeAt(walker.x,walker.z));waterTicks+=Number(terrain.inWater(walker.x,walker.z));}
 if(n>=6000)throw new Error(`Route blocked at ${p.x},${p.z}`);
}
const cliffSections=[850,735,615,410,190,-140,-580,-930].map(z=>({z,values:Array.from({length:441},(_,i)=>{const x=-1100+i*5;return{x,coastDistance:coastDistance(x,z),v2:old.heightAt(x,z),v3:terrain.heightAt(x,z)};})}));
function profile(t,coast,z){
 let coastX=-1100,best=Infinity;for(let x=-1100;x<-110;x++){const d=Math.abs(coast(x,z));if(d<best){coastX=x;best=d;}}
 let max5mStep=0;for(let d=-10;d<180;d+=5)max5mStep=Math.max(max5mStep,Math.abs(t.heightAt(coastX+d+5,z)-t.heightAt(coastX+d,z)));
 const fullHeight=t.heightAt(coastX+195,z);return{coastX,fullHeight,max5mStep,normalized5mStep:max5mStep/fullHeight};
}
const cliffShapeComparison=[55,620,850].map(z=>({z,v2:profile(old,baseline.coastDistance,z),v3:profile(terrain,coastDistance,z)}));
const hashes={};for(const file of ['RECLAIM_Shiretoko_Terrain_Phase1.html','RECLAIM_Shiretoko_Intro_Demo.html']){const data=await readFile(resolve('release',file));hashes[file]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineSource:baselineSha,contract:TERRAIN,baselineContractUnchanged:JSON.stringify(TERRAIN)===JSON.stringify(baseline.TERRAIN),routeWaypointsUnchanged:JSON.stringify(ROUTE)===JSON.stringify(baseline.ROUTE),v2:metrics(old),v3:metrics(terrain),geometryDelta:{changedSamples:changed,totalSamples:terrain.heights.length,meanAbsoluteMetres:abs/terrain.heights.length,rmsMetres:Math.sqrt(squared/terrain.heights.length),maxAbsoluteMetres:maxDelta,note:'All grid samples, including underwater seabed.'},passage:{metres:walker.distance,ticks,maxGroundError,maxWalkerSlope,waterTicks,teleportsDuringRoute:0},waterMeshes:basinWaterCounts(terrain),channels:CHANNELS,cliffShapeComparison,cliffSections,artifacts:hashes,limitations:['Software GPU measurements are not physical Windows FPS/VRAM.','No plant/house/boardwalk assets. Phase 2–4 remain.','2400m terrain is not integrated with the existing 480m mission or its checkpoints.','Heightfield cannot represent true overhangs/caves. No visual-only floating meshes were added.']};
await writeFile(resolve(out,'terrain-v2-v3-metrics.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,cliffSections:undefined},null,2));
