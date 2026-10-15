import test from 'node:test';
import assert from 'node:assert/strict';
import {ShiretokoTerrain,TERRAIN,ROUTE,LOCATIONS,BASINS,CHANNELS,coastDistance} from '../src/shiretoko-phase1/terrain.ts';
import {sceneryMesh} from '../src/shiretoko-phase1/scenery.ts';
import {basinWaterMesh} from '../src/shiretoko-phase1/water.ts';
const terrain=new ShiretokoTerrain();

test('v3 retains the seed, metre/grid/chunk contract, authored waypoints and all five water levels',()=>{
  assert.deepEqual(TERRAIN,{extent:1200,cell:5,chunk:300,seed:431071,sea:0});
  assert.deepEqual(LOCATIONS.map(p=>[p.x,p.z]),[[-170,850],[-130,410],[-140,-310],[170,-850]]);
  assert.deepEqual(BASINS.map(b=>b.level),[90,92,90.5,113,149]);
  assert.equal(ROUTE.length,18);assert.deepEqual(ROUTE[0],{x:-170,z:850,y:108});assert.deepEqual(ROUTE.at(-1),{x:170,z:-850,y:335});
  for(let z=830;z<=870;z+=5)for(let x=-190;x<=-150;x+=5)assert.equal(terrain.heightAt(x,z),108);
});

test('PBR-ready exposure, wetness and occlusion are finite and identical across all chunk joins',()=>{
  const attributes=['occlusion','wetness','exposure'];
  const chunks=new Map();for(let z=-4;z<4;z++)for(let x=-4;x<4;x++)chunks.set(`${x},${z}`,terrain.chunk(x,z));
  for(let z=-4;z<4;z++)for(let x=-4;x<4;x++){
    const a=chunks.get(`${x},${z}`),side=61;
    for(const field of attributes)for(const value of a[field])assert.ok(Number.isFinite(value)&&value>=0&&value<=1,`${field}: ${value}`);
    if(x<3){const b=chunks.get(`${x+1},${z}`);for(let row=0;row<side;row++)for(const field of attributes)assert.equal(a[field][row*side+60],b[field][row*side]);}
    if(z<3){const b=chunks.get(`${x},${z+1}`);for(let col=0;col<side;col++)for(const field of attributes)assert.equal(a[field][60*side+col],b[field][col]);}
  }
});

test('the 5/20/80m scenery interfaces share exposure as well as geometric normals; outer faces are submerged',()=>{
  for(const [band,z,extent,step] of [['near',-1200,1200,5],['far',-4200,3600,20]]){
    const mesh=sceneryMesh(terrain,band),joined=new Map();
    for(const i of new Set(mesh.indices))if(mesh.positions[i*3+2]===z)joined.set(mesh.positions[i*3],i);
    for(let x=-extent;x<=extent;x+=step){const i=joined.get(x);assert.notEqual(i,undefined);assert.equal(mesh.exposure[i],Math.fround(terrain.vertexAt(x,z).exposure));}
    for(let i=0;i<mesh.positions.length;i+=3){
      const x=mesh.positions[i],height=mesh.positions[i+1],pz=mesh.positions[i+2];
      if(Math.abs(x)>=(band==='near'?3600:6000)||pz<=(band==='near'?-4200:-10200)){
        // Near's back row is joined to far, not an exposed perimeter.
        if(band==='near'&&pz===-4200&&Math.abs(x)<3600)continue;
        assert.ok(height<-20,`Exposed end at ${x},${pz}`);
      }
    }
  }
});

test('all lake and pond water polygons clip against actual rendered triangles instead of an unrelated ellipse',()=>{
  for(const basin of BASINS){
    const mesh=basinWaterMesh(terrain,basin);assert.ok(mesh.indices.length>100);
    for(let i=0;i<mesh.positions.length;i+=3){
      const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2];
      assert.equal(y,basin.level);
      assert.ok(terrain.heightAt(x,z)<=basin.level+.0002,`Water floats over bank ${basin.id}: ${x},${z}`);
    }
    for(let i=0;i<mesh.indices.length;i+=3){
      const [a,b,c]=mesh.indices.slice(i,i+3).map(v=>v*3);
      const x=(mesh.positions[a]+mesh.positions[b]+mesh.positions[c])/3,z=(mesh.positions[a+2]+mesh.positions[b+2]+mesh.positions[c+2])/3;
      assert.ok(terrain.heightAt(x,z)<=basin.level+.0002);
      const winding=(mesh.positions[b+2]-mesh.positions[a+2])*(mesh.positions[c]-mesh.positions[a])-(mesh.positions[b]-mesh.positions[a])*(mesh.positions[c+2]-mesh.positions[a+2]);
      assert.ok(winding>=-.0001,'Water triangle points upward');
    }
  }
});

test('watercourse points flow downhill and keep a resolved dry clearance around every route segment',()=>{
  for(const c of CHANNELS){
    assert.ok(c.points.length>=10,'A meander is resolved by several non-collinear points');
    for(let i=1;i<c.points.length;i++)assert.ok(c.points[i].y<=c.points[i-1].y);
  }
  for(let i=1;i<ROUTE.length;i++){
    const a=ROUTE[i-1],b=ROUTE[i],length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
    for(let d=5;d<length-5;d+=5)for(const side of [-2,0,2]){
      const x=a.x+(b.x-a.x)*d/length+nx*side,z=a.z+(b.z-a.z)*d/length+nz*side;
      assert.ok(!terrain.inWater(x,z),`Dry 4m route width at ${x},${z}`);
      assert.ok(terrain.slopeAt(x,z)<.85,`Walkable 4m route width at ${x},${z}`);
    }
  }
});

test('coastal rock profiles vary by sector and have real shelves beneath the large headwall',()=>{
  const signatures=[];
  for(const z of [850,735,615,410,190,-140,-580,-930])for(const side of [-1,1]){
    let coastX=0,best=Infinity;for(let x=-1100;x<=1100;x+=1)if(Math.sign(x+110)===side&&Math.abs(coastDistance(x,z))<best){best=Math.abs(coastDistance(x,z));coastX=x;}
    const samples=Array.from({length:25},(_,i)=>terrain.heightAt(coastX-side*(i*5-30),z));
    signatures.push(samples.map(v=>Math.round(v)).join(','));
    assert.ok(samples.every(Number.isFinite));
  }
  assert.equal(new Set(signatures).size,signatures.length,'No periodic duplicated coast profile');
  let shelf=0;for(let x=-450;x<150;x+=5){const y=terrain.heightAt(x,850);if(y>2&&y<40)shelf++;}assert.ok(shelf>=5);
});
