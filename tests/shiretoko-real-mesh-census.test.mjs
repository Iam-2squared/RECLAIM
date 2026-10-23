import test from 'node:test';
import assert from 'node:assert/strict';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {sceneryMesh} from '../src/shiretoko-phase1/scenery.ts';
import {auditTerrainMeshes,auditTerrainSeam} from '../src/shiretoko-phase1/terrain-mesh-census.ts';

const wrap=(name,data)=>({name,positions:data.positions,normals:data.normals,indices:data.indices});
const seam=(z,xMin,xMax)=>({z,xMin,xMax});

test('actual PR #6 5m walker meshes and 20/80m scenery agree with ground and winding',()=>{
 const terrain=new ShiretokoTerrain();
 const near=wrap('near',sceneryMesh(terrain,'near'));
 const far=wrap('far',sceneryMesh(terrain,'far'));
 const chunks=[];
 for(let z=-4;z<4;z++)for(let x=-4;x<4;x++)chunks.push(wrap('walk/'+x+'/'+z,terrain.chunk(x,z)));
 const report=auditTerrainMeshes([...chunks,near,far],(x,z)=>terrain.surfaceAt(x,z));
 assert(report.vertices>231361&&report.triangles>600000);
 assert.deepEqual(report.issues,[],JSON.stringify(report.issues.slice(0,6)));
 assert(report.pass);
});
test('actual 20/80m coast join has identical indexed seam segments and elevation',()=>{
 const terrain=new ShiretokoTerrain();
 const a=wrap('20m',sceneryMesh(terrain,'near')),b=wrap('80m',sceneryMesh(terrain,'far'));
 const report=auditTerrainSeam([a],[b],seam(-4200,-3600,3600));
 assert.equal(report.pass,true,JSON.stringify(report.issues.slice(0,7)));
 assert.equal(report.leftSegments,360);
 assert.equal(report.rightSegments,360);
});
test('actual 5/20m walker-to-near join is not a visual-only T junction',()=>{
 const terrain=new ShiretokoTerrain();
 const near=wrap('20m',sceneryMesh(terrain,'near'));
 const chunks=Array.from({length:8},(_,i)=>wrap('walker/'+i,terrain.chunk(i-4,-4)));
 const report=auditTerrainSeam([near],chunks,seam(-1200,-1200,1200));
 assert.equal(report.pass,true,JSON.stringify(report.issues.slice(0,7)));
 assert.equal(report.leftSegments,480);
 assert.equal(report.rightSegments,480);
});
test('synthetic T junction, contact drift, reverse winding and invalid indices fail closed',()=>{
 const m=(name,v,f)=>({name,positions:new Float32Array(v),indices:new Uint32Array(f)});
 const left=m('left',[0,0,0,20,0,0,0,0,-10,20,0,-10],[0,2,1,1,2,3]);
 const right=m('right',[0,0,0,10,0,0,20,0,0,0,0,10,10,0,10,20,0,10],[0,1,3,1,4,3,1,2,4,2,5,4]);
 const seamResult=auditTerrainSeam([left],[right],seam(0,0,20));
 assert(seamResult.issues.some(e=>e.kind==='missing-edge'));
 const wrong=m('wrong',[0,3,0,20,3,0,0,3,10],[0,2,1]);
 const result=auditTerrainMeshes([wrong],()=>0);
 assert(result.issues.some(e=>e.kind==='ground'));
 assert(result.issues.some(e=>e.kind==='winding'));
 assert.throws(()=>auditTerrainSeam([left],[right],seam(0,20,0)),RangeError);
});
