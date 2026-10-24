import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const terrain=readFileSync(new URL('../shiretoko-terrain.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/shiretoko-phase1/preview.css',import.meta.url),'utf8');
const intro=readFileSync(new URL('../public/shiretoko-nature.html',import.meta.url),'utf8');

test('baseline offers one direct 3D nature/cabin/boardwalk link, without a saved-game side effect',()=>{
  const links=[...terrain.matchAll(/<a\b[^>]*data-nature-entry\b[^>]*href="([^"]+)"[^>]*>/g)];
  assert.equal(links.length,1,'only one canonical direct nature gateway');
  const address=new URL(links[0][1].replaceAll('&amp;','&'),'https://reclaim.example/shiretoko-terrain.html');
  assert.equal(address.origin,'https://reclaim.example');
  assert.equal(address.pathname,'/shiretoko-terrain.html');
  assert.deepEqual([...address.searchParams.entries()],[
    ['flora','low'],['boardwalk','1'],['cabin','1'],
  ],'load genuine low-density flora, wooden path and enterable cabin together');
  assert.equal(address.hash,'');
  assert.match(links[0][0],/aria-label="[^"]+"/,'keyboard link needs an accessible name');
  assert.match(styles,/\.view-tools \.nature-direct-link:focus-visible\{/,
    'visible keyboard focus for the 3D entry');
});

test('old physical terrain baseline, intro and standalone route chooser stay intact',()=>{
  assert.match(terrain,/<script type="module" src="\/src\/shiretoko-phase1\/preview\.ts"><\/script>/);
  assert.match(terrain,/<button id="intro-open">イントロ試作<\/button>/);
  assert.match(terrain,/<button id="walk">この場所を歩く/);
  assert.match(terrain,/href="\.\/shiretoko-terrain\.html\?flora=low&amp;boardwalk=1&amp;cabin=1"/);
  assert.doesNotMatch(terrain,/localStorage|sessionStorage|fetch\s*\(/);
  assert.match(intro,/data-review-link="baseline" href="\.\/shiretoko-terrain\.html"/,
    'baseline review must still load the unflagged terrain URL');
  assert.match(intro,/data-review-link="lake" href="\.\/shiretoko-terrain\.html\?lookout=1&amp;flora=low"/,
    'lake mode remains a separate explicit visual scene');
});
