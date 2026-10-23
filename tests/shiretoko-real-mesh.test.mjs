import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {ShiretokoTerrain,coastDistance} from '../src/shiretoko-phase1/terrain.ts';
import {sceneryMesh,SCENERY} from '../src/shiretoko-phase1/scenery.ts';

/**
 * Real, currently generated 5 / 20 / 80m mesh audit. Every reported vertex and
 * triangle comes from the production terrain generator, NOT synthetic fixtures.
 * This runs on a development branch and does not modify campaign or saves.
 */
const terrain=new ShiretokoTerrain();
const near=sceneryMesh(terrain,'near');
const far=sceneryMesh(terrain,'far');
const main=Array.from({length:8},(_,i)=>terrain.chunk(i-4,-4));
const meshes=[{name:'20m-near',data:near},{name:'80m-far',data:far},
  ...main.map((data,i)=>({name:'5m-main-'+(i-4),data}))];
const report={
  source:'Real ShiretokoTerrain / sceneryMesh / chunk, exact generated geometry',
  nearBounds:SCENERY.near,farBounds:SCENERY.far,
  sampleCount:0,triangleCount:0,geometryErrors:[],seams:[],
  gradeSamples:[],status:'not-yet-verified',
};
const key=n=>Number(n.toFixed(4));
function edgeMap(mesh,z,xMin,xMax){
  const edge=new Map(),p=mesh.positions,ind=mesh.indices,eps=.0001;
  for(let t=0;t<ind.length;t+=3){
    for(let k=0;k<3;k++){
      const a=ind[t+k]*3,b=ind[t+(k+1)%3]*3;
      if(Math.abs(p[a+2]-z)>eps||Math.abs(p[b+2]-z)>eps)continue;
      const ax=p[a],bx=p[b];
      if(Math.abs(ax-bx)<eps)continue;
      const lo=Math.min(ax,bx),hi=Math.max(ax,bx);
      if(lo<xMin-eps||hi>xMax+eps)continue;
      const id=String(key(lo))+':'+String(key(hi));
      const heights=ax<bx?[p[a+1],p[b+1]]:[p[b+1],p[a+1]];
      if(edge.has(id))throw new Error('duplicate segment inside same mesh '+id);
      edge.set(id,heights);
    }
  }
  return edge;
}
function assertPhysicalSeam(label,bands,z,xMin,xMax,step){
  const maps=bands.map(group=>{
    const combined=new Map();
    for(const m of group)for(const [segment,heights] of edgeMap(m,z,xMin,xMax)){
      assert(!combined.has(segment),'duplicate '+label+' segment '+segment);
      combined.set(segment,heights);
    }
    return combined;
  });
  const [A,B]=maps;let missing=0,heightsDifferent=0;
  for(const [segment,ay] of A){
    const by=B.get(segment);
    if(!by){missing++;continue;}
    if(Math.max(Math.abs(ay[0]-by[0]),Math.abs(ay[1]-by[1]))>.005)heightsDifferent++;
  }
  for(const segment of B.keys())if(!A.has(segment))missing++;
  const expected=Math.round((xMax-xMin)/step);
  const record={label,z,xMin,xMax,expected,sideA:A.size,sideB:B.size,
    missing,heightsDifferent,pass:A.size===expected&&B.size===expected&&missing===0&&heightsDifferent===0};
  report.seams.push(record);
  assert.equal(record.pass,true,label+' actual seam segments mismatch: '+JSON.stringify(record));
}
function meshVerticesAndTriangles(){
  for(const {name,data} of meshes){
    const {positions:p,indices:ids,normals}=data;
    assert.equal(p.length%3,0,name+' invalid positions');
    assert.equal(ids.length%3,0,name+' invalid triangle indices');
    assert.equal(normals.length,p.length,name+' invalid normals');
    const n=p.length/3;
    for(let i=0;i<n;i++){
      const x=p[3*i],y=p[3*i+1],z=p[3*i+2];
      assert([x,y,z].every(Number.isFinite),name+' nonfinite vertex '+i);
      assert(Math.abs(terrain.surfaceAt(x,z)-y)<.005,name+' rendered surface != ground '+i);
      const normalLength=Math.hypot(normals[3*i],normals[3*i+1],normals[3*i+2]);
      assert(Number.isFinite(normalLength)&&Math.abs(normalLength-1)<.05,
        name+' invalid normal '+i);
      report.sampleCount++;
    }
    for(let t=0;t<ids.length;t+=3){
      const a=ids[t],b=ids[t+1],c=ids[t+2];
      assert(a<n&&b<n&&c<n,name+' invalid index '+t);
      const ax=p[a*3],az=p[a*3+2],bx=p[b*3],bz=p[b*3+2],cx=p[c*3],cz=p[c*3+2];
      const area=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
      assert(Number.isFinite(area)&&Math.abs(area)>1e-5,name+' degenerate triangle '+t);
      report.triangleCount++;
    }
  }
}
test('generated PR terrain uses the SAME physical height for each mesh vertex',()=>{
  meshVerticesAndTriangles();
  assert(report.sampleCount>40000);
  assert(report.triangleCount>40000);
});
test('5m walker mesh and 20m scenery have fully matched physical seam',()=>{
  assertPhysicalSeam('5m/20m', [main,[near]],-1200,-1200,1200,5);
});
test('20m and 80m scenery have fully matched physical shore join',()=>{
  assertPhysicalSeam('20m/80m',[[near],[far]],-4200,-3600,3600,20);
});
test('report real unresolved coast grades without treating artificial fog as repair',async()=>{
  const findings=[];
  const ranges=[[-4500,-4200],[-5800,-4200],[-1200,-1090]];
  for(const [z0,z1] of ranges){
    let worst={rise:0,grade:0,x:0,z:0,coastDistance:0};
    for(let z=z0;z<=z1;z+=20)for(let x=-3400;x<=3400;x+=20){
      const y=terrain.surfaceAt(x,z),yn=terrain.surfaceAt(x,z+20),ye=terrain.surfaceAt(x+20,z);
      const rise=Math.max(Math.abs(y-yn),Math.abs(y-ye));
      if(rise>worst.rise)worst={rise,grade:rise/20,x,z,coastDistance:coastDistance(x,z)};
    }
    findings.push({z0,z1,...worst});
  }
  report.gradeSamples=findings;
  report.status='mesh-ground-and-seams-tested; visual-grade-residuals-require-review';
  await mkdir('release/shiretoko-phase1-review/real-mesh',{recursive:true});
  await writeFile('release/shiretoko-phase1-review/real-mesh/actual-mesh-census.json',JSON.stringify(report,null,2));
  for(const item of findings)assert(Number.isFinite(item.grade));
  console.log(JSON.stringify({vertices:report.sampleCount,triangles:report.triangleCount,seams:report.seams,grades:findings}));
});
