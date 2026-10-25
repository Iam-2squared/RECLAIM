import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { ShiretokoTerrain, LOCATIONS, routeSample } from '../src/shiretoko-phase1/terrain.ts';
import { createFloraReviewLayer } from '../src/shiretoko-phase1/flora-renderer.ts';
import { TerrainWalker } from '../src/shiretoko-phase1/walker.ts';

test('the ACTUAL nature preview wires float32-grounded tree trunks into its independent native walker', () => {
  const preview=readFileSync(new URL('../src/shiretoko-phase1/preview.ts',import.meta.url),'utf8');
  assert(preview.includes('floraReview?.blockedAt(x,z)'),
    'native preview must use the flora collider and not merely expose an unused helper');
  assert(preview.includes('floraReview || cabinReview || boardwalkReview || lakeLookoutReview ? reviewBlocked : undefined'),
    'standalone flora URL must receive real trunk blocking without structural URL flags');
  assert(preview.includes('floraReview?.releaseColliders()'),
    'native preview must release its 10m collision index on WebGL teardown');

  const terrain=new ShiretokoTerrain(),layer=createFloraReviewLayer(terrain,'low');
  assert(layer.treeColliders>100 && layer.treeColliders<layer.instances,
    'only a bounded subset of the existing vegetation can block walkers');
  assert.equal(layer.blockedAt(NaN,0),true);
  assert.equal(layer.blockedAt(Infinity,0),true);
  assert.equal(layer.blockedAt(LOCATIONS[0].x,LOCATIONS[0].z),false,
    'protected travel/intro points must not be obstructed by trees');
  const walker=new TerrainWalker(terrain,undefined,layer.blockedAt);
  const matrix=new T.Matrix4(),pos=new T.Vector3(),scale=new T.Vector3(),orientation=new T.Quaternion();
  let checked=0,approached=false;
  for(const mesh of layer.group.children){
    if(!(mesh instanceof T.InstancedMesh)||!/(spruce|birch)$/.test(mesh.name))continue;
    const kind=mesh.name.split('/').at(-1);
    const trunkRadius=kind==='spruce'?.20:.16;
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      matrix.decompose(pos,orientation,scale);
      assert(layer.blockedAt(pos.x,pos.z),'Float32 visual trunk origin must be solid');
      assert.equal(walker.place(pos.x,pos.z),false,
        'walker cannot teleport inside an opt-in tree trunk');
      checked++;
      if(approached||checked>400)continue;
      const r=.30+trunkRadius*Math.max(scale.x,scale.z);
      for(const candidate of [
        {x:pos.x+1.65,z:pos.z,yaw:Math.PI/2},
        {x:pos.x-1.65,z:pos.z,yaw:-Math.PI/2},
        {x:pos.x,z:pos.z+1.65,yaw:0},
        {x:pos.x,z:pos.z-1.65,yaw:Math.PI},
      ]){
        if(!walker.place(candidate.x,candidate.z))continue;
        const initial=Math.hypot(walker.x-pos.x,walker.z-pos.z);
        walker.yaw=candidate.yaw;
        for(let step=0;step<80;step++){
          walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
          assert(!layer.blockedAt(walker.x,walker.z),
            '60Hz native substeps must not tunnel into a rendered trunk');
        }
        const final=Math.hypot(walker.x-pos.x,walker.z-pos.z);
        if(initial-final>.35 && final>=r-.003 && final<initial){
          approached=true;break;
        }
      }
    }
  }
  assert(checked>100,'inspect actual instanced spruce/birch transforms, not artificial tree coordinates');
  assert(approached,'a walker can approach but never cross a physically visible trunk');
  assert(routeSample(LOCATIONS[0].x,LOCATIONS[0].z).distance>=0);
  const before=layer.drawGroups;
  layer.releaseColliders();
  assert.equal(layer.blockedAt(pos.x,pos.z),false,'released collision index cannot survive page teardown');
  assert.equal(layer.drawGroups,before,'trunk collisions must never add GPU draw calls');
  const geometries=new Set();
  layer.group.traverse(node=>{if(node instanceof T.InstancedMesh){geometries.add(node.geometry);node.dispose();}});
  for(const geometry of geometries)geometry.dispose();
});
