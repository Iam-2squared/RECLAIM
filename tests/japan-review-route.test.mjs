import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JAPAN_PREFECTURES,JAPAN_REGIONS,catalogCoverage,validateJapanCatalog} from '../src/world/japan-catalog.ts';
const review=new URL('../public/reclaim-review/japan-catalog.html',import.meta.url);
const html=await readFile(review,'utf8');
const match=html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/);
test('published development review contains the exact validated 47-prefecture catalog',()=>{
 assert.deepEqual(validateJapanCatalog(),[]);
 assert(match,'read-only catalog payload must be embedded locally');
 const data=JSON.parse(match[1]);
 assert.equal(data.prefectures.length,47);
 assert.equal(Object.keys(data.regions).length,9);
 assert.deepEqual(Object.keys(data.regions),[...JAPAN_REGIONS]);
 assert.deepEqual(data.prefectures.map(p=>[p.code,p.name,p.region,p.stage,p.demos]),
   JAPAN_PREFECTURES.map(p=>[p.code,p.nameJa,p.region,p.stage,[...p.prototypeAreaIds]]));
 assert.equal(catalogCoverage().terrainPrototypes,0);
 assert.equal(catalogCoverage().explorable,0);
 assert.equal(data.story.length,18);
 assert.equal(data.story.filter(n=>n.includes('東京')).length,2);
});
test('isolated review cannot fetch remote assets or access saved campaign state',()=>{
 assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker)\b/.test(html));
 assert(!/<script[^>]+src=/.test(html));
 assert(!/<link[^>]+href=/.test(html));
 assert(/noindex,nofollow/.test(html));
 assert(/stage/i.test(html));
});
