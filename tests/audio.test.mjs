import{test}from'node:test';
import assert from'node:assert/strict';
import{Atmosphere}from'../src/audio.ts';
import{GunshotAudio,synthesizeGunshot}from'../src/gunshot-audio.ts';

class Param{value=0;setValueAtTime(v){this.value=v;return this;}linearRampToValueAtTime(v){this.value=v;return this;}exponentialRampToValueAtTime(v){this.value=v;return this;}setTargetAtTime(v){this.value=v;return this;}}
class Node{disconnected=false;connections=[];connect(n){this.connections.push(n);return n;}disconnect(){this.disconnected=true;this.connections=[];}}
class Source extends Node{playbackRate=new Param();frequency=new Param();onended=null;started=0;stopped=0;start(){this.started++;}stop(){this.stopped++;}finish(){this.onended?.();}}
class Context{
 state='suspended';sampleRate=48000;currentTime=0;destination=new Node();buffers=[];sources=[];nodes=[];
 createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length)),b={length,sampleRate,getChannelData:i=>data[i]};this.buffers.push(b);return b;}
 createBufferSource(){const n=new Source();this.sources.push(n);this.nodes.push(n);return n;}
 createGain(){const n=new Node();n.gain=new Param();this.nodes.push(n);return n;}
 createDynamicsCompressor(){const n=new Node();for(const k of['threshold','knee','ratio','attack','release'])n[k]=new Param();this.nodes.push(n);return n;}
 createBiquadFilter(){const n=new Node();n.frequency=new Param();this.nodes.push(n);return n;}
 createOscillator(){const n=new Source();this.nodes.push(n);return n;}
 async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
}
const rms=(data,start,end)=>Math.sqrt(data.subarray(Math.round(start*48000),Math.round(end*48000)).reduce((sum,x)=>sum+x*x,0)/(Math.round((end-start)*48000)));

test('both original stereo reports have a sharp transient, finite bounded peaks and a silent endpoint',()=>{
 const assault=synthesizeGunshot(48000,'assault'),sniper=synthesizeGunshot(48000,'sniper');
 assert.equal(assault.length,2);assert.equal(sniper.length,2);assert.equal(assault[0].length,23520);assert.equal(sniper[0].length,41280);
 for(const channels of[assault,sniper]){
  let peak=0;for(const c of channels){assert.ok(c.every(Number.isFinite));assert.ok(c[0]===0);assert.ok(c.at(-1)===0);for(const x of c)peak=Math.max(peak,Math.abs(x));}
  assert.ok(peak>.8&&peak<.83);assert.ok(rms(channels[0],0,.025)>.1);assert.ok(rms(channels[0],.35,.45)<rms(channels[0],0,.025)*.03);
  assert.notDeepEqual(channels[0],channels[1],'small outdoor reflections must retain stereo space');
 }
 assert.ok(rms(sniper[0],.15,.25)>rms(assault[0],.15,.25)*2,'sniper should retain its heavier and longer report');
 assert.throws(()=>synthesizeGunshot(NaN,'assault'),/sample rate/);assert.throws(()=>synthesizeGunshot(1000,'assault'),/sample rate/);
});

test('automatic gunfire reuses buffers, limits overlapping voices and releases ended voices',()=>{
 const context=new Context(),shots=new GunshotAudio(context);
 for(let i=0;i<24;i++)shots.play('assault');assert.equal(context.buffers.length,1);assert.equal(shots.snapshot().activeShotVoices,8);assert.equal(shots.snapshot().shotCount,24);
 assert.equal(context.sources.filter(s=>s.stopped>0).length,16);context.sources.at(-1).finish();assert.equal(shots.snapshot().activeShotVoices,7);
 shots.play('sniper');assert.equal(context.buffers.length,2);assert.equal(shots.snapshot().lastWeapon,'sniper');
 shots.stop();assert.equal(shots.snapshot().activeShotVoices,0);assert.ok(context.sources.every(s=>s.disconnected));
 shots.dispose();shots.dispose();shots.play();assert.equal(shots.snapshot().shotCount,25);assert.equal(shots.snapshot().cachedBuffers,0);assert.ok(context.nodes.every(n=>n.disconnected));
});

test('gunfire works with wind off, mutes immediately, and never replays muted shots',async()=>{
 const previous=globalThis.AudioContext;globalThis.AudioContext=Context;
 const audio=new Atmosphere();try{
  audio.effect('shot');assert.equal(audio.snapshot().shotCount,0);assert.equal(audio.context,null);
  await audio.unlock();assert.equal(audio.enabled,false);assert.equal(audio.source,null);assert.equal(audio.context.buffers.length,0);
  audio.effect('shot','assault');assert.equal(audio.snapshot().shotCount,1);assert.equal(audio.snapshot().activeShotVoices,1);assert.equal(audio.snapshot().lastWeapon,'assault');
  audio.setGunfireEnabled(false);assert.equal(audio.snapshot().activeShotVoices,0);
  for(let i=0;i<10;i++)audio.effect('shot','sniper');assert.equal(audio.snapshot().shotCount,1);
  audio.setGunfireEnabled(true);await audio.unlock();assert.equal(audio.snapshot().shotCount,1);audio.effect('shot','sniper');assert.equal(audio.snapshot().lastWeapon,'sniper');assert.equal(audio.snapshot().shotCount,2);
  await audio.setEnabled(true);audio.effect('hit');assert.equal(audio.snapshot().activeAmbientEffects,1);assert.equal(audio.snapshot().activeShotVoices,1);
  audio.setGunfireEnabled(false);assert.equal(audio.enabled,true);assert.equal(audio.snapshot().activeAmbientEffects,1);assert.equal(audio.snapshot().activeShotVoices,0);
  audio.setGunfireEnabled(true);audio.effect('shot');await audio.setEnabled(false);assert.equal(audio.snapshot().activeAmbientEffects,0);assert.equal(audio.snapshot().activeShotVoices,1);
 }finally{audio.dispose();globalThis.AudioContext=previous;}
});

test('pause, visibility and disposal release gunshot nodes without delayed playback or allocating muted audio',async()=>{
 const previous=globalThis.AudioContext;globalThis.AudioContext=Context;
 const audio=new Atmosphere();try{
  audio.setGunfireEnabled(false);await audio.unlock();assert.equal(audio.context,null);
  audio.setGunfireEnabled(true);await audio.unlock();audio.effect('shot');audio.stopEffects();assert.equal(audio.snapshot().activeShotVoices,0);
  audio.effect('shot');await audio.visibility(true);assert.equal(audio.context.state,'suspended');assert.equal(audio.snapshot().activeShotVoices,0);
  audio.effect('shot');await audio.unlock();assert.equal(audio.snapshot().shotCount,2);await audio.visibility(false);assert.equal(audio.context.state,'running');assert.equal(audio.snapshot().shotCount,2);
  audio.effect('shot');audio.dispose();assert.equal(audio.context.state,'closed');assert.equal(audio.snapshot().activeShotVoices,0);audio.effect('shot');await audio.unlock();assert.equal(audio.snapshot().shotCount,3);
 }finally{audio.dispose();globalThis.AudioContext=previous;}
});
