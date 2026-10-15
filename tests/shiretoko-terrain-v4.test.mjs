import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ShiretokoTerrain,coastDistance} from '../src/shiretoko-phase1/terrain.ts';
import {sceneryMesh,SCENERY,farCellDivisions} from '../src/shiretoko-phase1/scenery.ts';
import {auditMesh,meshSampler} from '../scripts/audit-shiretoko-mesh.mjs';
const t=new ShiretokoTerrain(),far=sceneryMesh(t,'far'),near=sceneryMesh(t,'near');
const hash=x=>createHash('sha256').update(Buffer.from(x.buffer,x.byteOffset,x.byteLength)).digest('hex');

test('v4 main 231361 heights and the full joined-row attributes remain bit identical to v3',()=>{
 assert.equal(hash(t.heights),'51bb4d91ae69f9f62abdc236317b093f2d40968eb274af13f8db292efabfaaf1');
 const row=[];for(let x=-3600;x<=3600;x+=20){const v=t.vertexAt(x,-4200);row.push(x,v.y,...v.normal,v.occlusion,v.wetness,v.exposure);}
 assert.equal(hash(new Float32Array(row)),'e6ba936a47c70689f82ca6efc2d565888ff285c88f9276faef1a59312048808b');
});

test('adaptive far mesh is one oriented manifold disk, with no interior holes, T junctions, overlaps or degenerates',()=>{
 const a=auditMesh(far,SCENERY.far);
 for(const k of ['invalid','wrongWinding','duplicateFaces','interiorOpenEdges','nonManifold','badOrientation'])assert.equal(a[k],0,k);
 assert.equal(a.projectedArea,a.expectedArea);assert.equal(a.eulerCharacteristic,1);assert.ok(a.minArea>0);
 assert.ok(a.triangles>22500&&a.triangles-22770<602448*.10,'Shore-only refinement stays below the initial +10% whole-scene budget');
});

test('all64 walking chunks and the20m near mesh have finite positively wound nondegenerate triangles',()=>{
 const entries=[[near,SCENERY.near]];for(let z=-4;z<4;z++)for(let x=-4;x<4;x++)entries.push([t.chunk(x,z),{x0:x*300,x1:(x+1)*300,z0:z*300,z1:(z+1)*300}]);
 for(const [mesh,bounds]of entries){const a=auditMesh(mesh,bounds);for(const k of ['invalid','wrongWinding','duplicateFaces','interiorOpenEdges','nonManifold','badOrientation'])assert.equal(a[k],0,k);assert.equal(a.projectedArea,a.expectedArea);assert.equal(a.eulerCharacteristic,1);}
});

test('every reused fine/coarse vertex has the same height, normal and material attributes, without display-only offset',()=>{
 for(let i=0;i<far.positions.length/3;i++){
  const [x,y,z]=far.positions.slice(i*3,i*3+3),v=t.vertexAt(x,z);assert.equal(y,Math.fround(v.y));
  assert.deepEqual(Array.from(far.normals.slice(i*3,i*3+3)),v.normal.map(Math.fround));
  for(const field of ['occlusion','wetness','exposure']){assert.equal(far[field][i],Math.fround(v[field]));assert.ok(far[field][i]>=0&&far[field][i]<=1);}
 }
});

test('5/20/80m join triangles share all actual 20m boundary segments and exact attribute bits',()=>{
 const at=(mesh,z)=>{const map=new Map();for(let i=0;i<mesh.positions.length/3;i++)if(mesh.positions[i*3+2]===z)map.set(mesh.positions[i*3],i);return map;};
 const a=at(near,-4200),b=at(far,-4200);
 for(let x=-3600;x<=3600;x+=20){const ai=a.get(x),bi=b.get(x);assert.notEqual(ai,undefined);assert.notEqual(bi,undefined);for(const f of ['positions','normals'])assert.deepEqual(Array.from(near[f].slice(ai*3,ai*3+3)),Array.from(far[f].slice(bi*3,bi*3+3)));for(const f of ['occlusion','wetness','exposure'])assert.equal(near[f][ai],far[f][bi]);}
});

test('shore refinement spans both 270/315 problem coasts and keeps the broad interior at80m',()=>{
 let fine=0,coarse=0;
 for(let z=-10200;z<-4200;z+=80)for(let x=-6000;x<6000;x+=80){const n=farCellDivisions(x,z);if(n===4)fine++;else coarse++;}
 assert.ok(fine>800&&fine<2000);assert.ok(coarse>fine*4,'Do not subdivide the whole distant world');
 for(const z of [-4400,-4800,-5200,-5800,-6200])for(const side of [-1,1]){
  let edge=0,best=Infinity;for(let x=-4000;x<=4000;x+=20)if(Math.sign(x)===side&&Math.abs(coastDistance(x,z))<best){best=Math.abs(coastDistance(x,z));edge=x;}
  assert.equal(farCellDivisions(Math.floor((edge+6000)/80)*80-6000,Math.floor((z+10200)/80)*80-10200),4);
 }
});

test('resolved coast is deterministic and its actual20m triangles distribute the former tall edge into a hillside',()=>{
 const again=sceneryMesh(t,'far');for(const f of ['positions','normals','occlusion','wetness','exposure','indices'])assert.equal(hash(far[f]),hash(again[f]));
 const sample=meshSampler(far,SCENERY.far);
 for(const z of [-4600,-5000,-5400,-5800,-6200])for(const side of [-1,1]){
  let edge=0,best=Infinity;for(let x=-4000;x<=4000;x++)if(Math.sign(x)===side&&Math.abs(coastDistance(x,z))<best){best=Math.abs(coastDistance(x,z));edge=x;}
  const y=Array.from({length:25},(_,i)=>sample(edge-side*(i*20-80),z)),full=y.at(-1);
  const maxStep=Math.max(...y.slice(1).map((v,i)=>Math.abs(v-y[i])));
  assert.ok(maxStep<full*.19,`Resolved physical coast at${edge},${z}: ${maxStep}/${full}`);
  assert.ok(y.filter(v=>v>full*.1&&v<full*.9).length>=6,'Rise crosses multiple actual cells');
 }
});
