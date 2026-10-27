import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import type {AreaDefinition,Collider,WorldQuality} from './types.ts';
import {decodeSapporoGlb,loadSapporoMapData,type SapporoMapData} from './sapporo-map-data.ts';
import {SapporoMapPhysics,SAPPORO_ARENA_COVERS} from './sapporo-map-physics.ts';
import {SAPPORO_MAP_META} from './sapporo-map-meta.ts';

class StaticCity extends T.Group {
 private frozen=false;
 freeze(){super.updateMatrixWorld(true);this.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});this.frozen=true;}
 override updateMatrixWorld(force?:boolean){if(!this.frozen)super.updateMatrixWorld(force);}
}
type SourceMesh={mesh:T.Mesh;bounds:T.Box3;triangles:number};
export class SapporoMapWorld {
 readonly scene=new T.Scene();
 readonly worldId=SAPPORO_MAP_META.worldId;
 readonly sapporoLayout=SAPPORO_MAP_META;
 readonly physics:SapporoMapPhysics;
 readonly terrain:SapporoMapPhysics;
 readonly area:Omit<AreaDefinition,'spawn'>&{spawn:typeof SAPPORO_MAP_META.spawn};
 readonly bounds=SAPPORO_MAP_META.bounds;
 readonly spawn=SAPPORO_MAP_META.spawn;
 colliders:readonly Collider[]=[];
 quality:WorldQuality;
 private readonly city=new StaticCity();
 private readonly navigation=new T.Group();
 private readonly sourceMeshes:SourceMesh[]=[];
 private readonly geometries=new Set<T.BufferGeometry>();
 private readonly materials=new Set<T.Material>();
 private readonly textures=new Set<T.Texture>();
 private readonly arenaMaterials=new Map<string,T.MeshBasicMaterial>();
 private phase=1;
 private checkpointIndex=1;
 private lastX=NaN;private lastZ=NaN;
 private disposed=false;
 private readonly loadMs:number;
 constructor(data:SapporoMapData,model:T.Group,quality:WorldQuality='balanced'){
  const start=performance.now();this.quality=quality;this.physics=new SapporoMapPhysics(data.metadata);this.terrain=this.physics;
  this.area={id:'sapporo',displayName:'札幌',version:1,seed:20261027,status:'environment-prototype',bounds:this.bounds,spawn:this.spawn,
   terrainProfile:{baseHeight:0,amplitude:0,frequency:0,ruggedness:0,pathWidth:13,pathBlendWidth:0,cabinPlateau:false,water:[]},biome:{treeDensity:0,broadleafFraction:0,minTreeHeight:0,maxTreeHeight:0,timberline:0,grassDensity:0,groundColors:[0x4d5348,0x666758,0x858171],foliageColors:[0x56613a,0x687746,0x35432b],rockColor:0x6a6c62},climate:{skyColor:0x303b53,fogColor:0x667182,morningLight:1.9,ambientLight:1.8,fogNear:1300,fogFar:2850,cloudHeight:300},
   route:SAPPORO_MAP_META.route.map(p=>({x:p.x,z:p.z,height:p.y})),landmarks:SAPPORO_MAP_META.checkpoints.map(p=>({id:p.id,type:p.id==='sapporo-station'?'prototype-end':'checkpoint',position:{x:p.x,z:p.z},radius:p.radius,provisional:true})),objectiveIds:SAPPORO_MAP_META.checkpoints.map(p=>p.id),exitTriggers:[{id:'sapporo-station-exit',position:SAPPORO_MAP_META.exit,radius:SAPPORO_MAP_META.exit.radius,targetAreaId:null,provisional:true}],allowedEnemyTypes:['scout-drone'],assetRefs:['sapporo-map/city.glb.gz'],lodSettings:{chunkSize:48,collisionCellSize:2,nearRadius:1,lowRadius:1,balancedRadius:2,farCellSize:8},qualityOverrides:{low:{vegetationScale:1,grassScale:1,pixelRatio:1},balanced:{vegetationScale:1,grassScale:1,pixelRatio:1.5}}};
  this.scene.name='mission:sapporo-authored';this.scene.background=new T.Color(0x414b63);this.scene.fog=new T.Fog(0x667182,1300,2850);this.scene.add(this.city,this.navigation);
  this.city.add(new T.HemisphereLight(0xb9cce5,0x565344,2.1));const sun=new T.DirectionalLight(0xffe1b6,2.3);sun.position.set(-500,900,350);this.city.add(sun);
  this.city.add(model);model.updateMatrixWorld(true);
  model.traverse(object=>{
   if(!(object as T.Mesh).isMesh)return;const mesh=object as T.Mesh;mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();this.geometries.add(mesh.geometry);
   this.sourceMeshes.push({mesh,bounds:new T.Box3().setFromObject(mesh),triangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3});
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){this.materials.add(material);for(const value of Object.values(material))if(value&&typeof value==='object'&&(value as T.Texture).isTexture)this.textures.add(value as T.Texture);}
  });
  this.makeNavigation();this.city.freeze();this.update(this.spawn.x,this.spawn.z);this.loadMs=performance.now()-start;
 }
 private geometry<G extends T.BufferGeometry>(value:G):G{this.geometries.add(value);return value;}
 private material<M extends T.Material>(value:M):M{this.materials.add(value);return value;}
 private makeNavigation(){
  this.navigation.name='sapporo:checkpoints-and-blue-route';
  const positions:number[]=[],indices:number[]=[];const route=SAPPORO_MAP_META.route;
  let arrowDistance=0;
  const vertex=(x:number,z:number)=>{positions.push(x,this.physics.heightAt(x,z)+.045,z);};
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i],distance=Math.hypot(b.x-a.x,b.z-a.z);if(distance<.01)continue;
   const forwardX=(b.x-a.x)/distance,forwardZ=(b.z-a.z)/distance,dx=-forwardZ*.38,dz=forwardX*.38,pieces=Math.ceil(distance/.9);
   for(let piece=0;piece<pieces;piece++){const offset=positions.length/3;for(const[t,side]of[[piece/pieces,-1],[piece/pieces,1],[(piece+1)/pieces,-1],[(piece+1)/pieces,1]])vertex(a.x+(b.x-a.x)*t+dx*side,a.z+(b.z-a.z)*t+dz*side);indices.push(offset,offset+2,offset+1,offset+1,offset+2,offset+3);}
   for(let at=18-arrowDistance;at<distance;at+=18){if(at<1||at>distance-1)continue;const x=a.x+forwardX*at,z=a.z+forwardZ*at,offset=positions.length/3;vertex(x+forwardX*1.35,z+forwardZ*1.35);vertex(x-forwardX*.65-forwardZ*.9,z-forwardZ*.65+forwardX*.9);vertex(x-forwardX*.65+forwardZ*.9,z-forwardZ*.65-forwardX*.9);indices.push(offset,offset+1,offset+2);}
   arrowDistance=(arrowDistance+distance)%18;
  }
  const geometry=this.geometry(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
  const material=this.material(new T.MeshBasicMaterial({color:0x38bfff,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3}));const line=new T.Mesh(geometry,material);line.name='sapporo:blue-checkpoint-line';this.navigation.add(line);
  const checkpointMaterial=this.material(new T.MeshBasicMaterial({color:0x62d7ff,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide}));
  for(const point of SAPPORO_MAP_META.checkpoints){const ring=new T.Mesh(this.geometry(new T.RingGeometry(2.1,2.5,40)),checkpointMaterial);ring.rotation.x=-Math.PI/2;ring.position.set(point.x,this.physics.heightAt(point.x,point.z)+.065,point.z);ring.name=`sapporo:checkpoint:${point.id}`;this.navigation.add(ring);}
  for(const [kind,arena]of Object.entries(SAPPORO_MAP_META.bossArenas)){
   const material=this.material(new T.MeshBasicMaterial({color:0x4ec6e9,transparent:true,opacity:.48,depthWrite:false,side:T.DoubleSide}));this.arenaMaterials.set(kind,material);
   const ring=new T.Mesh(this.geometry(new T.RingGeometry(arena.radius-.45,arena.radius+.45,96)),material);ring.rotation.x=-Math.PI/2;ring.position.set(arena.center.x,this.physics.heightAt(arena.center.x,arena.center.z)+.055,arena.center.z);ring.name=`sapporo:boss-arena:${kind}`;this.navigation.add(ring);
   const ground=this.material(new T.MeshBasicMaterial({color:0x59bad9,transparent:true,opacity:.075,depthWrite:false,side:T.DoubleSide}));const disc=new T.Mesh(this.geometry(new T.CircleGeometry(arena.radius,64)),ground);disc.rotation.x=-Math.PI/2;disc.position.copy(ring.position);disc.position.y-=.015;this.navigation.add(disc);
   const beaconGeometry=this.geometry(new T.CylinderGeometry(.28,.45,1.6,6)),beaconBody=this.material(new T.MeshStandardMaterial({color:0x343d47,metalness:.55,roughness:.72}));
   for(let i=0;i<8;i++){const angle=(i+.5)*Math.PI/4,x=arena.center.x+Math.cos(angle)*arena.radius,z=arena.center.z+Math.sin(angle)*arena.radius,y=this.physics.heightAt(x,z);const beacon=new T.Mesh(beaconGeometry,beaconBody);beacon.position.set(x,y+.8,z);const lamp=new T.Mesh(this.geometry(new T.BoxGeometry(.42,.32,.42)),material);lamp.position.set(x,y+1.55,z);this.navigation.add(beacon,lamp);}
  }
  const coverMaterial=this.material(new T.MeshStandardMaterial({color:0x6b777f,metalness:.22,roughness:.8})),stripe=this.material(new T.MeshBasicMaterial({color:0x66d7ff}));
  for(const cover of SAPPORO_ARENA_COVERS){const y=this.physics.heightAt(cover.x,cover.z);const mesh=new T.Mesh(this.geometry(new T.BoxGeometry(cover.width,cover.height,cover.depth)),coverMaterial);mesh.name=cover.id;mesh.position.set(cover.x,y+cover.height/2,cover.z);const band=new T.Mesh(this.geometry(new T.BoxGeometry(cover.width-.2,.12,cover.depth+.025)),stripe);band.position.copy(mesh.position);this.navigation.add(mesh,band);}
  this.navigation.updateMatrixWorld(true);this.navigation.traverse(o=>{o.matrixAutoUpdate=false;});
 }
 combatColliders(x:number,z:number){return this.physics.collidersNear(x,z,180);}
 sightColliders(x:number,z:number){return this.physics.collidersNear(x,z,60);}
 update(x:number,z:number){
  if(this.disposed||!Number.isFinite(x)||!Number.isFinite(z)||x===this.lastX&&z===this.lastZ)return;this.lastX=x;this.lastZ=z;this.colliders=this.physics.collidersNear(x,z);
  const point=new T.Vector3(x,1,z),distance=this.quality==='low'?1050:1650;
  for(const source of this.sourceMeshes)source.mesh.visible=source.bounds.distanceToPoint(point)<distance;
  const next=SAPPORO_MAP_META.checkpoints[this.checkpointIndex];if(next&&Math.hypot(x-next.x,z-next.z)<next.radius)this.checkpointIndex=Math.min(SAPPORO_MAP_META.checkpoints.length-1,this.checkpointIndex+1);
 }
 setQuality(quality:WorldQuality){if(this.disposed||quality===this.quality)return;this.quality=quality;const x=this.lastX,z=this.lastZ;this.lastX=NaN;this.update(x,z);}
 setPhase(phase:number){this.phase=Math.max(1,Math.min(4,Math.floor(phase)));for(const[kind,material]of this.arenaMaterials){const active=this.phase>=(kind==='tower'?3:4);material.color.setHex(active?0xffa563:0x4ec6e9);material.opacity=active?.82:.48;}}
 routeStats(){return{line:true,color:'blue',points:SAPPORO_MAP_META.route.length,checkpoints:SAPPORO_MAP_META.checkpoints.length,nextCheckpoint:SAPPORO_MAP_META.checkpoints[this.checkpointIndex].id,phase:this.phase,arenas:2,coverObjects:SAPPORO_ARENA_COVERS.length};}
 stats(){return{areaId:'sapporo',source:'authored-sapporo',worldId:this.worldId,quality:this.quality,totalSourceMeshes:this.sourceMeshes.length,visibleSourceMeshes:this.sourceMeshes.filter(s=>s.mesh.visible).length,triangles:Math.round(this.sourceMeshes.filter(s=>s.mesh.visible).reduce((n,s)=>n+s.triangles,0)),sourceModelModified:false,colliders:this.colliders.length,allColliders:this.physics.allColliders.length,route:this.routeStats(),loadMs:this.loadMs,disposed:this.disposed};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const geometry of this.geometries)geometry.dispose();for(const material of this.materials)material.dispose();for(const texture of this.textures)texture.dispose();this.geometries.clear();this.materials.clear();this.textures.clear();this.sourceMeshes.length=0;this.colliders=[];this.city.clear();this.navigation.clear();this.scene.clear();this.scene.background=null;this.scene.fog=null;}
}
export async function createSapporoMapWorld(data:SapporoMapData,quality:WorldQuality='balanced'):Promise<SapporoMapWorld>{
 const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);const buffer=await decodeSapporoGlb(data.compressed);const gltf=await loader.parseAsync(buffer,'');return new SapporoMapWorld(data,gltf.scene,quality);
}
export async function loadSapporoMapWorld(quality:WorldQuality='balanced'):Promise<SapporoMapWorld>{return createSapporoMapWorld(await loadSapporoMapData(),quality);}
