import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{SapporoEncounterDirector}from'../src/mission/sapporo-encounter.ts';
import{SapporoMapPhysics}from'../src/world/sapporo-map-physics.ts';
import{SAPPORO_MAP_META as meta}from'../src/world/sapporo-map-meta.ts';

test('all100 Sapporo street guards use the actual authored dry, clear ground and avoid both arenas and arrival',async()=>{
 const data=JSON.parse(await readFile(new URL('../public/sapporo-map/physics.json',import.meta.url),'utf8')),terrain=new SapporoMapPhysics(data),exclusions=[{position:meta.spawn,radius:24},...Object.values(meta.bossArenas).map(arena=>({position:arena.center,radius:arena.radius}))];
 const d=new SapporoEncounterDirector({roads:meta.roads,terrain,exclusions});assert.equal(d.spawnPoints.length,100);assert.equal(d.units.length,50);assert.ok(d.snapshot().placement.minimumSpacing>50,'guards should be sparse across the authored city');
 for(const point of d.spawnPoints){
  assert.equal(terrain.inWater(point.x,point.z,point.y),false);assert.equal(terrain.blockedAt(point.x,point.z,point.y,.65,2.3),false);assert.ok(Math.abs(terrain.heightAt(point.x,point.z,point.y)-point.y)<1e-5);
  assert.ok(point.x>meta.bounds.minX&&point.x<meta.bounds.maxX&&point.z>meta.bounds.minZ&&point.z<meta.bounds.maxZ);
  for(const area of exclusions)assert.ok(Math.hypot(point.x-area.position.x,point.z-area.position.z)>=area.radius+1);
 }
 const xs=d.spawnPoints.map(p=>p.x),zs=d.spawnPoints.map(p=>p.z);assert.ok(Math.max(...xs)-Math.min(...xs)>2000);assert.ok(Math.max(...zs)-Math.min(...zs)>2000);
 d.step(300,{x:10000,y:0,z:10000});assert.equal(d.units.length,100);assert.ok(d.units.every(u=>u.machine.level===1));
});
