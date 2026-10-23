import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../public/japan-catalog-review.html',import.meta.url),'utf8');

test('standalone catalog route has 47 unique JIS identifiers across 9 review regions',()=>{
  const codes=[...html.matchAll(/<article class="pref"[^>]*>\s*<span class="code">(\d\d)<\/span>/g)].map(m=>m[1]);
  assert.deepEqual(codes,Array.from({length:47},(_,i)=>String(i+1).padStart(2,'0')));
  const regions=[...html.matchAll(/<section class="region" data-region="([a-z]+)"/g)].map(m=>m[1]);
  assert.deepEqual(regions,['hokkaido','tohoku','kanto','chubu','kinki','chugoku','shikoku','kyushu','okinawa']);
  assert.match(html,/北海道/);assert.match(html,/東京都/);assert.match(html,/沖縄県/);
});

test('catalog clearly distinguishes registration from explorable 3D regions',()=>{
  assert.match(html,/登録＝完成ではありません/);
  assert.match(html,/県単位の探索可能/);
  assert.equal((html.match(/CATALOG ONLY/g)||[]).length,47);
  assert.match(html,/ゲーム進行とセーブを変更しません/);
});

test('review page is independent, responsive, keyboard accessible and needs no account/remote assets',()=>{
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/<label for="search">/);assert.match(html,/<label for="region-filter">/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/@media\(max-width:650px\)/);
  assert.match(html,/prefers-reduced-motion/);
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(html,/(localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest)/);
  assert.doesNotMatch(html,/id="(start-button|home-button|mission-resume)"/);
});
