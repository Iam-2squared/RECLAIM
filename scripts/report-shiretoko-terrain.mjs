import {ShiretokoTerrain,TERRAIN,ROUTE,LOCATIONS,BASINS,rawHeight} from '../src/shiretoko-phase1/terrain.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const v1=process.argv[2]?await import(pathToFileURL(resolve(process.argv[2])).href):null;
function inspect(Terrain,route,locations,basins) {
 const t=new Terrain();let min=Infinity,max=-Infinity;
 for(const y of t.heights){min=Math.min(min,y);max=Math.max(max,y);}
 let routeLength=0,maxSlope=0,water=0;
 for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],d=Math.hypot(a.x-b.x,a.z-b.z);routeLength+=d;for(let s=0;s<=d;s++){const x=a.x+(b.x-a.x)*s/d,z=a.z+(b.z-a.z)*s/d;maxSlope=Math.max(maxSlope,t.slopeAt(x,z));water+=Number(t.inWater(x,z));}}
 return {min,max,routeLength,maxRouteSlope:maxSlope,wetRouteSamples:water,locations:locations.map(p=>({...p,y:t.heightAt(p.x,p.z),slope:t.slopeAt(p.x,p.z),water:t.inWater(p.x,p.z)})),basins:basins.map(b=>({id:b.id,level:b.level,centreY:t.heightAt(b.x,b.z)})),cliffSections:[850,550,250,-400].map(z=>({z,values:Array.from({length:341},(_,i)=>{const x=-850+i*5;return[x,t.heightAt(x,z)];})}))};
}
const t=new ShiretokoTerrain(),w=new TerrainWalker(t);let ticks=0,maxGroundError=0;
for(const p of [...ROUTE.slice(1),...ROUTE.slice(0,-1).reverse()]){let count=0;while(Math.hypot(w.x-p.x,w.z-p.z)>.12&&count<6000){w.yaw=Math.atan2(-(p.x-w.x),-(p.z-w.z));w.step({forward:1,right:0,sprint:true,jump:false},1/60);ticks++;count++;maxGroundError=Math.max(maxGroundError,Math.abs(w.y-t.heightAt(w.x,w.z)));}if(count>=6000)throw new Error('Blocked route');}
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),contract:TERRAIN,v1:v1?inspect(v1.ShiretokoTerrain,v1.ROUTE,v1.LOCATIONS,v1.BASINS):null,v2:inspect(ShiretokoTerrain,ROUTE,LOCATIONS,BASINS),passage:{metres:w.distance,ticks,maxGroundError},sceneryPeakSamples:[[160,-1710],[350,-3000],[650,-5000],[-100,-6200]].map(([x,z])=>({x,z,y:rawHeight(x,z)}))};
const out=resolve('release/shiretoko-phase1-review');await mkdir(out,{recursive:true});await writeFile(resolve(out,'terrain-metrics.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,v1:report.v1?{...report.v1,cliffSections:undefined}:null,v2:{...report.v2,cliffSections:undefined}},null,2));
