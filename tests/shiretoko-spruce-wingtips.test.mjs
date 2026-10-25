import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShiretokoTerrain } from '../src/shiretoko-phase1/terrain.ts';
import { createFloraReviewLayer } from '../src/shiretoko-phase1/flora-renderer.ts';

// Real geometry test: visible offset wingtip needles must be baked into the
// original per-species draw group. They cannot add independent scene meshes,
// ground samples, water/route occupancy, transparencies or save writes.
test('wind-offset 3D spruce crown wingtips preserve one bounded instanced species mesh',()=>{
  const terrain=new ShiretokoTerrain();
  const layer=createFloraReviewLayer(terrain,'low');
  const spruces=layer.group.children.filter(node=>
    node instanceof T.InstancedMesh&&node.name.endsWith('/spruce'));
  assert(spruces.length>0,'existing low-quality landscape must contain actual spruces');
  assert(layer.drawGroups<=96,'no added GPU groups from new crown geometry');
  const geometry=spruces[0].geometry;
  assert(spruces.every(mesh=>mesh.geometry===geometry),
    'all 600m spruce cells must share one actual GPU geometry');
  const p=geometry.getAttribute('position'),c=geometry.getAttribute('color');
  assert(p.count<500,'twenty-four wingtip vertices fit the existing spruce cost envelope');
  assert.equal(p.count,c.count,'colour and real vertex arrays stay aligned');
  assert(geometry.boundingBox?.min.y>=-.001&&geometry.boundingBox.max.y<10,
    'widened spruce crown remains rooted and bounded');
  for(const tip of [
    {color:0x2f4939,side:-1},
    {color:0x456248,side:1},
  ]){
    const rgb=new T.Color(tip.color).toArray().map(x=>Math.round(x*255)).join(',');
    const vertices=[];
    for(let i=0;i<p.count;i++){
      const actual=[c.getX(i),c.getY(i),c.getZ(i)]
        .map(x=>Math.round(x*255)).join(',');
      if(actual===rgb)vertices.push([p.getX(i),p.getY(i),p.getZ(i)]);
    }
    assert.equal(vertices.length,12,'each tip is a real 3D tetrahedron, not a billboard');
    assert(vertices.every(([x,y])=>tip.side*x>1.0&&y>3.1&&y<5.7),
      'offset needles extend sideways from and overlap the real lower spruce crown');
    assert(Math.max(...vertices.map(v=>v[2]))-Math.min(...vertices.map(v=>v[2]))>.35,
      'wingtip geometry has meaningful world-depth, not one flat sprite');
  }
  const shared=new Set();
  layer.group.traverse(o=>{
    if(o instanceof T.InstancedMesh){shared.add(o.geometry);o.dispose();}
  });
  for(const g of shared)g.dispose();
  layer.group.clear();
});
