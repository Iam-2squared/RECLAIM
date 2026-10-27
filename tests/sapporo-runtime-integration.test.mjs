import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EncounterPresentation} from '../src/mission/encounter-presentation.ts';
import {MissionActors,MotionPlayback} from '../src/mission/actors.ts';
import {authoredCampaignStore,AUTHORED_CAMPAIGN_KEY} from '../src/campaign/authored-world.ts';
import {CAMPAIGN_KEY,isAreaUnlocked} from '../src/campaign/index.ts';
import {AUTHORED_MAP_META as shiretoko} from '../src/world/authored-map-meta.ts';
import {SAPPORO_MAP_META as sapporo} from '../src/world/sapporo-map-meta.ts';

test('Sapporo can display 100 enemy health bars and recycle them without growing resources',t=>{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,1,.05,500);camera.position.set(0,3,10);scene.add(camera);
 const view=new EncounterPresentation(scene,camera,{enemyCapacity:100,viewDistance:60});t.after(()=>view.dispose());
 const fill=prefix=>{for(let i=0;i<120;i++)view.setEnemyHealth(`${prefix}-${i}`,{x:i%10,y:0,z:Math.floor(i/10)},30,30,i%2?'drone':'humanoid');view.step(0);};
 fill('initial');const initial=view.snapshot();
 assert.equal(initial.enemyBars,100);assert.equal(initial.visibleEnemyBars,100);assert.equal(initial.limits.enemies,100);assert.equal(initial.healthBarCapacity,100);
 for(let i=0;i<25;i++)view.removeEnemy(`initial-${i}`);
 assert.equal(view.snapshot().enemyBars,75);
 for(let i=0;i<25;i++)view.setEnemyHealth(`replacement-${i}`,{x:0,y:0,z:i},20,30);
 assert.equal(view.snapshot().enemyBars,100);assert.equal(view.snapshot().healthBarCapacity,100);assert.deepEqual(view.snapshot().resources,initial.resources);
 for(let cycle=0;cycle<4;cycle++){view.reset();assert.equal(view.snapshot().enemyBars,0);fill(`retry-${cycle}`);assert.equal(view.snapshot().enemyBars,100);assert.equal(view.snapshot().healthBarCapacity,100);assert.deepEqual(view.snapshot().resources,initial.resources);}
 view.dispose();assert.equal(scene.children.length,1);assert.deepEqual(view.snapshot().resources,{geometries:0,materials:0,textures:0});
});

async function installAuthoredEnemyTemplates(actors,scene){
 const sharedGeometries=new Set(),sharedMaterials=new Set();
 for(const kind of ['humanoid','drone']){
  const id=`${kind}-lv1`,bytes=await readFile(new URL(`../public/mission-models/${id}.glb`,import.meta.url)),loader=new GLTFLoader();
  // Use the real geometry, rigs and clips; texture loading alone is stubbed for Node.
  loader.register(()=>({name:'SAPPORO_GEOMETRY_CHECK',loadTexture:()=>Promise.resolve(new T.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');assert(gltf.animations.length>0);
  const root=new T.Group(),visual=new T.Group();visual.add(gltf.scene);root.add(visual);root.visible=false;scene.add(root);
  root.traverse(object=>{if(object.isMesh){sharedGeometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])sharedMaterials.add(material);}});
  actors.actors.set(id,{root,visual,motion:new MotionPlayback(gltf.scene,gltf.animations),clips:gltf.animations,hand:null,fallback:false});actors.owned.add(root);
 }
 return{sharedGeometries,sharedMaterials};
}

test('Sapporo lazy actors skip 100 distant enemies, animate nearby authored units and release distant rigs',async t=>{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);
 const actors=new MissionActors(scene,camera,'jonesy',{enemyUnitLimit:100,enemyViewDistance:30,lazyEnemyUnits:true});t.after(()=>actors.dispose());
 actors.status='ready';actors.setPlayer({x:0,y:0,z:0},0,'Idle',0,false);
 const set=(id,index,position,dt=1/60)=>actors.setEnemyUnit(id,index%2?'drone':'humanoid',position,0,index%2?'Hover':'Walk',dt,1);
 for(let i=0;i<100;i++)set(`distant-${i}`,i,{x:600+i,y:i%2?2:0,z:0});
 assert.equal(actors.snapshot().enemyUnitCount,0);assert.equal(actors.actors.size,0);assert.equal(actors.loadingVariants.size,0);assert.equal(actors.snapshot().enemyUnitResources.skeletons,0);
 const {sharedGeometries,sharedMaterials}=await installAuthoredEnemyTemplates(actors,scene);
 const fill=prefix=>{for(let i=0;i<100;i++)set(`${prefix}-${i}`,i,{x:i%10,y:i%2?2:0,z:Math.floor(i/10)});};
 fill('near');let state=actors.snapshot();assert.equal(state.enemyUnitCount,100);assert.equal(state.enemyUnitLimit,100);
 assert(state.enemyUnits.every(unit=>unit.visible&&unit.loaded&&!unit.fallback&&unit.motion.clip));
 assert.equal(state.enemyUnitResources.geometries,sharedGeometries.size);assert.equal(state.enemyUnitResources.materials,sharedMaterials.size);assert.equal(state.enemyUnitResources.skeletons,100);
 const palettes=new Set();for(const unit of actors.enemyUnits.values())unit.actor.root.traverse(object=>{if(object.isSkinnedMesh){assert(sharedGeometries.has(object.geometry));palettes.add(object.skeleton);}});assert.equal(palettes.size,100);
 set('overflow',0,{x:1,y:0,z:0});assert.equal(actors.snapshot().enemyUnitCount,100);assert(!actors.enemyUnits.has('overflow'));
 set('near-0',0,{x:50,y:0,z:0},.1);const hidden=actors.snapshot().enemyUnits.find(unit=>unit.id==='near-0');assert.equal(hidden.visible,false);
 set('near-0',0,{x:50,y:0,z:0},.1);assert.equal(actors.snapshot().enemyUnits.find(unit=>unit.id==='near-0').motion.time,hidden.motion.time);
 set('near-0',0,{x:100,y:0,z:0});assert.equal(actors.snapshot().enemyUnitCount,99);assert(!actors.enemyUnits.has('near-0'));
 set('replacement',0,{x:0,y:0,z:0});assert.equal(actors.snapshot().enemyUnitCount,100);
 const resources={...actors.snapshot().enemyUnitResources};
 for(let cycle=0;cycle<2;cycle++){actors.resetEnemyUnits();assert.equal(actors.snapshot().enemyUnitResources.skeletons,0);fill(`retry-${cycle}`);assert.deepEqual(actors.snapshot().enemyUnitResources,resources);}
 actors.resetEnemies();assert.equal(actors.snapshot().enemyUnitCount,0);actors.dispose();assert.equal(scene.children.length,1);
});

function memoryStorage(){const oldSave='previous coordinate-system save',items=new Map([[CAMPAIGN_KEY,oldSave]]);return{oldSave,items,storage:{getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)}};}
const point=spawn=>({x:spawn.x,y:spawn.y,z:spawn.z});
const story=value=>({introStep:value.introStep,droneDefeated:value.droneDefeated,completedAreaIds:[...value.completedAreaIds],passages:[...value.passages]});
function recordPosition(store,areaId,position){assert.equal(store.record({type:'position',areaId,position,grounded:true}),true);}
function saveCheckpoint(store,areaId,position,hp=100){assert.equal(store.checkpoint({areaId,...position,yaw:0,pitch:0,hp}),true);}

test('a fresh save starts and resumes Sapporo without completing the Shiretoko introduction',()=>{
 const {storage,items,oldSave}=memoryStorage(),store=authoredCampaignStore(storage),spawn=point(sapporo.spawn),initial=story(store.value);
 assert.equal(isAreaUnlocked(store.value,'sapporo'),true);assert.equal(store.beginSession('sapporo',false),true);
 recordPosition(store,'sapporo',spawn);saveCheckpoint(store,'sapporo',spawn,70);
 assert.equal(store.value.traversal.areaId,'sapporo');assert(store.value.traversal.passedCheckpointIds.includes(sapporo.checkpoints[0].id));assert.deepEqual(story(store.value),initial);
 const restored=authoredCampaignStore(storage);assert.equal(restored.beginSession('sapporo',true),true);assert.equal(restored.value.checkpoint.areaId,'sapporo');assert.equal(restored.value.checkpoint.hp,70);
 recordPosition(restored,'sapporo',spawn);assert.deepEqual(story(restored.value),initial);assert.equal(restored.value.introStep,0);assert.equal(restored.value.droneDefeated,false);assert.deepEqual(restored.value.completedAreaIds,[]);
 assert.equal(items.get(CAMPAIGN_KEY),oldSave);assert(items.has(AUTHORED_CAMPAIGN_KEY));
});

test('Sapporo death and retry reset its checkpoint while preserving persisted Shiretoko story progress',()=>{
 const {storage,items,oldSave}=memoryStorage(),store=authoredCampaignStore(storage),home=point(shiretoko.spawn);
 assert.equal(store.beginSession('shiretoko',false),true);recordPosition(store,'shiretoko',home);
 for(const step of ['wake','radio','friend-contact'])assert.equal(store.record({type:'opening',step,areaId:'shiretoko',position:home,grounded:true}),true);
 const outside={...home,z:shiretoko.cabin.minZ-1};recordPosition(store,'shiretoko',outside);
 assert.equal(store.record({type:'opening',step:'leave-cabin',areaId:'shiretoko',position:outside,grounded:true}),true);
 assert.equal(store.record({type:'drone-defeated',areaId:'shiretoko',enemyId:'shiretoko-scout-01',remainingHp:0,hitCount:1}),true);saveCheckpoint(store,'shiretoko',outside);
 const progress=story(store.value),spawn=point(sapporo.spawn),injured={...spawn,z:spawn.z-3};
 assert.equal(store.beginSession('sapporo',false),true);recordPosition(store,'sapporo',spawn);recordPosition(store,'sapporo',injured);saveCheckpoint(store,'sapporo',injured,17);
 const beforeRetry=authoredCampaignStore(storage);assert.equal(beforeRetry.value.checkpoint.hp,17);assert.deepEqual(story(beforeRetry.value),progress);
 // Runtime uses beginSession(false) for Sapporo death and again for the retry.
 assert.equal(beforeRetry.beginSession('sapporo',false),true);assert.equal(beforeRetry.value.checkpoint,null);assert.equal(beforeRetry.value.traversal,null);assert.deepEqual(story(beforeRetry.value),progress);
 const retry=authoredCampaignStore(storage);assert.equal(retry.value.checkpoint,null);assert.deepEqual(story(retry.value),progress);
 assert.equal(retry.beginSession('sapporo',false),true);recordPosition(retry,'sapporo',spawn);saveCheckpoint(retry,'sapporo',spawn);
 const restored=authoredCampaignStore(storage);assert.equal(restored.value.checkpoint.hp,100);assert.equal(restored.value.checkpoint.z,spawn.z);assert.equal(restored.value.traversal.distance,0);assert.deepEqual(story(restored.value),progress);
 assert.equal(restored.value.introStep,4);assert.equal(restored.value.droneDefeated,true);assert.equal(items.get(CAMPAIGN_KEY),oldSave);
});
