import {GunshotAudio,type GunshotWeapon} from './gunshot-audio.ts';

/** Original generated audio. Ambient wind and gunfire have independent switches. */
export class Atmosphere {
  context:AudioContext|null=null;
  gain:GainNode|null=null;
  source:AudioBufferSourceNode|null=null;
  enabled=false;
  gunfireEnabled=true;
  activeEffects=new Set<{osc:OscillatorNode;gain:GainNode}>();
  private gunshots:GunshotAudio|null=null;
  private windFilter:BiquadFilterNode|null=null;
  private disposed=false;
  private hidden=false;
  private ensureContext():AudioContext{
    if(this.disposed)throw new Error('Audio disposed');
    this.context??=new AudioContext();return this.context;
  }
  /** Use a mission click/key gesture. No delayed shot is queued by unlocking. */
  async unlock():Promise<void>{
    if(this.disposed||this.hidden||!this.enabled&&!this.gunfireEnabled)return;
    try{const context=this.ensureContext();if(context.state==='suspended')await context.resume();}catch{/* Audio must never block game controls. */}
  }
  private createWind(context:AudioContext):void{
    if(this.source)return;
    const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.5;
    this.source=context.createBufferSource();this.source.buffer=buffer;this.source.loop=true;
    this.windFilter=context.createBiquadFilter();this.windFilter.type='lowpass';this.windFilter.frequency.value=360;
    this.gain=context.createGain();this.gain.gain.value=0;
    this.source.connect(this.windFilter);this.windFilter.connect(this.gain);this.gain.connect(context.destination);this.source.start();
  }
  async setEnabled(value:boolean):Promise<boolean>{
    if(this.disposed)return false;
    try{
      if(value){const context=this.ensureContext();this.createWind(context);if(!this.hidden)await context.resume();}
      this.enabled=value;
      if(this.context&&this.gain)this.gain.gain.setTargetAtTime(value?.12:0,this.context.currentTime,.35);
      if(!value)this.stopAmbientEffects();
      return this.enabled;
    }catch{this.enabled=false;return false;}
  }
  setGunfireEnabled(value:boolean):void{this.gunfireEnabled=!!value;if(!this.gunfireEnabled)this.gunshots?.stop();}
  hint():void{
    if(!this.enabled||this.hidden||!this.context||this.context.state!=='running')return;
    const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type='sine';osc.frequency.setValueAtTime(42,c.currentTime);osc.frequency.exponentialRampToValueAtTime(28,c.currentTime+1.1);gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(.1,c.currentTime+.35);gain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+1.55);this.playEffect(osc,gain,c.currentTime+1.6);
  }
  private playEffect(osc:OscillatorNode,gain:GainNode,end:number):void{
    const context=this.context!;osc.connect(gain);gain.connect(context.destination);const effect={osc,gain};this.activeEffects.add(effect);osc.onended=()=>{osc.disconnect();gain.disconnect();this.activeEffects.delete(effect);};osc.start();osc.stop(end);
  }
  effect(kind:'radio'|'shot'|'hit',weapon:GunshotWeapon='assault'):void{
    if(this.disposed||this.hidden||!this.context||this.context.state!=='running')return;
    if(kind==='shot'){
      if(!this.gunfireEnabled)return;
      this.gunshots??=new GunshotAudio(this.context);this.gunshots.play(weapon);return;
    }
    if(!this.enabled)return;
    const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type=kind==='radio'?'square':'triangle';osc.frequency.setValueAtTime(kind==='radio'?620:85,c.currentTime);osc.frequency.exponentialRampToValueAtTime(kind==='radio'?230:30,c.currentTime+.14);gain.gain.setValueAtTime(kind==='radio'?.02:.055,c.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.18);this.playEffect(osc,gain,c.currentTime+.2);
  }
  private stopAmbientEffects():void{for(const{osc,gain}of this.activeEffects){osc.onended=null;try{osc.stop();}catch{/* Already ended. */}osc.disconnect();gain.disconnect();}this.activeEffects.clear();}
  stopEffects():void{this.gunshots?.stop();this.stopAmbientEffects();}
  async visibility(hidden:boolean):Promise<void>{
    this.hidden=hidden;if(hidden)this.stopEffects();
    if(!this.context||this.disposed)return;
    try{if(hidden)await this.context.suspend();else if(this.enabled||this.gunfireEnabled)await this.context.resume();}catch{/* Navigation must remain available. */}
  }
  snapshot(){return{ambientEnabled:this.enabled,gunfireEnabled:this.gunfireEnabled,contextState:this.context?.state??'uninitialized',activeAmbientEffects:this.activeEffects.size,...(this.gunshots?.snapshot()??{activeShotVoices:0,capacity:8,cachedBuffers:0,shotCount:0,lastWeapon:null})};}
  dispose():void{if(this.disposed)return;this.disposed=true;this.stopEffects();this.gunshots?.dispose();try{this.source?.stop();}catch{/* Already ended. */}this.source?.disconnect();this.windFilter?.disconnect();this.gain?.disconnect();void this.context?.close();}
}
