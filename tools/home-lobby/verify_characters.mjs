import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const directory=new URL('../../public/home-models/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
const expected=['Aim','Death','Hit','Idle','Jump','Melee','Reload','Run','Shoot','Walk'];
const reports=[];
for(const record of manifest.models) {
  const data=await readFile(new URL(record.file,directory));
  assert.equal(createHash('sha256').update(data).digest('hex'),record.runtimeSha256);
  const loader=new GLTFLoader();
  // Bounds and bone sampling use the actual GLB geometry/animation. Images are
  // validated by the preparation script; no DOM or GPU is needed in this check.
  loader.register(()=>({name:'RECLAIM_GEOMETRY_VERIFICATION',loadTexture:()=>Promise.resolve(new T.Texture())}));
  const gltf=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  assert.deepEqual(gltf.animations.map(clip=>clip.name).sort(),expected);
  const idle=T.AnimationClip.findByName(gltf.animations,'Idle');
  assert.equal(idle.duration,record.clips.find(clip=>clip.name==='Idle').seconds);assert(idle.tracks.length>0);
  const root=new T.Group();root.add(gltf.scene);
  const mixer=new T.AnimationMixer(root);mixer.clipAction(idle).setLoop(T.LoopRepeat,Infinity).play();
  const update=()=>{root.updateMatrixWorld(true);root.traverse(object=>{if(object.isSkinnedMesh)object.skeleton.update();});};
  mixer.setTime(0);update();
  const rest=new T.Box3().setFromObject(root,true),center=rest.getCenter(new T.Vector3());
  gltf.scene.position.sub(new T.Vector3(center.x,rest.min.y,center.z));
  root.scale.setScalar(1.8/(rest.max.y-rest.min.y));update();
  const bones=[];root.traverse(object=>{if(object.isBone)bones.push(object);});
  const initial=bones.map(bone=>bone.quaternion.toArray());
  const motionRoot=gltf.scene.getObjectByName('MotionRoot');assert(motionRoot);
  const rootStart=motionRoot.position.clone();
  let footDeviation=0,boneMotion=0,horizontalDrift=0;
  for(let sample=0;sample<=16;sample++) {
    mixer.setTime(sample*idle.duration/16);update();
    const bounds=new T.Box3().setFromObject(root,true);
    assert([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
    footDeviation=Math.max(footDeviation,Math.abs(bounds.min.y));
    horizontalDrift=Math.max(horizontalDrift,Math.hypot(motionRoot.position.x-rootStart.x,motionRoot.position.z-rootStart.z));
    for(const [index,bone] of bones.entries())for(const [axis,value] of bone.quaternion.toArray().entries())boneMotion=Math.max(boneMotion,Math.abs(value-initial[index][axis]));
  }
  assert(footDeviation<.002,`${record.id}: authored Idle feet must stay on the pad (${footDeviation}m)`);
  assert(horizontalDrift<1e-5,`${record.id}: Idle must not walk across the lobby`);
  assert(boneMotion>1e-6,`${record.id}: actual Idle bone channels must move`);
  reports.push({id:record.id,sha256:record.runtimeSha256,clips:gltf.animations.map(clip=>({name:clip.name,duration:clip.duration,tracks:clip.tracks.length})),lobbyClip:idle.name,sampledIdlePoses:17,maxFootDeviationMetres:footDeviation,maxHorizontalRootDriftMetres:horizontalDrift,maxBoneQuaternionChange:boneMotion,passed:true});
  mixer.stopAllAction();mixer.uncacheRoot(root);
}
await writeFile(new URL('animation-verification.json',directory),JSON.stringify({method:'Actual Three.js GLTFLoader/AnimationMixer and skinned-vertex bounds; geometry-only texture stub; no GPU claim',models:reports},null,2)+'\n');
console.log(JSON.stringify(reports.map(({id,sampledIdlePoses,maxFootDeviationMetres,maxHorizontalRootDriftMetres,maxBoneQuaternionChange,passed})=>({id,sampledIdlePoses,maxFootDeviationMetres,maxHorizontalRootDriftMetres,maxBoneQuaternionChange,passed})),null,2));
