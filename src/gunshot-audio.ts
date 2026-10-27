export type GunshotWeapon='assault'|'sniper';

/** Original short outdoor reports. Generated once per weapon, not per shot. */
export function synthesizeGunshot(sampleRate:number,weapon:GunshotWeapon):readonly Float32Array[]{
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Invalid gunshot sample rate');
  const sniper=weapon==='sniper',duration=sniper?.86:.49,length=Math.ceil(sampleRate*duration),dry=new Float32Array(length);
  let seed=sniper?0x52f7bd:0x183af9,low=0,tail=0,previous=0,phase=0;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
  const lowAlpha=1-Math.exp(-2*Math.PI*(sniper?780:1150)/sampleRate),tailAlpha=1-Math.exp(-2*Math.PI*1800/sampleRate);
  for(let i=0;i<length;i++){
    const t=i/sampleRate,noise=random();low+=lowAlpha*(noise-low);tail+=tailAlpha*(noise-tail);
    const high=noise-previous;previous=noise;
    const rise=Math.min(1,t/.0007),crack=high*Math.exp(-t/(sniper?.019:.011))*rise;
    const blast=low*Math.exp(-t/(sniper?.105:.062))*Math.min(1,t/.0015);
    phase+=2*Math.PI*((sniper?112:146)*Math.exp(-t/.022)+37)/sampleRate;
    const body=Math.sin(phase)*Math.exp(-t/(sniper?.073:.046))*Math.min(1,t/.0018);
    const boltTime=t-(sniper?.091:.043),bolt=boltTime>=0&&boltTime<.07?(high*.23+Math.sin(2*Math.PI*2150*boltTime)*.055)*Math.exp(-boltTime/.012)*Math.min(1,boltTime/.0008):0;
    const returnTime=t-(sniper?.145:.089),returnClick=returnTime>=0&&returnTime<.04?high*.09*Math.exp(-returnTime/.006):0;
    const diffuse=tail*.2*Math.exp(-t/(sniper?.19:.105))*Math.min(1,t/.025);
    dry[i]=crack*.58+blast*1.65+body*.27+bolt+returnClick+diffuse;
  }
  const channels=[new Float32Array(length),new Float32Array(length)],taps=sniper?[[.029,.15],[.063,.085],[.11,.035]]:[[.023,.12],[.049,.055],[.083,.025]];
  let peak=0;
  for(let channel=0;channel<2;channel++){
    const data=channels[channel];
    for(let i=0;i<length;i++){
      let value=dry[i];
      for(const [seconds,gain]of taps){const at=i-Math.round((seconds+(channel?.0017:0))*sampleRate);if(at>=0)value+=dry[at]*gain;}
      value*=Math.min(1,(length-1-i)/(sampleRate*.025));data[i]=value;peak=Math.max(peak,Math.abs(value));
    }
  }
  const scale=peak>0?.82/peak:0;
  for(const channel of channels)for(let i=0;i<length;i++)channel[i]*=scale;
  return channels;
}

type Voice={source:AudioBufferSourceNode;gain:GainNode;finish:()=>void};

/** Bounded cached playback with no requests, convolution, timers or frame work. */
export class GunshotAudio {
  private readonly context:BaseAudioContext;
  private readonly output:GainNode;
  private readonly compressor:DynamicsCompressorNode;
  private readonly buffers=new Map<GunshotWeapon,AudioBuffer>();
  private readonly voices=new Set<Voice>();
  private disposed=false;
  shotCount=0;
  lastWeapon:GunshotWeapon|null=null;
  constructor(context:BaseAudioContext){
    this.context=context;this.output=context.createGain();this.output.gain.value=.56;
    this.compressor=context.createDynamicsCompressor();this.compressor.threshold.value=-10;this.compressor.knee.value=10;this.compressor.ratio.value=5;this.compressor.attack.value=.001;this.compressor.release.value=.11;
    this.output.connect(this.compressor);this.compressor.connect(context.destination);
  }
  private buffer(weapon:GunshotWeapon):AudioBuffer{
    const cached=this.buffers.get(weapon);if(cached)return cached;
    const channels=synthesizeGunshot(this.context.sampleRate,weapon),buffer=this.context.createBuffer(2,channels[0].length,this.context.sampleRate);
    channels.forEach((data,index)=>buffer.getChannelData(index).set(data));this.buffers.set(weapon,buffer);return buffer;
  }
  play(weapon:GunshotWeapon='assault'):void{
    if(this.disposed)return;
    while(this.voices.size>=8){const oldest=this.voices.values().next().value as Voice;oldest.finish();}
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffer(weapon);
    source.playbackRate.value=1+((this.shotCount*7%11)-5)*.004;gain.gain.value=.92+(this.shotCount*3%7)*.012;
    source.connect(gain);gain.connect(this.output);
    let ended=false;
    const voice:Voice={source,gain,finish:()=>{if(ended)return;ended=true;source.onended=null;try{source.stop();}catch{/* Already stopped. */}source.disconnect();gain.disconnect();this.voices.delete(voice);}};
    this.voices.add(voice);source.onended=voice.finish;source.start();this.shotCount++;this.lastWeapon=weapon;
  }
  stop():void{for(const voice of [...this.voices])voice.finish();}
  snapshot(){return{activeShotVoices:this.voices.size,capacity:8,cachedBuffers:this.buffers.size,shotCount:this.shotCount,lastWeapon:this.lastWeapon};}
  dispose():void{if(this.disposed)return;this.stop();this.disposed=true;this.output.disconnect();this.compressor.disconnect();this.buffers.clear();}
}
