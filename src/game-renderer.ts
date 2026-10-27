import * as T from 'three';
import type {Preferences} from './state.ts';

/** Shared gameplay surface. TITLE and HOME own their separate presentation. */
export class GameRenderer {
 readonly renderer:T.WebGLRenderer;
 readonly mobile=matchMedia('(any-pointer: coarse)').matches&&!matchMedia('(any-pointer: fine)').matches;
 lost=false;private quality:Preferences['quality']='balanced';
 constructor(host:HTMLElement,readonly onLost:()=>void){
  this.renderer=new T.WebGLRenderer({antialias:!this.mobile,alpha:false,powerPreference:'low-power'});
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
  host.append(this.renderer.domElement);this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
 }
 private contextLost=(event:Event)=>{event.preventDefault();this.lost=true;this.onLost();};
 preferences(preferences:Preferences){this.quality=preferences.quality;this.resize();}
 resize(){this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.mobile?(this.quality==='low'?.6:.75):this.quality==='low'?.75:innerWidth<700?1:1.25));this.renderer.setSize(innerWidth,innerHeight);}
 stats(){const info=this.renderer.info;return{drawCalls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,pixelRatio:this.renderer.getPixelRatio(),width:this.renderer.domElement.width,height:this.renderer.domElement.height,mobile:this.mobile,antialias:this.renderer.getContext().getContextAttributes()?.antialias??false,frameRateLimit:this.mobile?30:null};}
 dispose(){this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.renderer.dispose();this.renderer.domElement.remove();}
}
