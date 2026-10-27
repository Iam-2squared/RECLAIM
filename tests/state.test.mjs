import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenState, parsePreferences, REVEAL_MS, REVEAL_COOLDOWN_MS } from '../src/state.ts';

test('every new session starts at title, not gameplay',()=>{const s=new ScreenState();assert.equal(s.screen,'title');assert.equal(s.squadPreview,false);assert.equal(s.bossOpacity(2000),0);});
test('boss is hidden until deliberate activation',()=>{const s=new ScreenState();assert.equal(s.bossOpacity(900000),0);assert.equal(s.reveal(1000),true);assert(s.bossOpacity(1500)>0);});
test('brief reveal expires without a lingering silhouette',()=>{const s=new ScreenState();s.reveal(500);assert.equal(s.bossOpacity(500+REVEAL_MS),0);assert.equal(s.revealStarted,null);});
test('repeated clicks cannot extend the reveal or skip cooldown',()=>{const s=new ScreenState();s.reveal(0);assert.equal(s.reveal(300),false);assert.equal(s.revealStarted,0);assert.equal(s.reveal(REVEAL_MS),false);assert.equal(s.reveal(REVEAL_COOLDOWN_MS),true);});
test('HOME immediately cancels reveal',()=>{const s=new ScreenState();s.reveal(0);s.goHome();assert.equal(s.bossOpacity(600),0);assert.equal(s.screen,'home');assert.equal(s.reveal(100000),false);});
test('returning to title does not replay the reveal',()=>{const s=new ScreenState();s.reveal(0);s.goHome();s.goTitle();assert.equal(s.bossOpacity(9999),0);});
test('reduced motion holds a static silhouette then hides it',()=>{const s=new ScreenState();s.reveal(0);assert.equal(s.bossOpacity(1,true),.55);assert.equal(s.bossOpacity(1000,true),.55);assert.equal(s.bossOpacity(REVEAL_MS,true),0);});
test('missing or invalid storage is nonfatal',()=>{for(const raw of [null,'bad json','null','42','[]'])assert.deepEqual(parsePreferences(raw),{quality:'balanced',reducedMotion:false,gunfire:true});});
test('system reduced-motion preference is respected',()=>{assert.equal(parsePreferences(null,true).reducedMotion,true);assert.equal(parsePreferences('{"quality":"low"}',true).reducedMotion,true);});
test('preferences are whitelisted and cannot resume a session',()=>{assert.deepEqual(parsePreferences('{"quality":"ultra","screen":"home","apiKey":"not-used"}'),{quality:'balanced',reducedMotion:false,gunfire:true});assert.deepEqual(parsePreferences('{"quality":"low","reducedMotion":true}'),{quality:'low',reducedMotion:true,gunfire:true});});

test('gunfire preference is independent, persists a boolean and safely migrates old settings',()=>{assert.equal(parsePreferences('{"quality":"low","reducedMotion":true}').gunfire,true);assert.equal(parsePreferences('{"gunfire":false}').gunfire,false);assert.equal(parsePreferences(JSON.stringify(parsePreferences('{"gunfire":false}'))).gunfire,false);for(const gunfire of [null,'false',0,{},[]])assert.equal(parsePreferences(JSON.stringify({gunfire})).gunfire,true);});
