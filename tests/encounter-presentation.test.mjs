import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { EncounterPresentation } from '../src/mission/encounter-presentation.ts';

const devices=[{id:'spawn-humanoid',kind:'humanoid',position:{x:0,y:0,z:0},hp:80,maxHp:80},{id:'spawn-drone',kind:'drone',position:{x:5,y:0,z:0},hp:80,maxHp:80}];
function fixture(options){const scene=new T.Scene(),camera=new T.PerspectiveCamera(74,1,.05,500);camera.position.set(0,3,10);scene.add(camera);return{scene,camera,view:new EncounterPresentation(scene,camera,options)};}

test('50 health bars, two devices and pooled damage remain bounded across repeated reset cycles',()=>{
 const {scene,view}=fixture();
 const fill=()=>{for(let i=0;i<55;i++)view.setEnemyHealth(`horde-humanoid-${i}`,{x:i,y:0,z:0},15,30);view.setSpawnDevices(devices);for(let i=0;i<1000;i++)view.showDamage({x:i%5,y:1,z:0},15);view.setMissionMarkers(Array.from({length:20},(_,i)=>({x:i,y:0,z:-5})));view.step(1/60);};
 fill();const state=view.snapshot(),resources={...state.resources};
 assert.equal(state.enemyBars,50);assert.equal(state.deviceBars,2);assert.equal(state.devices.length,2);assert.equal(state.damageCapacity,32);assert.equal(state.activeDamage,32);assert.equal(state.markers,16);assert.equal(state.resources.textures,1);assert.equal(state.healthBarCapacity,52);
 for(let cycle=0;cycle<20;cycle++){view.reset();fill();assert.deepEqual(view.snapshot().resources,resources);assert.equal(view.snapshot().healthBarCapacity,52);}
 for(let i=0;i<15;i++)view.step(.1);assert.equal(view.snapshot().activeDamage,0);
 view.reset();assert.equal(view.snapshot().enemyBars,0);assert.equal(view.snapshot().devices.length,0);assert.equal(view.snapshot().markers,0);
 view.setSpawnDevices(devices.map(device=>({...device,id:`${device.id}-new`})));assert.equal(view.snapshot().devices.length,2);assert.deepEqual(view.snapshot().resources,resources);
 view.dispose();assert.deepEqual(view.snapshot().resources,{geometries:0,materials:0,textures:0});assert.equal(scene.children.length,1);
});

test('enemy bars follow camera orientation, cull distant targets and return to the pool on removal',()=>{
 const {view,camera,scene}=fixture();view.setEnemyHealth('horde-humanoid-1',{x:0,y:0,z:0},30,30);view.setEnemyHealth('horde-drone-2',{x:100,y:2,z:0},10,20);view.setViewDistance(30);camera.rotation.y=.25;view.step(0);
 assert.equal(view.snapshot().visibleEnemyBars,1);const bar=scene.children.find(object=>object.name==='Encounter health bar'&&object.visible);assert(bar.quaternion.angleTo(camera.quaternion)<1e-7);
 const capacity=view.snapshot().healthBarCapacity;view.removeEnemy('horde-humanoid-1');view.setEnemyHealth('replacement',{x:0,y:0,z:0},20,30);assert.equal(view.snapshot().healthBarCapacity,capacity);
 view.dispose();
});

test('destroyed factory devices lose their energy indicators and damage digits use reusable glyph geometry',()=>{
 const {view,scene}=fixture();view.setSpawnDevices(devices);view.setDeviceHealth('spawn-humanoid',devices[0].position,0,80);assert(view.snapshot().devices.find(device=>device.kind==='humanoid').destroyed);
 view.showDamage({x:0,y:1,z:0},15);const number=scene.children.find(object=>object.name==='Floating damage');assert.equal(number.children.filter(glyph=>glyph.visible).length,2);
 const initial=view.snapshot().activeDamage;for(const amount of [0,-1,NaN,Infinity])view.showDamage({x:0,y:1,z:0},amount);assert.equal(view.snapshot().activeDamage,initial);
 view.setReducedMotion(true);view.step(.1);assert(number.position.y<1.4);view.dispose();
});

test('two warehouses display four independent devices and reuse their visuals across resets',()=>{
 const {view,scene}=fixture();
 const four=devices.flatMap((device,index)=>[0,1].map(source=>({...device,id:`warehouse-${source}:${device.id}`,position:{x:source*100+index*5,y:0,z:0},hp:500,maxHp:500})));
 const fill=()=>{for(let i=0;i<50;i++)view.setEnemyHealth(`unit-${i}`,{x:i,y:0,z:0},30,30);view.setSpawnDevices(four);};
 fill();const initial=view.snapshot();assert.equal(initial.devices.length,4);assert.equal(initial.deviceBars,4);assert.equal(initial.healthBarCapacity,54);
 view.setViewDistance(30);view.step(0);assert.equal(scene.children.filter(child=>['Humanoid assembly bay','Drone launch platform'].includes(child.name)&&child.visible).length,2);
 view.setDeviceHealth(four[0].id,four[0].position,0,500);
 assert.equal(view.snapshot().devices.find(device=>device.id===four[0].id).destroyed,true);
 assert.equal(view.snapshot().devices.find(device=>device.id===four[1].id).destroyed,false);
 for(let i=0;i<12;i++){view.reset();fill();assert.deepEqual(view.snapshot().resources,initial.resources);assert.equal(view.snapshot().healthBarCapacity,54);}
 view.setSpawnDevices(four.map(device=>({...device,id:`replacement:${device.id}`})));assert.equal(view.snapshot().devices.length,4);assert.deepEqual(view.snapshot().resources,initial.resources);
 view.dispose();assert.deepEqual(view.snapshot().resources,{geometries:0,materials:0,textures:0});
});
