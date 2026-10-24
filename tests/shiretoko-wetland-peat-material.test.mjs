import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShiretokoTerrain} from '../src/shiretoko-phase1/terrain.ts';
import {terrainMaterial} from '../src/shiretoko-phase1/materials.ts';

test('moisture-driven peat mosaic is part of real 5m terrain shader, not a decal or new draw group',()=>{
  const detail=new T.Texture();
  const shader=terrainMaterial(detail);
  assert(shader instanceof T.ShaderMaterial);
  assert.equal(shader.uniforms.uDetail.value,detail,'the existing single tile is reused');
  assert.deepEqual(Object.keys(shader.uniforms).sort(),['uDetail','uElevation','uSun'],
    'no new texture sampler, renderer binding, or per-frame uniform');
  assert.match(shader.vertexShader,/vWet=aWetness;/,
    'moisture is the real shared terrain/chunk vertex attribute');
  assert.match(shader.fragmentShader,/float wetlandMask=clamp\(vWet,0\.,1\.\)/,
    'wet regions alone should carry dark organic ground');
  assert.match(shader.fragmentShader,/\(1\.-smoothstep\(\.08,\.24,slope\)\)\*\(1\.-rock\)/,
    'steep exposed rocks remain unchanged instead of receiving painted peat');
  assert.match(shader.fragmentShader,/float peatVeins=smoothstep\(\.40,\.75,peatLitter\*\.68\+ground\.b\*\.32\);/,
    'mosaic must vary using real periodic procedural detail');
  assert.match(shader.fragmentShader,/albedo=mix\(albedo,darkPeat,wetPeatPatch\);/,
    'patch is applied only to physically rendered land, before snow');
  assert(!shader.vertexShader.includes('wetPeatPatch'),
    'walk/contact mesh and its vertex displacement remain untouched');
  shader.dispose();detail.dispose();
});

test('the existing physical marsh and dry headland carry different verified wetness data',()=>{
  const terrain=new ShiretokoTerrain();
  const marsh=terrain.vertexAt(-10,490);
  const cabin=terrain.vertexAt(-100,835);
  assert(marsh.wetness>.5,'real source marsh pool provides a hydrated ground signal');
  assert(cabin.wetness<marsh.wetness-.3,'dry residential plateau is not stained equally');
  assert(marsh.normal.every(Number.isFinite)&&cabin.normal.every(Number.isFinite));
  assert.equal(terrain.inWater(-10,490),true,'wetland water surface is a separate real basin mesh');
});
