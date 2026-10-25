import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShiretokoTerrain, routeSample } from '../src/shiretoko-phase1/terrain.ts';
import { createFloraReviewLayer } from '../src/shiretoko-phase1/flora-renderer.ts';

test('opt-in flora creates physical-grounded instanced 3D with bounded draw calls and safe travel clearances',()=>{
  const terrain=new ShiretokoTerrain();
  const layer=createFloraReviewLayer(terrain,'low');
  assert(layer.instances>1200 && layer.instances<16_000, 'bounded sparse low-quality flora');
  assert(layer.drawGroups>0 && layer.drawGroups<=96);
  assert.equal(layer.quality,'low');
  assert.equal(layer.instanceBytes,layer.instances*76);
  const seen=new Set(),trees=new Set(),matrix=new THREE.Matrix4(),translation=new THREE.Vector3();
  let total=0,foundTalus=false,foundHighlandShrub=false,foundDeadwood=false,foundMeadowGrass=false;
  layer.group.traverse(node=>{
    if(!(node instanceof THREE.InstancedMesh))return;
    assert(node.count>0 && node.count<=layer.instances);
    assert(node.name.startsWith('flora/review/600m-'));
    assert(node.instanceColor && node.instanceColor.count===node.count);
    assert(node.frustumCulled, '600m cells must remain frustum-cullable');
    assert(node.boundingSphere && Number.isFinite(node.boundingSphere.radius));
    assert(node.geometry.getAttribute('color')?.count===node.geometry.getAttribute('position')?.count);
    assert(node.geometry.getAttribute('normal')?.count===node.geometry.getAttribute('position')?.count);
    if(node.name.endsWith('/spruce')||node.name.endsWith('/birch')){
      const species=node.name.split('/').at(-1);
      trees.add(species);
      const bounds=node.geometry.boundingBox;
      assert(bounds,'shared tree geometry must have CPU bounds for frustum culling');
      assert(bounds.min.y>=-.001,'tree geometry must be rooted at the ground');
      assert(bounds.max.y>(species==='spruce'?8.4:8.0) && bounds.max.y<10,
        'mature tree silhouette remains distinct and within the draw-budget envelope');
      assert(bounds.max.x-bounds.min.x>2.5,'crown must have real lateral branches');
      assert(node.geometry.getAttribute('position').count<500,
        'visual improvement must not explode per-instance vertex cost');
      if(species==='spruce'){
        // The lower boughs must be physical three-dimensional silhouettes,
        // not a billboard or extra instanced/material draw group.
        const p=node.geometry.getAttribute('position'),c=node.geometry.getAttribute('color');
        const quadrants=new Set(),swatches=new Set();
        for(let v=0;v<p.count;v++){
          const x=p.getX(v),y=p.getY(v),z=p.getZ(v);
          if(y>2.6&&y<4.9&&Math.hypot(x,z)>1.55)
            quadrants.add(`${x>=0?'+':'-'}${z>=0?'+':'-'}`);
          swatches.add([0,1,2].map(component=>Math.round(c.getComponent(v,component)*255)).join(','));
        }
        assert(quadrants.size>=4,
          'grounded spruce needs distinct drooping 3D lower boughs in all lateral directions');
        assert(swatches.size>=10,
          'multiple lower needle colours must remain in the original vertex-coloured species mesh');
      }
      if(species==='birch'){
        // Fork limbs and dark lenticels remain vertex colours in the one
        // cullable instanced mesh, not separate expensive transparent planes.
        const colours=node.geometry.getAttribute('color'),swatches=new Set();
        for(let v=0;v<colours.count;v++)
          swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
        assert(swatches.size>=8,
          'pale fork wood and two-tone dark bark marks must be real geometry');
        assert(bounds.min.x<-.9&&bounds.max.x>.9,
          'uneven emerging forks extend outside the bare trunk silhouette');
      }
    }
    if(node.name.endsWith('/alpine-shrub')){
      foundHighlandShrub=true;
      const geometry=node.geometry,bounds=geometry.boundingBox;
      assert(bounds,'highland shrubs need real culling bounds');
      assert(bounds.min.y>=-.05 && bounds.max.y>1.35 && bounds.max.y<1.7,
        'rooted uneven highland shoots must have separate raised crowns');
      assert(geometry.getAttribute('position').count<450,
        'woody shoots and seed heads remain within one low-poly species geometry');
      // Real sampled instanced matrices should differ in horizontal spread
      // without taller, route-blocking shrub crowns or new GPU groups.
      const shrubMatrix=new THREE.Matrix4(),shrubScale=new THREE.Vector3();
      for(const i of [0,Math.floor(node.count/2),node.count-1]){
        node.getMatrixAt(i,shrubMatrix);shrubScale.setFromMatrixScale(shrubMatrix);
        assert(shrubScale.x>shrubScale.y*1.03,'wind-shaped scrub is wider than tall');
        assert(shrubScale.x<1.65&&shrubScale.z<1.5,
          'shrub footprint remains small relative to the original route and structure clearance');
        assert(shrubScale.y>.6&&shrubScale.y<1.2,
          'horizontal scrub does not become tall invented forest');
      }
      const swatches=new Set(),colours=geometry.getAttribute('color');
      for(let v=0;v<colours.count;v++)
        swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
      assert(swatches.size>=7,'shoot bark, crowns and seed tips use actual distinct vertex colours');
    }
    if(node.name.endsWith('/sasa')){
      const geometry=node.geometry,bounds=geometry.boundingBox;
      assert(bounds,'sasa requires bounded shared low-poly leaf geometry');
      assert(bounds.min.y>=-.02 && bounds.max.y>1.0 && bounds.max.y<1.45,
        'all bent leaves remain visibly rooted and inside the existing understorey envelope');
      assert(bounds.max.x-bounds.min.x>.48 && bounds.max.z-bounds.min.z>.48,
        'sasa fans out in real 3D, not four identical coplanar billboards');
      assert(geometry.getAttribute('position').count<100,
        'six tapered leaves and one stalk stay in the existing single instanced mesh');
      assert.equal(geometry.getAttribute('uv')?.count,geometry.getAttribute('position').count,
        'tapered leaf UVs must merge with the rooted stem in the same real geometry');
      const swatches=new Set(),colours=geometry.getAttribute('color');
      for(let v=0;v<colours.count;v++)
        swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
      assert(swatches.size>=5,'leaf variation is vertex colour, not new textures or draw groups');
    }
    if(node.name.endsWith('/meadow-grass')){
      foundMeadowGrass=true;
      const g=node.geometry,p=g.getAttribute('position'),colours=g.getAttribute('color');
      assert(g.boundingBox && g.boundingBox.min.y>=-.02 && g.boundingBox.max.y>.65
        && g.boundingBox.max.y<.90,'short grasses stay rooted below shrubs and mature sedges');
      assert(p.count>90&&p.count<160,'eight bent blades and one rooted crown fit a small shared mesh');
      assert.equal(g.getAttribute('uv')?.count,p.count,'ribbons retain merge-safe UV attributes');
      const unique=new Set();
      for(let i=0;i<colours.count;i++)
        unique.add([0,1,2].map(k=>Math.round(colours.getComponent(i,k)*255)).join(','));
      assert(unique.size>=10,'bent blades and two mature seed grain colours stay in one geometry');
      // Seed heads must be ACTUAL coloured 3D vertices, not screen overlays or
      // detached scene objects. Their small panicles sit above the leaf fan
      // and safely under the unchanged <0.90m lowland foliage bound.
      for(const hex of [0xa69a66,0x988961]){
        const c=new THREE.Color(hex);
        const swatch=[c.r,c.g,c.b].map(n=>Math.round(n*255)).join(',');
        const heights=[];
        for(let i=0;i<p.count;i++){
          const actual=[0,1,2].map(k=>Math.round(colours.getComponent(i,k)*255)).join(',');
          if(actual===swatch)heights.push(p.getY(i));
        }
        assert(heights.length>=12,'each mature seed has a non-billboard tetrahedral head');
        assert(heights.every(y=>y>.62&&y<.85),
          'seed heads emerge above grass but never become oversized floating ornaments');
      }
    }
    if(node.name.endsWith('/sedge')){
      const geometry=node.geometry,bounds=geometry.boundingBox;
      assert(bounds,'each sedge shared geometry needs a culling bound');
      assert(bounds.min.y>=-.05 && bounds.max.y>1.3 && bounds.max.y<1.55,
        'native wetland sedges should have rooted stalks and visible mature seed spikes');
      const vertices=geometry.getAttribute('position');
      assert(vertices.count>190&&vertices.count<240,
        'six real tapered sedge leaf ribbons and seed spikes share a bounded GPU species mesh');
      assert.equal(geometry.getAttribute('uv')?.count,vertices.count,
        'leaf, stalk and seed UV attributes must merge into one real sedge mesh');
      assert(bounds.max.x-bounds.min.x>.30 && bounds.max.z-bounds.min.z>.30,
        'wetland sedges must bend outward in two world axes, not repeat five flat upright quads');
      const swatches=new Set(),colours=geometry.getAttribute('color');
      for(let v=0;v<colours.count;v++)
        swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
      assert(swatches.size>=8,
        'six genuine blade colours, stalk and small seeds share a single existing draw group');
    }
    if(node.name.endsWith('/deadwood')){
      foundDeadwood=true;
      const geometry=node.geometry,bounds=geometry.boundingBox;
      assert(bounds,'deadfall must have real frustum bounds');
      assert(bounds.min.y>=-.05&&bounds.max.y<1.1,
        'mossy fallen trunks remain low and physically rooted');
      assert(bounds.max.x-bounds.min.x>3,
        'deadfall must be recognisably horizontal rather than another cone-tree');
      assert(geometry.getAttribute('position').count<400,
        'shared bark, twigs and moss must stay inside the vertex budget');
      const swatches=new Set(),colours=geometry.getAttribute('color');
      for(let v=0;v<colours.count;v++)
        swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
      assert(swatches.size>=5,'bark, two branch woods and moss use merged vertex colours');
      // Confirm BOTH oriented crosscut faces are actually baked into the
      // same instanced woodland mesh (not loose decoration/draw calls).
      const positions=geometry.getAttribute('position');
      const ends=[new Set(),new Set()];
      for(let v=0;v<positions.count;v++){
        const x=positions.getX(v),y=positions.getY(v),z=positions.getZ(v);
        if(Math.abs(Math.abs(x)-1.581)>.012 || Math.abs(y-.205)>.215 || Math.abs(z)>.215)continue;
        const rgb=[0,1,2].map(k=>Math.round(colours.getComponent(v,k)*255)).join(',');
        ends[x<0?0:1].add(rgb);
      }
      for(const side of ends){
        for(const hex of [0xbba17e,0x88694e]){
          const c=new THREE.Color(hex);
          const colour=[c.r,c.g,c.b].map(n=>Math.round(n*255)).join(',');
          assert(side.has(colour),'both end faces show genuine concentric wood colours');
        }
      }
      // Two differently coloured, three-dimensional bracket caps are
      // welded into the existing horizontal log geometry on both bark
      // flanks, rather than extra loose scene objects or billboard decals.
      for(const hex of [0xbba37a,0xc6b48d]){
        const c=new THREE.Color(hex),actual=[];
        const targetChannels=[c.r,c.g,c.b].map(channel=>Math.round(channel*255));
        for(let v=0;v<positions.count;v++){
          const rgb=[0,1,2].map(k=>Math.round(colours.getComponent(v,k)*255));
          if(rgb.every((n,k)=>Math.abs(n-targetChannels[k])<=1))
            actual.push([positions.getX(v),positions.getY(v),positions.getZ(v)]);
        }
        assert(actual.length>=12,'each faceted native bark fungus has four genuine depth-bearing faces');
        assert(actual.some(([x,y,z])=>Math.abs(z)>.23 && y>.29 && y<.58),
          'bracket projects beyond the log bark but stays rooted below knee height');
      }
      assert(geometry.getAttribute('position').count<400,
        'fungus shapes must remain in the existing deadwood species vertex envelope');
      assert(bounds.min.y>=-.05&&bounds.max.y<1.1,
        'thin end-grain faces may not raise deadfall or invalidate 5m ground contact');
    }
    if(node.name.endsWith('/stone')){
      foundTalus=true;
      const geometry=node.geometry, bounds=geometry.boundingBox;
      const vertices=geometry.getAttribute('position'), colours=geometry.getAttribute('color');
      assert(bounds, 'instanced stone cluster must have a shared bounding box');
      assert(vertices.count>=120&&vertices.count<350,
        'three-facet talus replaces one pebble without excessive per-instance vertices');
      assert(bounds.min.y>=-.12&&bounds.max.y<1.05,
        'talus boulders remain rooted at the sampled physical ground, never hovering');
      assert(bounds.max.x-bounds.min.x>1.7,
        'stone silhouette must include separate lateral talus fragments');
      const swatches=new Set();
      for(let v=0;v<colours.count;v++)
        swatches.add([0,1,2].map(c=>Math.round(colours.getComponent(v,c)*255)).join(','));
      assert.equal(swatches.size,5,'three talus fragments and two embedded mineral fracture caps share one vertex-coloured species mesh');
    }
    seen.add(node.geometry);total+=node.count;
    const sampled=[0,Math.floor(node.count/2),node.count-1];
    for(const i of sampled){
      node.getMatrixAt(i,matrix);translation.setFromMatrixPosition(matrix);
      for(const c of translation.toArray())assert(Number.isFinite(c));
      assert(translation.x>=-1200 && translation.x<1200);
      assert(translation.z>=-1200 && translation.z<1200);
      assert(Math.abs(translation.y-terrain.heightAt(translation.x,translation.z))<.0001,'same 5m collision surface');
      assert(routeSample(translation.x,translation.z).distance>=8,'no props in route');
      assert(!terrain.inWater(translation.x,translation.z),'no submerged props');
    }
  });
  assert.equal(total,layer.instances);
  assert(seen.size<=8,'all 600m culling groups must share species geometries');
  assert(foundMeadowGrass,'real Shiretoko lowland must contain native-looking grass tufts');
  assert.deepEqual([...trees].sort(),['birch','spruce'],'both mature species rendered in low-quality mode');
  assert(foundTalus,'real terrain should render talus in the low setting');
  assert(foundDeadwood,'real dry Shiretoko forest must contain some low-cost fallen logs');
  assert(foundHighlandShrub,'highland must include natural rooted shrubs in low setting');
  assert.equal(layer.group.children.filter(x=>x.isLight).length,2,'review-only light setup');
  for(const g of seen)g.dispose();
  for(const node of layer.group.children)if(node instanceof THREE.InstancedMesh)node.dispose();
  layer.group.clear();
});

test('invalid quality is rejected before allocating scene resources',()=>{
  assert.throws(()=>createFloraReviewLayer({},'ultra'),RangeError);
});
