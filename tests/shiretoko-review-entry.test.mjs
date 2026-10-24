import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/shiretoko-nature.html',import.meta.url),'utf8');
const links=[...source.matchAll(/<a\b[^>]*data-review-link="([^"]+)"[^>]*href="([^"]+)"/g)]
  .map(([,mode,href])=>[mode,new URL(href.replaceAll('&amp;','&'),'https://reclaim.example/shiretoko-nature.html')]);
const routes=Object.fromEntries(links);
test('development review is reachable by five real local HTML links',()=>{
  assert.deepEqual(Object.keys(routes),['low','balanced','cabin','lake','baseline']);
  for(const url of Object.values(routes)){
    assert.equal(url.origin,'https://reclaim.example');
    assert.equal(url.pathname,'/shiretoko-terrain.html');
    assert.equal(url.hash,'');
  }
});
test('low, balanced, cabin and baseline cannot accidentally alter one another',()=>{
  assert.deepEqual([...routes.low.searchParams.entries()],[['flora','low'],['boardwalk','1']]);
  assert.deepEqual([...routes.balanced.searchParams.entries()],[['flora','balanced'],['boardwalk','1']]);
  assert.deepEqual([...routes.cabin.searchParams.entries()],[['flora','low'],['boardwalk','1'],['cabin','1']]);
  assert.deepEqual([...routes.lake.searchParams.entries()],[['lookout','1']],
    'lake review must be directly reachable without mutating any existing mode');
  assert.equal(routes.baseline.search,'');
});
test('standalone entry has no game save, network, script or TITLE/HOME mutations',()=>{
  assert.match(source,/本編のセーブと接続しない/);
  assert.doesNotMatch(source,/<script\b|<iframe\b|<form\b|localStorage|sessionStorage|fetch\s*\(|https?:\/\//i);
  assert.match(source,/<nav\b[^>]*aria-label=/);
});
