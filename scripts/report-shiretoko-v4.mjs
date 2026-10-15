import {ShiretokoTerrain,coastDistance,rawHeight,TERRAIN,ROUTE,LOCATIONS,BASINS} from '../src/shiretoko-phase1/terrain.ts';
import {sceneryMesh,SCENERY,farCellDivisions} from '../src/shiretoko-phase1/scenery.ts';
import {TerrainWalker} from '../src/shiretoko-phase1/walker.ts';
import {auditMesh,meshSampler} from './audit-shiretoko-mesh.mjs';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]??'release/shiretoko-phase1-review/v4/metrics'),baseline='d8cbf4169f3f4d63708e63f860984eea865f43b8',temp=resolve(out,'baseline-source');
await mkdir(temp,{recursive:true});
for(const file of ['terrain.ts','scenery.ts'])await writeFile(resolve(temp,file),execFileSync('git',['show',`${baseline}:src/shiretoko-phase1/${file}`]));
const old=await import(pathToFileURL(resolve(temp,'terrain.ts')).href),oldScenery=await import(pathToFileURL(resolve(temp,'scenery.ts')).href);
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const start=performance.now(),terrain=new ShiretokoTerrain(),mainMs=performance.now()-start,t0=performance.now(),far=sceneryMesh(terrain,'far'),farMs=performance.now()-t0,near=sceneryMesh(terrain,'near');
const before=new old.ShiretokoTerrain(),oldFar=oldScenery.sceneryMesh(before,'far'),oldNear=oldScenery.sceneryMesh(before,'near');
assert.equal(hash(terrain.heights),hash(before.heights));const unchanged={main:{samples:terrain.heights.length,sha256:hash(terrain.heights),maxDelta:0},near:{}};
for(const field of ['positions','normals','occlusion','wetness','exposure','indices']){assert.equal(hash(near[field]),hash(oldNear[field]));unchanged.near[field]=hash(near[field]);}
const audit=auditMesh(far,SCENERY.far);assert.equal(audit.interiorOpenEdges,0);assert.equal(audit.invalid,0);assert.equal(audit.projectedArea,audit.expectedArea);
const chunkAudits=[],chunkHashes={};
for(const field of ['positions','normals','occlusion','wetness','exposure','indices'])chunkHashes[field]=[createHash('sha256'),createHash('sha256')];
for(let z=-4;z<4;z++)for(let x=-4;x<4;x++){
 const a=before.chunk(x,z),b=terrain.chunk(x,z),q=auditMesh(b,{x0:x*300,x1:(x+1)*300,z0:z*300,z1:(z+1)*300});
 for(const k of ['invalid','wrongWinding','duplicateFaces','interiorOpenEdges','nonManifold','badOrientation'])assert.equal(q[k],0);assert.equal(q.projectedArea,q.expectedArea);chunkAudits.push({cx:x,cz:z,...q});
 for(const field of Object.keys(chunkHashes)){for(const [i,mesh]of [a,b].entries())chunkHashes[field][i].update(Buffer.from(mesh[field].buffer,mesh[field].byteOffset,mesh[field].byteLength));}
}
unchanged.main.geometry={};for(const [field,pair]of Object.entries(chunkHashes)){const[a,b]=pair.map(h=>h.digest('hex'));assert.equal(a,b);unchanged.main.geometry[field]=b;}
const nearAudit=auditMesh(near,SCENERY.near);assert.equal(nearAudit.interiorOpenEdges,0);assert.equal(nearAudit.wrongWinding,0);
const percentile=(a,q)=>{a=a.slice().sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*q))]??0;};
function edgeStats(mesh,coast){
 const p=mesh.positions,seen=new Set(),vertical=[],slopes=[],normalAngles=[],largest=[];
 for(let i=0;i<mesh.indices.length;i+=3)for(let j=0;j<3;j++){
  const a=mesh.indices[i+j],b=mesh.indices[i+(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);
  const ai=a*3,bi=b*3,x=(p[ai]+p[bi])/2,z=(p[ai+2]+p[bi+2])/2,shore=coast(x,z);
  if(z<-6400||z>-4240||shore<-110||shore>440||Math.max(p[ai+1],p[bi+1])<0)continue;
  const dy=Math.abs(p[ai+1]-p[bi+1]),length=Math.hypot(p[ai]-p[bi],p[ai+2]-p[bi+2]),n=mesh.normals;
  const angle=Math.acos(Math.max(-1,Math.min(1,n[ai]*n[bi]+n[ai+1]*n[bi+1]+n[ai+2]*n[bi+2])))*180/Math.PI;
  vertical.push(dy);slopes.push(dy/length);normalAngles.push(angle);largest.push({a:Array.from(p.slice(ai,ai+3)),b:Array.from(p.slice(bi,bi+3)),verticalStep:dy,slope:dy/length,normalAngleDegrees:angle});
 }
 largest.sort((a,b)=>b.verticalStep-a.verticalStep);
 return{region:{z:[-6400,-4240],coastDistance:[-110,440]},edges:vertical.length,maxVerticalStep:Math.max(...vertical),p95VerticalStep:percentile(vertical,.95),maxSlope:Math.max(...slopes),p95Slope:percentile(slopes,.95),p95NormalAngleDegrees:percentile(normalAngles,.95),largestEdges:largest.slice(0,20)};
}
const samples=[meshSampler(oldFar,SCENERY.far),meshSampler(far,SCENERY.far)],sections=[];
for(const z of [-4360,-4600,-5000,-5400,-5800,-6200,-6800,-7600,-8400])for(const side of [-1,1]){
 const versions=[];
 for(let version=0;version<2;version++){
  const coast=version?coastDistance:old.coastDistance;let lo=side<0?-6000:0,hi=side<0?0:6000;
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if((coast(mid,z)>0)===(side>0))lo=mid;else hi=mid;}
  const edge=(lo+hi)/2,points=Array.from({length:41},(_,i)=>{const offset=i*20-160,x=edge-side*offset;return{x,z,offset,y:samples[version](x,z)};}),full=points.at(-1).y;
  versions.push({coastX:edge,fullHeight:full,max20mStep:Math.max(...points.slice(1).map((p,i)=>Math.abs(p.y-points[i].y))),intermediate20mSamples:points.filter(p=>p.y>full*.1&&p.y<full*.9).length,points});
 }
 sections.push({z,side,v3:versions[0],v4:versions[1]});
}
let modified=0,maxDelta=0,location=null,seabedChanged=0;
for(let z=-10200;z<=-4200;z+=20)for(let x=-6000;x<=6000;x+=20){const a=old.rawHeight(x,z),b=rawHeight(x,z),d=Math.abs(a-b);if(d>1e-9){modified++;if(a<0&&b<0)seabedChanged++;}if(d>maxDelta){maxDelta=d;location=[x,z,a,b];}}
let fine=0,coarse=0;for(let z=-10200;z<-4200;z+=80)for(let x=-6000;x<6000;x+=80)farCellDivisions(x,z)===4?fine++:coarse++;
const walker=new TerrainWalker(terrain);let ticks=0,error=0,waterTicks=0;
for(const p of [...ROUTE.slice(1),...ROUTE.slice(0,-1).reverse()]){let n=0;while(Math.hypot(walker.x-p.x,walker.z-p.z)>.12&&n<6000){walker.yaw=Math.atan2(-(p.x-walker.x),-(p.z-walker.z));walker.step({forward:1,right:0,sprint:true,jump:false},1/60);ticks++;n++;error=Math.max(error,Math.abs(walker.y-terrain.heightAt(walker.x,walker.z)));waterTicks+=Number(terrain.inWater(walker.x,walker.z));}assert.ok(n<6000);}
assert.equal(ticks,42791);assert.ok(Math.abs(walker.distance-4136.463333335633)<1e-6);assert.equal(error,0);assert.equal(waterTicks,0);
const additional=far.indices.length/3-oldFar.indices.length/3,report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),treeState:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()?'dirty':'clean',baseline,contract:TERRAIN,unchanged,locations:LOCATIONS.map(p=>({...p,y:terrain.heightAt(p.x,p.z)})),waterLevels:BASINS.map(b=>b.level),route:ROUTE,audit,nearAudit,chunkAudits,refinement:{coarseBaseCells:coarse,fineBaseCells:fine,coastalCell:20,interiorCell:80,additionalTriangles:additional,initialSceneV3:602448,initialSceneV4:602448+additional,increasePercent:additional/602448*100,drawCallsV3:74,drawCallsV4:74,options:[{method:'uniform40m far grid',lowerBoundTriangles:90000,note:'before seam stitches; >10% total increase'},{method:'uniform20m far grid',lowerBoundTriangles:360000,note:'unneeded interior/seabed detail; ~56% whole-scene increase'},{method:'adaptive20m coastal strip in80m grid',triangles:far.indices.length/3,note:'selected; one mesh/draw, shared vertices and centre-fan transitions'}]},edgeComparison:{v3:edgeStats(oldFar,old.coastDistance),v4:edgeStats(far,coastDistance)},sections,changeBounds:{intentional:'Only far z<-4240. Main2.4km/near20m/full20-80join unchanged; old17m shore ripple filtered and60m component attenuated offshore. Underwater floor changes included.',sampledStep:20,samplesModified:modified,seabedSamplesModified:seabedChanged,maxHeightDelta:maxDelta,maxHeightDeltaAt:location},passage:{metres:walker.distance,ticks,maxGroundError:error,waterTicks,teleports:0,simulationHz:60,humanRealtimeWalk:false},cpu:{mainMs,farMeshMs:farMs,note:'One Node CPU sample, not physical GPU/FPS'},limits:['Visual acceptance requires reviewing images, not numeric edge metrics.','No plants, buildings, boardwalk, PBR or true overhang/cave.','No physical Windows GPU/VRAM/FPS measured.','No TITLE/HOME/mobile/gameplay/save integration.']};
await writeFile(resolve(out,'mesh-lod-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({source:report.source,audit,refinement:report.refinement,edgeComparison:{v3:report.edgeComparison.v3.maxVerticalStep,v4:report.edgeComparison.v4.maxVerticalStep},passage:report.passage}));
