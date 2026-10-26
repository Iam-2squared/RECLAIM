import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {batchActorMeshes} from '../src/mission/actor-mesh-batches.ts';
import {MissionActors,MotionPlayback} from '../src/mission/actors.ts';

async function loadModel(id){
 const bytes=await readFile(new URL(`../public/mission-models/${id}.glb`,import.meta.url));
 const loader=new GLTFLoader();loader.register(()=>({name:'GEOMETRY_CHECK',loadTexture:()=>Promise.resolve(new T.Texture())}));
 return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
function meshes(root){const found=[];root.traverse(object=>{if(object.isMesh)found.push(object);});return found;}
function skins(root){const found=new Set();root.traverse(object=>{if(object.isSkinnedMesh)found.add(object.skeleton);});return found;}
function update(root){root.updateMatrixWorld(true);for(const skeleton of skins(root))skeleton.update();}
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);

test('actual authored parts batch without changing any attribute, triangle, material or animated vertex',async t=>{
 for(const [id,before,after]of [['humanoid-lv1',67,6],['drone-lv1',63,7],['humanoid-lv5',188,3],['drone-lv5',126,4]])await t.test(id,async()=>{
  const original=await loadModel(id),optimized=await loadModel(id);update(original.scene);update(optimized.scene);
  const source=new Map(meshes(original.scene).map(mesh=>[mesh.name,mesh])),result=batchActorMeshes(optimized.scene,optimized.animations);
  assert.equal(result.before,before);assert.equal(result.after,after);assert.equal(skins(optimized.scene).size,1);
  const correspondence=[];
  for(const merged of meshes(optimized.scene)){
   const ranges=merged.userData.actorBatchRanges??[{name:merged.name,vertexOffset:0,vertexCount:merged.geometry.attributes.position.count}];let indexOffset=0;
   for(const range of ranges){
    const part=source.get(range.name);assert(part);assert.equal(part.material.name,merged.material.name);assert.equal(part.geometry.attributes.position.count,range.vertexCount);
    for(const [attributeName,attribute]of Object.entries(part.geometry.attributes)){
     const target=merged.geometry.attributes[attributeName];assert.equal(target.itemSize,attribute.itemSize);assert.equal(target.normalized,attribute.normalized);
     const offset=range.vertexOffset*attribute.itemSize;
     assert.deepEqual(target.array.subarray(offset,offset+attribute.array.length),attribute.array,`${id}/${part.name}/${attributeName}`);
    }
    if(part.geometry.index){for(let i=0;i<part.geometry.index.count;i++)assert.equal(merged.geometry.index.getX(indexOffset+i),part.geometry.index.getX(i)+range.vertexOffset);indexOffset+=part.geometry.index.count;}
    correspondence.push({part,merged,offset:range.vertexOffset});
   }
  }
  const originalMixer=new T.AnimationMixer(original.scene),optimizedMixer=new T.AnimationMixer(optimized.scene);
  for(const name of [id.startsWith('drone')?'Patrol':'Walk','Death']){
   originalMixer.stopAllAction();optimizedMixer.stopAllAction();const clip=original.animations.find(clip=>clip.name===name),optimizedClip=optimized.animations.find(clip=>clip.name===name);assert(clip&&optimizedClip);
   originalMixer.clipAction(clip).play();optimizedMixer.clipAction(optimizedClip).play();
   for(const seconds of [.08,.23,.51]){
    originalMixer.update(seconds);optimizedMixer.update(seconds);update(original.scene);update(optimized.scene);
    for(const {part,merged,offset}of correspondence){
     for(let vertex=0;vertex<part.geometry.attributes.position.count;vertex+=Math.max(1,Math.floor(part.geometry.attributes.position.count/17))){
      const expected=part.getVertexPosition(vertex,new T.Vector3()).applyMatrix4(part.matrixWorld),actual=merged.getVertexPosition(offset+vertex,new T.Vector3()).applyMatrix4(merged.matrixWorld);
      near(actual.x,expected.x,`${id}/${name}/${part.name}/x`);near(actual.y,expected.y,`${id}/${name}/${part.name}/y`);near(actual.z,expected.z,`${id}/${name}/${part.name}/z`);
     }
    }
   }
  }
 });
});

test('unsafe animated, transparent, morphing, anchored and differently transformed parts remain separate',()=>{
 const scene=new T.Group(),material=new T.MeshBasicMaterial(),geometry=new T.BoxGeometry();geometry.clearGroups();
 const add=(name,mat=material)=>{const mesh=new T.Mesh(geometry,mat);mesh.name=name;scene.add(mesh);return mesh;};
 add('animated');add('Tip_Visual');add('Grip_R');add('transparent',new T.MeshBasicMaterial({transparent:true,opacity:.5}));
 const moved=add('moved');moved.position.x=2;
 const morphing=add('morphing');morphing.geometry=geometry.clone();morphing.geometry.morphAttributes.position=[geometry.attributes.position.clone()];
 const grouped=add('grouped');grouped.geometry=geometry.clone();grouped.geometry.addGroup(0,3,0);
 const hidden=add('hidden');hidden.visible=false;
 // The eligible pair has no material groups, unlike BoxGeometry's six faces.
 for(const name of ['eligible-a','eligible-b']){const mesh=add(name);mesh.geometry=geometry.clone();mesh.geometry.clearGroups();}
 const clip=new T.AnimationClip('Idle',1,[new T.NumberKeyframeTrack('animated.position[x]',[0,1],[0,1])]);
 const before=meshes(scene).length,result=batchActorMeshes(scene,[clip]);assert.equal(result.before,before);assert.equal(result.after,before-1);
 for(const name of ['animated','Tip_Visual','Grip_R','transparent','moved','morphing','grouped','hidden'])assert(scene.getObjectByName(name),name);
});

test('deferred invisible animation performs no evaluations until needed, then matches visible playback across transitions',()=>{
 const make=()=>{const root=new T.Group(),clips=[new T.AnimationClip('Walk',1,[new T.NumberKeyframeTrack('.position[x]',[0,.5,1],[0,1,0])]),new T.AnimationClip('Hit',.4,[new T.NumberKeyframeTrack('.position[y]',[0,.2,.4],[0,.25,0])]),new T.AnimationClip('Idle',1,[new T.NumberKeyframeTrack('.position[x]',[0,1],[0,0])])];return{root,motion:new MotionPlayback(root,clips)};};
 const visible=make(),hidden=make();let updates=0;const originalUpdate=hidden.motion.mixer.update.bind(hidden.motion.mixer);hidden.motion.mixer.update=seconds=>{updates++;return originalUpdate(seconds);};
 for(const [motion,frames]of [['Walk',140],['Hit',9],['Idle',220]]){
  visible.motion.play(motion);hidden.motion.play(motion);
  const before=updates;for(let i=0;i<frames;i++){visible.motion.step(1/60);hidden.motion.step(1/60,false);}assert.equal(updates,before,'Invisible frames must not evaluate animation tracks');
 }
 hidden.motion.step(0,true);near(hidden.root.position.x,visible.root.position.x,'x');near(hidden.root.position.y,visible.root.position.y,'y');near(hidden.motion.snapshot().time,visible.motion.snapshot().time,'clip time');assert.ok(updates<=3);
 visible.motion.dispose();hidden.motion.dispose();
});

test('first-person player and unselected weapon hierarchies stay dormant until visible',async()=>{
 globalThis.ProgressEvent??=class ProgressEvent extends Event{constructor(type,values={}){super(type);Object.assign(this,values);}};
 const positions=new Float32Array([-.2,0,-.2,.2,0,-.2,0,1,.2]),gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'model',mesh:0,children:[1,2]},{name:'Grip_R'},{name:'Tip_Visual',translation:[.6,.1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-.2,0,-.2],max:[.2,1,.2]}],bufferViews:[{buffer:0,byteLength:positions.byteLength}],buffers:[{byteLength:positions.byteLength,uri:`data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString('base64')}`}]};
 const url=`data:application/json;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`,scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);
 const actors=new MissionActors(scene,camera,'jonesy',{modelUrls:{jonesy:url,'humanoid-lv1':url,'drone-lv1':url},weaponUrls:{assault:url,sniper:url,knife:url}});await actors.load();assert.equal(actors.snapshot().status,'ready');
 const skin=actors.actors.get('jonesy'),child=skin.visual.children[0],unused=actors.weapons.get('sniper').first.children[0];let playerVisits=0,unusedVisits=0;
 const playerUpdate=child.updateMatrixWorld;child.updateMatrixWorld=function(force){playerVisits++;playerUpdate.call(this,force);};const unusedUpdate=unused.updateMatrixWorld;unused.updateMatrixWorld=function(force){unusedVisits++;unusedUpdate.call(this,force);};
 actors.setWeapon('assault',{thirdPerson:false});
 for(let frame=0;frame<40;frame++){actors.setPlayer({x:3,y:4,z:5},.3,'Walk',1/60,false);scene.updateMatrixWorld(true);}
 assert.equal(playerVisits,0);assert.equal(unusedVisits,0);
 actors.setPlayer({x:3,y:4,z:5},.3,'Walk',0,true);scene.updateMatrixWorld(true);assert.ok(playerVisits>0);assert.deepEqual(skin.root.getWorldPosition(new T.Vector3()).toArray(),[3,4,5]);
 actors.setWeapon('sniper',{thirdPerson:true});scene.updateMatrixWorld(true);const muzzle=actors.muzzleWorld();assert(muzzle&&muzzle.toArray().every(Number.isFinite));actors.dispose();assert.equal(scene.children.length,1);
});
