import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShiretokoTerrain, routeSample } from '../src/shiretoko-phase1/terrain.ts';
import { createFloraReviewLayer } from '../src/shiretoko-phase1/flora-renderer.ts';

test('real 2.4km woodland contains deterministic mixed-age canopies without moving planted ground or adding draws',()=>{
  const terrain=new ShiretokoTerrain();
  const layer=createFloraReviewLayer(terrain,'low');
  assert(layer.instances>1200&&layer.instances<16000);
  assert(layer.drawGroups<=96,'age variety may not increase GPU draw groups');
  assert.equal(layer.instanceBytes,layer.instances*76,'exact old instanced matrix and tint bytes');
  const kinds=new Map([['birch',[]],['spruce',[]]]);
  const shared=new Map(),matrix=new T.Matrix4(),p=new T.Vector3(),scale=new T.Vector3();
  let counted=0;
  for(const child of layer.group.children){
    if(!(child instanceof T.InstancedMesh))continue;
    const kind=child.name.split('/').at(-1);
    if(!kinds.has(kind))continue;
    const geometry=shared.get(kind);
    if(geometry)assert.equal(child.geometry,geometry,'one actual geometry per tree species');
    else shared.set(kind,child.geometry);
    assert(child.boundingSphere?.radius>0 && child.frustumCulled,'bounded 600m chunk');
    for(let i=0;i<child.count;i++){
      child.getMatrixAt(i,matrix);
      p.setFromMatrixPosition(matrix);
      scale.setFromMatrixScale(matrix);
      assert(scale.x>0&&scale.y>0&&scale.z>0,'only physical positive tree sizes');
      kinds.get(kind).push(scale.y);
      counted++;
      if(i%31===0){
        assert(Math.abs(p.y-terrain.heightAt(p.x,p.z))<.0002,'all ages rooted to exact float32 world surface');
        assert(routeSample(p.x,p.z).distance>=8,'no age intersects protected trail');
        assert(!terrain.inWater(p.x,p.z),'no canopy planted on open water');
      }
    }
  }
  assert(counted>150,'actual review forest has hundreds of mature/young tree variants');
  for(const kind of ['birch','spruce']){
    const heights=kinds.get(kind).sort((a,b)=>a-b);
    assert(heights.length>30,kind+' exists in real low-detail scene');
    assert(heights[Math.floor(heights.length*.10)]<.87,
      kind+' must include genuine shorter young canopy, not identical full-height clones');
    assert(heights[Math.floor(heights.length*.90)]>1.24,
      kind+' must include emergent mature crown without any additional trees');
    assert(heights.at(-1)-heights[0]>.65,'measurable actual height range across one shared species');
  }
  for(const child of layer.group.children)
    if(child instanceof T.InstancedMesh)child.dispose();
  for(const geom of new Set(shared.values()))geom.dispose();
  layer.group.clear();
});
