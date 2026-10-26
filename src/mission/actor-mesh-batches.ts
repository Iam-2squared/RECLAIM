import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type BatchRange={name:string;vertexOffset:number;vertexCount:number};
export type ActorMeshBatchStats={before:number;after:number;batches:number;parts:number};

/**
 * Concatenate compatible, unanimated mechanical parts without changing a
 * vertex, skin weight, material, bone or transform. A batch retains the exact
 * source parent/local matrix and bind matrices; incompatible parts stay intact.
 */
export function batchActorMeshes(scene:T.Object3D,clips:readonly T.AnimationClip[]):ActorMeshBatchStats {
 const groups=new Map<T.Object3D,Map<string,T.Mesh[]>>(),sourceGeometries=new Set<T.BufferGeometry>();
 const animatedNames=new Set<string>();let unknownBindings=false;
 for(const clip of clips)for(const track of clip.tracks){
  try{const binding=T.PropertyBinding.parseTrackName(track.name);if(binding.nodeName)animatedNames.add(binding.nodeName);}catch{unknownBindings=true;}
 }
 let before=0,batches=0,parts=0;
 scene.traverse(object=>{
  const mesh=object as T.SkinnedMesh;
  if(!mesh.isMesh)return;before++;sourceGeometries.add(mesh.geometry);
  const geometry=mesh.geometry,material=mesh.material;
  if(unknownBindings||!mesh.visible||mesh.children.length||Array.isArray(material)||material.transparent||
   geometry.groups.length||Object.keys(geometry.morphAttributes).length||
   geometry.drawRange.start!==0||Number.isFinite(geometry.drawRange.count)||
   animatedNames.has(mesh.name)||animatedNames.has(mesh.uuid)||/^(Grip_R|Tip_Visual)$/i.test(mesh.name)||!mesh.parent)return;
  mesh.updateMatrix();
  const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b));
  if(attributes.some(([,attribute])=>attribute instanceof T.InterleavedBufferAttribute||attribute.gpuType!==T.FloatType&&attribute.gpuType!==T.IntType))return;
  const layout=attributes.map(([name,value])=>{const attribute=value as T.BufferAttribute;return`${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}:${attribute.gpuType}`;}).join('|');
  const skin=mesh.isSkinnedMesh?`${mesh.skeleton.uuid}:${mesh.bindMode}:${mesh.bindMatrix.elements.join(',')}:${mesh.bindMatrixInverse.elements.join(',')}`:'rigid';
  const key=[material.uuid,layout,!!geometry.index,skin,mesh.matrix.elements.join(','),mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask,mesh.frustumCulled].join(';');
  let parentGroups=groups.get(mesh.parent);if(!parentGroups){parentGroups=new Map();groups.set(mesh.parent,parentGroups);}
  const group=parentGroups.get(key);if(group)group.push(mesh);else parentGroups.set(key,[mesh]);
 });
 for(const [parent,parentGroups]of groups)for(const meshes of parentGroups.values()){
  if(meshes.length<2)continue;
  const geometry=mergeGeometries(meshes.map(mesh=>mesh.geometry),false);if(!geometry)continue;
  const first=meshes[0],merged=first.clone(false) as T.Mesh;merged.geometry=geometry;
  merged.name=`Runtime batch: ${first.name} + ${meshes.length-1} parts`;
  const ranges:BatchRange[]=[];let vertexOffset=0;
  for(const mesh of meshes){const vertexCount=mesh.geometry.attributes.position.count;ranges.push({name:mesh.name,vertexOffset,vertexCount});vertexOffset+=vertexCount;parent.remove(mesh);}
  merged.userData.actorBatchRanges=ranges;merged.matrixAutoUpdate=false;parent.add(merged);batches++;parts+=meshes.length;
 }
 const retained=new Set<T.BufferGeometry>();let after=0;
 scene.traverse(object=>{const mesh=object as T.Mesh;if(mesh.isMesh){retained.add(mesh.geometry);after++;}});
 for(const geometry of sourceGeometries)if(!retained.has(geometry))geometry.dispose();
 return{before,after,batches,parts};
}
