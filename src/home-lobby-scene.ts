import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

type Character = 'jonesy'|'ramirez';
type Options = {onLoad?:()=>void;onLayout?:()=>void;onError?:(message:string)=>void;assetUrls?:Partial<Record<Character,string>>};
type Actor = {root:T.Object3D;character:Character;mixer:T.AnimationMixer;action:T.AnimationAction};
const POSITIONS=[[-.65,.35],[-2.3,-.28],[1.05,-.3],[2.7,-.18]] as const;

/** Real GLB characters in an isolated menu renderer. No game/save authority. */
export class HomeLobbyScene {
  private renderer:T.WebGLRenderer|null=null;
  private readonly scene=new T.Scene();
  private readonly camera=new T.PerspectiveCamera(34,1,.05,40);
  private readonly templates=new Map<Character,T.Group>();
  private readonly clips=new Map<Character,T.AnimationClip[]>();
  private pending:Promise<void>|null=null;
  private readonly actors:Actor[]=[];
  private readonly pads:T.Group[]=[];
  private active=false;
  private reduced=false;
  private quality:'low'|'balanced'='balanced';
  private character:Character='jonesy';
  private formation:1|2|3|4=4;
  private region='shiretoko';
  private disposed=false;
  private frameId=0;
  private lastFrame=0;
  private frames=0;
  private status:'idle'|'loading'|'ready'|'error'='idle';
  private error:string|null=null;
  private width=0;
  private height=0;
  readonly media=matchMedia('(prefers-reduced-motion: reduce)');
  readonly observer:ResizeObserver;
  private readonly visibility=()=>{this.stop();if(this.active&&!document.hidden)this.invalidate();};
  private readonly motion=()=>{this.stop();this.invalidate();};
  private readonly contextLost=(event:Event)=>{event.preventDefault();this.fail('3D表示が中断されました。メニューは操作できます。');};
  constructor(readonly host:HTMLElement,readonly options:Options={}) {
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    document.addEventListener('visibilitychange',this.visibility);this.media.addEventListener('change',this.motion);
  }
  private init() {
    if(this.renderer||this.status==='error'||this.disposed)return;
    try {
      this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      const canvas=this.renderer.domElement;canvas.style.cssText='width:100%;height:100%;display:block';canvas.setAttribute('aria-hidden','true');
      canvas.addEventListener('webglcontextlost',this.contextLost);this.host.append(canvas);
      this.renderer.setClearColor(0x102848,0);this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
      this.scene.add(new T.HemisphereLight(0xe4f3ff,0x53607c,2.0));
      const key=new T.DirectionalLight(0xfff2df,3.1);key.position.set(-3,5,5);this.scene.add(key);
      const fill=new T.DirectionalLight(0x9cc9ff,1.0);fill.position.set(4,2,3);this.scene.add(fill);
      const rim=new T.DirectionalLight(0x92e7ff,1.7);rim.position.set(1,4,-4);this.scene.add(rim);
      const discGeometry=new T.CylinderGeometry(.59,.65,.045,64);
      const ringGeometry=new T.RingGeometry(.61,.665,64);
      const outerGeometry=new T.RingGeometry(.7,.78,64);
      const topGeometry=new T.CircleGeometry(.585,64);
      const shadowGeometry=new T.CircleGeometry(.27,40);
      for(let i=0;i<4;i++) {
        const pad=new T.Group();const [x,z]=POSITIONS[i];pad.position.set(x,0,z);
        const disc=new T.Mesh(discGeometry,new T.MeshStandardMaterial({color:0x3a536b,metalness:.55,roughness:.42}));pad.add(disc);
        const top=new T.Mesh(topGeometry,new T.MeshBasicMaterial({color:0xa5e4ff,transparent:true,opacity:i===0?.2:.1,depthWrite:false}));top.rotation.x=-Math.PI/2;top.position.y=.026;pad.add(top);
        const ring=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:i===0?0x9deaff:0x6fb7d5,transparent:true,opacity:i===0?.9:.5,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;pad.add(ring);
        const outer=new T.Mesh(outerGeometry,new T.MeshBasicMaterial({color:0x5cb6df,transparent:true,opacity:.16,depthWrite:false}));outer.rotation.x=-Math.PI/2;outer.position.y=-.01;pad.add(outer);
        const shadow=new T.Mesh(shadowGeometry,new T.MeshBasicMaterial({color:0x061b30,transparent:true,opacity:.32,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(1,1.5,1);shadow.position.y=.032;pad.add(shadow);
        this.pads.push(pad);this.scene.add(pad);
      }
      this.resize();
    } catch(error) {this.fail(error instanceof Error?error.message:'3D表示を開始できませんでした。');}
  }
  private fail(message:string) {this.error=message;this.status='error';this.stop();this.options.onError?.(message);}
  private async load() {
    if(this.pending||this.status==='ready'||this.status==='error'||this.disposed)return this.pending;
    this.status='loading';
    this.pending=(async()=>{
      try {
        const embeddedNode=document.getElementById('reclaim-home-models');
        const embedded=embeddedNode?JSON.parse(embeddedNode.textContent??'{}') as Partial<Record<Character,string>>:null;
        await Promise.all((['jonesy','ramirez'] as const).map(async id=>{
          const loader=new GLTFLoader();let gltf;
          if(embedded?.[id]) {
            const binary=atob(embedded[id]!);const bytes=new Uint8Array(binary.length);
            for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
            gltf=await loader.parseAsync(bytes.buffer,'');
          } else gltf=await loader.loadAsync(this.options.assetUrls?.[id]??`${import.meta.env.BASE_URL}home-models/${id}.glb`);
          const idle=T.AnimationClip.findByName(gltf.animations,'Idle');
          if(!idle||!Number.isFinite(idle.duration)||idle.duration<=0||!idle.tracks.length)throw Error('キャラクターの待機アニメーションを読み込めませんでした。');
          const root=new T.Group();root.add(gltf.scene);
          // Normalize against the supplied standing Idle pose, not the bind pose.
          const probe=new T.AnimationMixer(root);probe.clipAction(idle).play();probe.setTime(0);root.updateMatrixWorld(true);
          root.traverse(object=>{
            const mesh=object as T.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
            // The animated Ramirez export has reversed/inconsistent head normals.
            // Derive display normals from its existing faces; retain all source
            // positions, UVs, triangle indices, skinning and animation channels.
            const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
            if(id==='ramirez'&&materials.some(material=>/head/i.test(material.name)))mesh.geometry.computeVertexNormals();
            mesh.skeleton.update();
          });
          const box=new T.Box3().setFromObject(root,true);const height=box.max.y-box.min.y;
          if(!Number.isFinite(height)||height<=0)throw Error('キャラクターの形状を読み込めませんでした。');
          const center=box.getCenter(new T.Vector3());gltf.scene.position.sub(new T.Vector3(center.x,box.min.y,center.z));
          root.scale.setScalar(1.8/height);root.updateMatrixWorld(true);
          probe.stopAllAction();probe.uncacheRoot(root);
          this.clips.set(id,gltf.animations);
          this.templates.set(id,root);
        }));
        if(this.disposed){this.release();return;}
        this.status='ready';this.rebuild();this.options.onLoad?.();this.invalidate();
      } catch(error) {if(!this.disposed)this.fail(error instanceof Error?error.message:'キャラクターを読み込めませんでした。');}
    })();
    return this.pending;
  }
  private rebuild() {
    this.clearActors();
    if(this.status!=='ready')return;
    const ids:Character[]=[this.character,this.character==='jonesy'?'ramirez':'jonesy',this.character,this.character==='jonesy'?'ramirez':'jonesy'];
    for(let i=0;i<this.formation;i++) {
      const root=cloneSkeleton(this.templates.get(ids[i])!);const [x,z]=POSITIONS[i];root.position.set(x,.025,z);
      // A slight inward stance keeps the original relaxed pose and full face readable.
      root.rotation.y=i===1?.12:i===3?-.13:i===2?-.04:.03;
      const mixer=new T.AnimationMixer(root);
      const idle=T.AnimationClip.findByName(this.clips.get(ids[i])!,'Idle')!;
      const action=mixer.clipAction(idle);action.setLoop(T.LoopRepeat,Infinity).play();
      // Independent phases use the authored clip; the pad roots never translate.
      mixer.setTime(i*.21);root.updateMatrixWorld(true);
      this.actors.push({root,character:ids[i],mixer,action});this.scene.add(root);
    }
    this.fit();this.options.onLayout?.();this.invalidate();
  }
  private fit() {
    if(!this.width||!this.height)return;
    const aspect=this.width/this.height,tan=Math.tan(T.MathUtils.degToRad(34)/2);
    const distance=Math.max(3.9,6.5/(2*tan*aspect));
    this.camera.aspect=aspect;this.camera.position.set(.2,1.25+distance*.13,distance);
    this.camera.lookAt(.2,.88,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  resize() {
    if(this.disposed)return;
    this.width=this.host.clientWidth;this.height=this.host.clientHeight;
    if(this.renderer&&this.width&&this.height){this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality==='low'?1:1.5));this.renderer.setSize(this.width,this.height,false);this.fit();this.options.onLayout?.();this.invalidate();}
  }
  setActive(active:boolean) {
    if(this.disposed||this.active===active)return;
    this.active=active;
    if(active){this.init();void this.load();this.resize();this.invalidate();}else this.stop();
  }
  setFormation(count:1|2|3|4) {if(this.formation===count)return;this.formation=count;this.rebuild();}
  setCharacter(character:Character) {if(this.character===character)return;this.character=character;this.rebuild();}
  setReducedMotion(reduced:boolean) {if(this.reduced===reduced)return;this.reduced=reduced;this.stop();this.invalidate();}
  setQuality(quality:'low'|'balanced') {if(this.quality===quality)return;this.quality=quality;this.resize();}
  setRegion(region:string) {if(this.region===region)return;this.region=region;this.invalidate();}
  ready() {return this.load();}
  private stop() {if(this.frameId)cancelAnimationFrame(this.frameId);this.frameId=0;this.lastFrame=0;}
  private invalidate() {
    if(this.frameId||!this.active||document.hidden||this.disposed||!this.renderer||this.status==='error')return;
    this.frameId=requestAnimationFrame(this.frame);
  }
  private readonly frame=(time:number)=>{
    this.frameId=0;
    if(!this.active||document.hidden||this.disposed||!this.renderer||this.status==='error')return;
    const animate=this.status==='ready'&&!this.reduced&&!this.media.matches;
    if(!this.lastFrame||time-this.lastFrame>=1000/30){
      const delta=this.lastFrame?Math.min(.1,Math.max(0,(time-this.lastFrame)/1000)):0;
      this.lastFrame=time;
      if(animate)for(const actor of this.actors)actor.mixer.update(delta);
      this.renderer.render(this.scene,this.camera);this.frames++;
    }
    if(animate)this.invalidate();
  };
  anchors() {
    return POSITIONS.map(([x,z],index)=>{
      const head=new T.Vector3(x,1.82,z).project(this.camera);const foot=new T.Vector3(x,.025,z).project(this.camera);
      return{x:(head.x+1)/2,headY:(1-head.y)/2,footY:(1-foot.y)/2,active:index<this.formation,character:this.actors[index]?.character??(index%2===0?this.character:this.character==='jonesy'?'ramirez':'jonesy')};
    });
  }
  snapshot() {
    const info=this.renderer?.info;
    return{active:this.active,running:this.active&&!document.hidden&&!this.reduced&&!this.media.matches&&this.status==='ready',status:this.status,error:this.error,frames:this.frames,models:[...this.templates.keys()].sort(),modelCount:this.actors.length,formation:this.formation,character:this.character,region:this.region,slots:this.anchors(),animation:{clip:'Idle',available:Object.fromEntries([...this.clips].map(([id,clips])=>[id,clips.map(clip=>clip.name)])),actors:this.actors.map(actor=>({character:actor.character,clip:actor.action.getClip().name,duration:actor.action.getClip().duration,time:actor.action.time,mixerTime:actor.mixer.time,position:actor.root.position.toArray()}))},resources:{geometries:info?.memory.geometries??0,textures:info?.memory.textures??0,drawCalls:info?.render.calls??0,triangles:info?.render.triangles??0,pixelRatio:this.renderer?.getPixelRatio()??0}};
  }
  private release() {
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    const collect=(root:T.Object3D)=>root.traverse(object=>{const mesh=object as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[]){materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);}});
    collect(this.scene);for(const template of this.templates.values())collect(template);
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.templates.clear();this.clips.clear();
  }
  private clearActors() {
    const skeletons=new Set<T.Skeleton>();
    for(const actor of this.actors){actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.root);actor.root.traverse(object=>{const mesh=object as T.SkinnedMesh;if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);});this.scene.remove(actor.root);}
    skeletons.forEach(skeleton=>skeleton.dispose());this.actors.length=0;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.stop();this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.media.removeEventListener('change',this.motion);
    this.release();this.clearActors();if(this.renderer){this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
  }
}
