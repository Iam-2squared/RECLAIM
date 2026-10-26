import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MissionActors, MotionPlayback } from '../src/mission/actors.ts';

test('50 actual authored enemies share model resources but retain independent skin palettes and animation state',async()=>{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);const actors=new MissionActors(scene,camera);
 const sharedGeometries=new Set(),sharedMaterials=new Set();
 // Install actual parsed GLBs in the cache; the texture stub keeps this a
 // geometry/animation/resource check rather than a DOM/GPU or network test.
 for(const kind of ['humanoid','drone']){
  const id=`${kind}-lv1`,bytes=await readFile(new URL(`../public/mission-models/${id}.glb`,import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:'GEOMETRY_CHECK',loadTexture:()=>Promise.resolve(new T.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');assert(gltf.animations.length>0);
  const root=new T.Group(),visual=new T.Group();visual.add(gltf.scene);root.add(visual);root.visible=false;scene.add(root);const motion=new MotionPlayback(gltf.scene,gltf.animations);
  root.traverse(object=>{if(object.isMesh){sharedGeometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])sharedMaterials.add(material);}});
  actors.actors.set(id,{root,visual,motion,clips:gltf.animations,hand:null,fallback:false});actors.owned.add(root);
 }
 actors.status='ready';
 const fill=()=>{for(let i=0;i<60;i++)actors.setEnemyUnit(`unit-${i}`,i%2?'drone':'humanoid',{x:i,y:i%2?2:0,z:0},0,i%2?'Hover':'Walk',1/60,1);};
 fill();let snapshot=actors.snapshot();assert.equal(snapshot.enemyUnitCount,50);assert(snapshot.enemyUnits.every(unit=>unit.loaded&&!unit.fallback&&unit.motion.clip));assert.equal(snapshot.enemyUnitResources.geometries,sharedGeometries.size);assert.equal(snapshot.enemyUnitResources.materials,sharedMaterials.size);assert.equal(snapshot.enemyUnitResources.skeletons,50);
 const skins=new Set();for(const unit of actors.enemyUnits.values()){const local=new Set();unit.actor.root.traverse(object=>{if(object.isSkinnedMesh){local.add(object.skeleton);assert(sharedGeometries.has(object.geometry));}});assert.equal(local.size,1);for(const skeleton of local){assert(!skins.has(skeleton));skins.add(skeleton);}}
 const resources={...snapshot.enemyUnitResources};for(let cycle=0;cycle<3;cycle++){actors.resetEnemyUnits();fill();assert.deepEqual(actors.snapshot().enemyUnitResources,resources);}
 actors.setEnemyViewDistance(30);assert(actors.snapshot().enemyUnits.some(unit=>!unit.visible));actors.setEnemyUnit('unit-49','drone',{x:300,y:2,z:0},0,'Hover',.1,1);const before=actors.snapshot().enemyUnits.find(unit=>unit.id==='unit-49').motion.time;actors.setEnemyUnit('unit-49','drone',{x:300,y:2,z:0},0,'Hover',.1,1);assert.equal(actors.snapshot().enemyUnits.find(unit=>unit.id==='unit-49').motion.time,before);
 actors.removeEnemyUnit('unit-0');assert.equal(actors.snapshot().enemyUnitCount,49);actors.resetEnemies();assert.equal(actors.snapshot().enemyUnitCount,0);actors.dispose();assert.equal(actors.snapshot().status,'disposed');assert.equal(scene.children.length,1);
});
