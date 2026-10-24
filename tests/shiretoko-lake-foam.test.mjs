import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain,BASINS} from '../src/shiretoko-phase1/terrain.ts';
import {basinWaterMesh} from '../src/shiretoko-phase1/water.ts';
import {waterMaterial} from '../src/shiretoko-phase1/materials.ts';

test('moving foam uses the actual terrain-height shoreline, not an arbitrary decal or a displaced surface',()=>{
  const detail=new T.Texture(),height=new T.Texture();
  const shader=waterMaterial(detail,height,149);
  assert(shader instanceof T.ShaderMaterial);
  assert.equal(shader.uniforms.uLevel.value,149);
  assert.match(shader.fragmentShader,/float shoreDepth=max\(0\.,uLevel-floorY\)/);
  assert.match(shader.fragmentShader,/float lakeFoam=.*smoothstep\(\.15,2\.6,shoreDepth\)/);
  assert.match(shader.fragmentShader,/float foam=uLevel>1\.\?lakeFoam:seaFoam;/);
  assert.match(shader.fragmentShader,/float seaFoam=\(1\.-smoothstep\(0\.,11\.,uLevel-floorY\)\)\*\(\.3\+wave\*\.45\+grain\*\.25\)/,
    'existing sea-edge formula remains exactly intact');
  assert(!shader.vertexShader.includes('uTime'),
    'surface geometry must not move independently of 5m ground/collision');
  shader.dispose();detail.dispose();height.dispose();
});

test('highland lake retains both shallow canonical shoreline and deep uncluttered water',()=>{
  const terrain=new ShiretokoTerrain();
  const lake=BASINS.find(b=>b.id==='highland-lake');
  assert(lake && lake.level>1);
  const mesh=basinWaterMesh(terrain,lake);
  assert(mesh.indices.length>0);
  let shallow=0,deep=0;
  for(let i=0;i<mesh.positions.length;i+=3){
    const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2];
    assert(Math.abs(y-lake.level)<.0001,'shader-only foam cannot distort actual flat water polygon');
    const depth=lake.level-terrain.heightAt(x,z);
    if(depth>=0 && depth<2.6)shallow++;
    if(depth>3.0)deep++;
  }
  assert(shallow>10,'shallow 5m-sampled lake shoreline actually exists for lapping pixels');
  assert(deep>100,'most of the open lake must remain unfoamed');
});
