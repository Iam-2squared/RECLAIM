import * as T from 'three';
import type { TracerSpan, TaggedImpact } from './trajectory-effects.ts';

/** Bounded visual pool. Every tracer and impact comes from the actual swept shot. */
export class CombatEffects {
  readonly root=new T.Group();
  private readonly trailPositions=new Float32Array(72*6);
  private readonly trailColors=new Float32Array(72*6);
  private readonly trailGeometry=new T.BufferGeometry();
  private readonly trailMaterial=new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false});
  private readonly trails:T.LineSegments;
  private readonly particlePositions=new Float32Array(96*3);
  private readonly particleColors=new Float32Array(96*3);
  private readonly particleGeometry=new T.BufferGeometry();
  private readonly particleMaterial=new T.PointsMaterial({size:.075,vertexColors:true,transparent:true,opacity:.9,depthWrite:false});
  private particles:{p:T.Vector3;v:T.Vector3;life:number;duration:number;color:T.Color}[]=[];
  private readonly flashGeometry=new T.OctahedronGeometry(.065,0);
  private readonly flashMaterial=new T.MeshBasicMaterial({color:0xffd880,transparent:true,opacity:.9,depthWrite:false});
  private readonly flash=new T.Mesh(this.flashGeometry,this.flashMaterial);
  private flashTime=0;
  private emitted=0;
  private disposed=false;
  constructor(scene:T.Scene){
    this.root.name='Live shot trails and impacts';this.root.visible=false;
    this.trailGeometry.setAttribute('position',new T.BufferAttribute(this.trailPositions,3).setUsage(T.DynamicDrawUsage));
    this.trailGeometry.setAttribute('color',new T.BufferAttribute(this.trailColors,3).setUsage(T.DynamicDrawUsage));
    this.trailGeometry.setDrawRange(0,0);
    this.trails=new T.LineSegments(this.trailGeometry,this.trailMaterial);this.trails.frustumCulled=false;this.root.add(this.trails);
    this.particleGeometry.setAttribute('position',new T.BufferAttribute(this.particlePositions,3).setUsage(T.DynamicDrawUsage));
    this.particleGeometry.setAttribute('color',new T.BufferAttribute(this.particleColors,3).setUsage(T.DynamicDrawUsage));
    this.particleGeometry.setDrawRange(0,0);
    const points=new T.Points(this.particleGeometry,this.particleMaterial);points.frustumCulled=false;this.root.add(points);
    this.flash.visible=false;this.root.add(this.flash);scene.add(this.root);
  }
  muzzle(point:T.Vector3,direction:T.Vector3){this.root.visible=true;this.flash.position.copy(point);this.flash.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);this.flash.scale.set(.7,.7,1.9);this.flashTime=.045;this.flash.visible=true;}
  impact(hit:TaggedImpact){
    this.root.visible=true;
    this.emitted++;
    const metal=['metal','drone','humanoid'].includes(hit.material);
    const color=new T.Color(metal?0xffc16d:hit.material==='wood'?0xb08b59:0x929b85);
    for(let i=0;i<8;i++){
      if(this.particles.length===96)this.particles.shift();
      const seed=this.emitted*2.17+i*2.4;
      this.particles.push({p:new T.Vector3(hit.point.x,hit.point.y,hit.point.z),v:new T.Vector3(Math.sin(seed)*1.5,.5+Math.abs(Math.sin(seed*1.7))*1.9,Math.cos(seed)*1.5),life:0,duration:metal?.28:.42,color:color.clone()});
    }
  }
  step(dt:number,tracers:readonly TracerSpan[]){
    if(this.disposed)return;
    if(!this.root.visible&&!tracers.length&&!this.particles.length&&this.flashTime<=0)return;
    this.root.visible=true;
    this.flashTime=Math.max(0,this.flashTime-dt);this.flash.visible=this.flashTime>0;
    const visible=tracers.slice(-72);
    visible.forEach((s,i)=>{const n=i*6;this.trailPositions.set([s.from.x,s.from.y,s.from.z,s.to.x,s.to.y,s.to.z],n);const a=Math.max(.02,s.alpha);this.trailColors.set([a,.68*a,.24*a,a,.88*a,.55*a],n);});
    this.trailGeometry.setDrawRange(0,visible.length*2);this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.attributes.color.needsUpdate=true;
    this.particles=this.particles.filter(p=>{p.life+=dt;if(p.life>=p.duration)return false;p.v.y-=5*dt;p.p.addScaledVector(p.v,dt);return true;});
    this.particles.forEach((p,i)=>{this.particlePositions.set(p.p.toArray(),i*3);const a=1-p.life/p.duration;this.particleColors.set([p.color.r*a,p.color.g*a,p.color.b*a],i*3);});
    this.particleGeometry.setDrawRange(0,this.particles.length);this.particleGeometry.attributes.position.needsUpdate=true;this.particleGeometry.attributes.color.needsUpdate=true;
    if(!visible.length&&!this.particles.length&&this.flashTime<=0)this.root.visible=false;
  }
  clear(){this.root.visible=false;this.particles=[];this.flashTime=0;this.flash.visible=false;this.trailGeometry.setDrawRange(0,0);this.particleGeometry.setDrawRange(0,0);}
  snapshot(){return{particles:this.particles.length,impacts:this.emitted,flash:this.flashTime>0,tracerVertices:this.trailGeometry.drawRange.count};}
  dispose(){if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.trailGeometry.dispose();this.trailMaterial.dispose();this.particleGeometry.dispose();this.particleMaterial.dispose();this.flashGeometry.dispose();this.flashMaterial.dispose();this.clear();}
}
