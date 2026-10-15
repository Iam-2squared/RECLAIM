import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignDefaults } from '../src/campaign/index.ts';
import { selectHomeArea, homeArtId, normalizeHomeView } from '../src/home-presentation.ts';

test('HOME initial background is Shiretoko and a locked request cannot reveal a future region',()=>{
 const campaign=campaignDefaults();
 assert.equal(selectHomeArea(campaign,'shiretoko','ishikari-mountains'),'shiretoko');
 assert.equal(selectHomeArea(campaign,'shiretoko','sapporo'),'shiretoko');
 assert.equal(selectHomeArea(campaign,'shiretoko','not-an-area'),'shiretoko');
 assert.equal(homeArtId('shiretoko'),'shiretoko');
 assert.equal(homeArtId('sapporo'),null);
});

test('model preview never claims a 3D render when WebGL is unavailable',()=>{
 assert.equal(normalizeHomeView('model',false),'cinematic');
 assert.equal(normalizeHomeView('model',true),'model');
 assert.equal(normalizeHomeView('not-a-view',true),'cinematic');
});
