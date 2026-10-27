import{mkdir,writeFile}from'node:fs/promises';
import{resolve}from'node:path';
import{synthesizeGunshot}from'../../src/gunshot-audio.ts';

const directory=resolve('release/audio-update'),sampleRate=48000;await mkdir(directory,{recursive:true});
function wav(channels){
 const frames=channels[0].length,bytes=Buffer.alloc(44+frames*4);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++)for(let c=0;c<2;c++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),44+(i*2+c)*2);return bytes;
}
const reports=[];
for(const weapon of['assault','sniper']){
 const channels=synthesizeGunshot(sampleRate,weapon);for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=.56*.92;
 let energy=0,peak=0;for(const x of channels[0]){energy+=x*x;peak=Math.max(peak,Math.abs(x));}
 await writeFile(resolve(directory,weapon+'.wav'),wav(channels));reports.push({weapon,duration:channels[0].length/sampleRate,peak,rms:Math.sqrt(energy/channels[0].length),file:weapon+'.wav'});
}
const assault=synthesizeGunshot(sampleRate,'assault'),frames=Math.ceil(sampleRate*1.7),burst=[new Float32Array(frames),new Float32Array(frames)];
for(let shot=0;shot<6;shot++)for(let c=0;c<2;c++)for(let i=0;i<assault[c].length;i++){const at=Math.round(shot*.16*sampleRate)+i;if(at<frames)burst[c][at]+=assault[c][i]*.56*.92;}
await writeFile(resolve(directory,'assault-burst.wav'),wav(burst));
await writeFile(resolve(directory,'waveform-check.json'),JSON.stringify({method:'Original deterministic stereo synthesis; waveform preview uses the game master/voice gain before its protective compressor',sampleRate,reports,burst:'assault-burst.wav'},null,2));
console.log(JSON.stringify({directory,reports,burst:'assault-burst.wav'}));
