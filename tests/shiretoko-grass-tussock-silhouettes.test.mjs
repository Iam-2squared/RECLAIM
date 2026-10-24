import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {createFloraReviewLayer} from '../src/shiretoko-phase1/flora-renderer.ts';

test('wind-bent sedge and meadow grass form wider actual 3D fans without new population grids',()=>{
 const terrain=new ShiretokoTerrain();
 const layer=createFloraReviewLayer(terrain,'low');
 const species=new Set(),globalCount=layer.instances;
 const ratiosBySpecies=new Map([['sedge',new Set()],['meadow-grass',new Set()]]);
 const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3();
 let collected=0;
 layer.group.traverse(mesh=>{
  if(!(mesh instanceof T.InstancedMesh))return;
  collected+=mesh.count;
  const kind=mesh.name.split('/').at(-1);
  if(kind!=='sedge'&&kind!=='meadow-grass')return;
  species.add(kind);
  const bounds=mesh.geometry.boundingBox;
  assert(bounds,'width must come from native visible geometry');
  assert(bounds.min.y>=-.02,'all original root elevations remain grounded');
  assert(bounds.max.y< (kind==='sedge'?1.55:.9),
   'new spread must not raise the grass above its native height envelope');
  const width=bounds.max.x-bounds.min.x,depth=bounds.max.z-bounds.min.z;
  assert(width>(kind==='sedge'?.60:.85)&&depth>(kind==='sedge'?.60:.85),
   'both horizontal axes need genuine leaf-fan spread rather than extra copies');
  const verts=mesh.geometry.getAttribute('position').count;
  assert(verts<(kind==='sedge'?240:160),'existing low-poly per-instance vertex budget');
  assert.equal(mesh.geometry.getAttribute('uv').count,verts);
  for(const i of [0,Math.floor(mesh.count/2),mesh.count-1]){
   mesh.getMatrixAt(i,matrix);
   position.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);
   assert(Math.abs(position.y-terrain.heightAt(position.x,position.z))<.0002,
     'all physical plant origins still use authoritative 5m height');
   assert(scale.x>0&&scale.z>0&&scale.y>0);
   ratiosBySpecies.get(kind).add((scale.x/scale.y).toFixed(5)+':'+(scale.z/scale.y).toFixed(5));
  }
 });
 assert.equal(collected,globalCount,'real render does not allocate hidden foliage copies');
 assert.deepEqual([...species].sort(),['meadow-grass','sedge']);
 // An individual 600m culling bucket may legitimately contain only ONE
 // visible plant; variation is therefore verified across the WHOLE species.
 for(const kind of species)assert(ratiosBySpecies.get(kind).size>=3,
   `sampled ${kind} must retain multiple native X/Y and Z/Y proportions`);
 assert(globalCount>1200&&globalCount<16000,'unchanged low-density planner/culling limits');
 assert.equal(layer.instanceBytes,globalCount*76);
 assert(layer.drawGroups<=96);
 layer.group.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});
 layer.group.clear();
});
