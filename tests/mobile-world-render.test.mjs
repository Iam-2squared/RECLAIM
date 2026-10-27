import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {AuthoredMapWorld,createAuthoredMapWorld} from '../src/world/authored-map-world.ts';
import {spatialGeometryParts} from '../src/world/mobile-render-profile.ts';

let prepared;
async function worlds(){
 if(!prepared)prepared=(async()=>{
  const html=await readFile(new URL('../public/home-map/shiretoko.html',import.meta.url),'utf8');
  const encoded=JSON.parse(html.match(/const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;/)[1]);
  const data=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'))),requested=[];
  const mobile=await createAuthoredMapWorld(data,'low',{mobile:true,textureFactory:async(name)=>{requested.push(name);return new T.Texture();}});
  const full=new AuthoredMapWorld(data,'low',new Map());
  return{data,mobile,full,requested};
 })();return prepared;
}
after(async()=>{if(prepared){const{mobile,full}=await prepared;mobile.dispose();mobile.dispose();full.dispose();assert.equal(mobile.stats().approximateGpuBytes,0);assert.equal(mobile.stats().renderObjects,0);assert.equal(mobile.stats().textures,0);}});

test('spatial mobile batches keep every exact triangle and its colour, normal and UV',()=>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([-100,0,0,-80,1,2,-90,0,5,0,2,0,10,1,4,5,0,8,90,1,0,100,2,1,95,0,4],3));
 geometry.setAttribute('normal',new T.Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0],3));
 geometry.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:27},(_,i)=>i/32),3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:18},(_,i)=>i/20),2));
 geometry.setIndex([0,1,2,3,4,5,6,7,8]);
 const triangles=buffer=>{
  const values=[];
  for(let offset=0;offset<buffer.index.count;offset+=3){
   const triangle=[];
   for(let corner=0;corner<3;corner++){
    const index=buffer.index.getX(offset+corner);
    triangle.push(Object.entries(buffer.attributes).map(([name,a])=>[name,Array.from(a.array.slice(index*a.itemSize,(index+1)*a.itemSize))]));
   }
   values.push(JSON.stringify(triangle));
  }
  return values.sort();
 };
 const expected=triangles(geometry),parts=spatialGeometryParts(geometry,48);
 assert.equal(parts.length,3);assert.deepEqual(parts.flatMap(p=>triangles(p.buffer)).sort(),expected);
 for(const part of parts)part.buffer.dispose();
});

test('mobile actual world reduces selected triangles while retaining the authored navigation and all blocking trees',async()=>{
 const{data,mobile,full}=await worlds();
 assert.deepEqual(mobile.spawn,full.spawn);assert.deepEqual(mobile.bounds,full.bounds);
 assert.equal(mobile.stats().totalAuthoredInstances,data.vegetation.instances.length);
 assert.ok(mobile.stats().retainedVisualInstances<full.stats().retainedVisualInstances*.6);
 for(const [x,z] of [[-169,597],[-169,589.4],[-148,529],[-191,-99],[0,0],[230,-180]]){
  mobile.update(x,z);full.update(x,z);
  assert.deepEqual(mobile.colliders,full.colliders,'visual range must not reduce walking collision neighbours');
  for(const y of [0,80,110]){
   assert.equal(mobile.terrain.heightAt(x,z,y),full.terrain.heightAt(x,z,y));
   assert.equal(mobile.terrain.inWater(x,z,y),full.terrain.inWater(x,z,y));
   assert.equal(mobile.terrain.blockedAt(x,z,y,.32,1.76),full.terrain.blockedAt(x,z,y,.32,1.76));
  }
 }
 for(const [x,z] of [[mobile.spawn.x,mobile.spawn.z],[mobile.spawn.x,mobile.spawn.z-7.6]]){
  mobile.update(x,z);full.update(x,z);
  assert.ok(mobile.stats().triangles<full.stats().triangles*.4,'same-pose mobile draw selection must substantially reduce actual geometry');
 }
 const retained=new Map();
 mobile.scene.traverse(object=>{if(object.isInstancedMesh&&!object.name.endsWith(':mobile-lod')){const name=object.name.split(':')[1];retained.set(name,(retained.get(name)??0)+object.count);}});
 for(const name of ['pine_tall','spruce_small','broadleaf','rock_large','rock_small'])assert.equal(retained.get(name),data.vegetation.instances.filter(p=>p.prototype===name).length);
});

test('mobile texture factory avoids normal-map decoding and uses the light material path only for mobile',async()=>{
 const{mobile,full,requested}=await worlds();
 assert.deepEqual(requested.sort(),['cliff_color','terrain_color']);
 assert.equal(mobile.stats().textures,2);assert.equal(mobile.stats().mobile,true);assert.equal(full.stats().mobile,false);
 let mobileSource=0,desktopSource=0;
 mobile.scene.traverse(object=>{if(object.userData.authoredSource){mobileSource++;assert.ok(object.material.isMeshLambertMaterial);}});
 full.scene.traverse(object=>{if(object.userData.authoredSource){desktopSource++;assert.ok(object.material.isMeshStandardMaterial);}});
 assert.ok(mobileSource>0&&desktopSource>0);
});
