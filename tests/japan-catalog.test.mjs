import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JAPAN_REGIONS,JAPAN_PREFECTURES,prefectureByCode,prefecturesIn,catalogCoverage,validateJapanCatalog} from '../src/world/japan-catalog.ts';

test('Japan catalog has all 47 prefectures with 9 nonempty regions and canonical stable identifiers',()=>{
 assert.deepEqual(validateJapanCatalog(),[]);
 assert.equal(JAPAN_PREFECTURES.length,47);
 assert.equal(JAPAN_REGIONS.length,9);
 assert.deepEqual(JAPAN_REGIONS.map(r=>prefecturesIn(r).length),[1,6,7,9,7,5,4,7,1]);
 assert.equal(prefectureByCode('01')?.nameJa,'北海道');
 assert.equal(prefectureByCode('13')?.nameJa,'東京都');
 assert.equal(prefectureByCode('47')?.nameJa,'沖縄県');
 assert.equal(prefectureByCode('48'),undefined);
 assert.equal(prefectureByCode('1'),undefined);
});
test('catalogue does not unlock or fabricate terrain, and recognizes only the existing four local Hokkaido demos',()=>{
 const status=catalogCoverage();
 assert.deepEqual(status,{catalogued:47,withLocalPrototype:1,terrainPrototypes:0,explorable:0,polished:0});
 assert.deepEqual(prefectureByCode('01')?.prototypeAreaIds,['shiretoko','ishikari-mountains','hidaka-mountains','sapporo']);
 assert(JAPAN_PREFECTURES.every(p=>p.stage==='catalog-only'));
 assert(JAPAN_PREFECTURES.slice(1).every(p=>p.prototypeAreaIds.length===0));
 assert(Object.isFrozen(JAPAN_PREFECTURES));
 assert(JAPAN_PREFECTURES.every(Object.isFrozen));
});
