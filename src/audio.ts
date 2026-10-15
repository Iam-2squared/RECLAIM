/** Original synthesized wind. Never requests microphone permission or loads audio files. */
export class Atmosphere {
  context: AudioContext | null = null;
  gain: GainNode | null = null;
  source: AudioBufferSourceNode | null = null;
  enabled=false;
  activeEffects=new Set<{osc:OscillatorNode;gain:GainNode}>();
  async setEnabled(value:boolean):Promise<boolean>{
    try{
      if(value&&!this.context){
        this.context=new AudioContext();const c=this.context;
        const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.5;
        this.source=c.createBufferSource();this.source.buffer=buffer;this.source.loop=true;
        const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=360;
        this.gain=c.createGain();this.gain.gain.value=0;
        this.source.connect(filter);filter.connect(this.gain);this.gain.connect(c.destination);this.source.start();
      }
      this.enabled=value;
      if(this.context&&this.gain){if(value)await this.context.resume();this.gain.gain.setTargetAtTime(value?.12:0,this.context.currentTime,.35);}
      return this.enabled;
    }catch{this.enabled=false;return false;}
  }
  hint(){if(!this.enabled||!this.context)return;const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type='sine';osc.frequency.setValueAtTime(42,c.currentTime);osc.frequency.exponentialRampToValueAtTime(28,c.currentTime+1.1);gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(.1,c.currentTime+.35);gain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+1.55);osc.connect(gain);gain.connect(c.destination);osc.start();osc.stop(c.currentTime+1.6);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  effect(kind:'radio'|'shot'|'hit'){if(!this.enabled||!this.context||this.context.state!=='running')return;const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type=kind==='radio'?'square':'triangle';osc.frequency.setValueAtTime(kind==='radio'?620:kind==='shot'?150:85,c.currentTime);osc.frequency.exponentialRampToValueAtTime(kind==='radio'?230:30,c.currentTime+.14);gain.gain.setValueAtTime(kind==='radio'?.02:.055,c.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.18);osc.connect(gain);gain.connect(c.destination);osc.start();osc.stop(c.currentTime+.2);const effect={osc,gain};this.activeEffects.add(effect);osc.onended=()=>{osc.disconnect();gain.disconnect();this.activeEffects.delete(effect);};}
  stopEffects(){for(const {osc,gain}of this.activeEffects){try{osc.stop();}catch{/* Already ended. */}osc.disconnect();gain.disconnect();}this.activeEffects.clear();}
  async visibility(hidden:boolean){if(!this.context)return;try{if(hidden)await this.context.suspend();else if(this.enabled)await this.context.resume();}catch{/* Navigation must remain available. */}}
  dispose(){this.stopEffects();this.source?.stop();this.source?.disconnect();void this.context?.close();}
}
