import * as T from 'three';

export type BossHealthState=Readonly<{
  id:string;name:string;kind:'boar'|'owl';
  position:Readonly<{x:number;y:number;z:number}>;
  hp:number;maxHp:number;barHeight?:number;
}>;
export type BossHealthOptions=Readonly<{viewDistance?:number}>;
type BossBar={root:T.Group;fill:T.Mesh;alive:boolean;row:HTMLElement|null;name:HTMLElement|null;numbers:HTMLElement|null;track:HTMLElement|null;domFill:HTMLElement|null;signature:string};
const CAPACITY=2;
const valid=(boss:BossHealthState)=>!!boss.id&&!!boss.name&&[boss.position.x,boss.position.y,boss.position.z,boss.hp,boss.maxHp].every(Number.isFinite)&&boss.maxHp>0;

/** Two scene bars and two HUD rows; HP authority stays in BossDirector. */
export class BossHealthPresentation {
  private readonly scene:T.Scene;
  private readonly camera:T.Camera;
  private readonly geometry=new T.PlaneGeometry(1,1);
  private readonly backing=new T.MeshBasicMaterial({color:0x10171c,transparent:true,opacity:.9,depthWrite:false});
  private readonly border=new T.MeshBasicMaterial({color:0xf1ceaf,transparent:true,opacity:.9,depthWrite:false});
  private readonly boarFill=new T.MeshBasicMaterial({color:0xf28b5d,transparent:true,depthWrite:false});
  private readonly owlFill=new T.MeshBasicMaterial({color:0xf1d67a,transparent:true,depthWrite:false});
  private readonly bars=new Map<string,BossBar>();
  private readonly pool:BossBar[]=[];
  private readonly cameraPosition=new T.Vector3();
  private readonly cameraRotation=new T.Quaternion();
  private readonly projection=new T.Matrix4();
  private readonly frustum=new T.Frustum();
  private readonly sphere=new T.Sphere(new T.Vector3(),1.65);
  private readonly host:HTMLElement|null;
  private readonly panel:HTMLElement|null;
  private readonly rows:HTMLElement|null;
  private readonly observer:ResizeObserver|null;
  private distance=180;
  private disposed=false;

  constructor(scene:T.Scene,camera:T.Camera,options:BossHealthOptions={}){
    this.scene=scene;this.camera=camera;
    this.setViewDistance(options.viewDistance??180);
    this.host=typeof document==='undefined'?null:document.getElementById('mission-screen');
    this.panel=this.host?document.createElement('aside'):null;
    this.rows=this.panel?document.createElement('div'):null;
    if(this.panel&&this.rows){
      this.panel.id='mission-boss-health';this.panel.className='mission-boss-health';
      this.panel.setAttribute('aria-label','知床のボス体力');this.panel.hidden=true;
      const heading=document.createElement('p');heading.className='boss-health-heading';heading.textContent='山麓のボス';
      this.rows.className='boss-health-rows';this.panel.append(heading,this.rows);this.host!.insertBefore(this.panel,this.host!.querySelector('.mission-overlay'));
    }
    this.observer=this.host&&typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>this.layout()):null;
    const objective=this.host?.querySelector('.mission-top'),controls=this.host?.querySelector('.mission-controls');
    if(objective)this.observer?.observe(objective);if(controls)this.observer?.observe(controls);
    if(this.host)this.observer?.observe(this.host);
    if(typeof window!=='undefined')window.addEventListener('resize',this.layout);
    this.layout();
  }

  private layout=():void=>{
    if(!this.panel||!this.host||this.disposed)return;
    const host=this.host.getBoundingClientRect(),objective=this.host.querySelector('.mission-top')?.getBoundingClientRect(),controls=this.host.querySelector('.mission-controls')?.getBoundingClientRect();
    const top=(objective?objective.bottom-host.top:host.height*.3)+12;
    this.panel.style.top=`${Math.round(top)}px`;
    const available=(controls?controls.top-host.top:host.height-100)-top-12;
    this.panel.dataset.compact=String(available<156);
  };

  private create():BossBar|null{
    if(this.pool.length>=CAPACITY)return null;
    const root=new T.Group(),edge=new T.Mesh(this.geometry,this.border),back=new T.Mesh(this.geometry,this.backing),fill=new T.Mesh(this.geometry,this.boarFill);
    root.name='Boss overhead health bar';edge.scale.set(3.25,.23,1);back.scale.set(3.18,.17,1);back.position.z=.002;
    fill.scale.set(3.08,.095,1);fill.position.z=.006;
    edge.renderOrder=40;back.renderOrder=41;fill.renderOrder=42;root.add(edge,back,fill);root.visible=false;
    let row:HTMLElement|null=null,name:HTMLElement|null=null,numbers:HTMLElement|null=null,track:HTMLElement|null=null,domFill:HTMLElement|null=null;
    if(this.rows){
      row=document.createElement('section');row.className='boss-health-row';
      const header=document.createElement('div');header.className='boss-health-label';
      name=document.createElement('strong');numbers=document.createElement('span');numbers.className='boss-health-numbers';
      header.append(name,numbers);track=document.createElement('div');track.className='boss-health-track';track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');
      domFill=document.createElement('div');domFill.className='boss-health-fill';track.append(domFill);row.append(header,track);
    }
    const result={root,fill,alive:true,row,name,numbers,track,domFill,signature:''};this.pool.push(result);return result;
  }

  update(bosses:readonly BossHealthState[],_seconds=0):void{
    if(this.disposed)return;
    const wanted=new Set(bosses.filter(valid).map(boss=>boss.id).slice(0,CAPACITY));
    for(const [id,bar]of this.bars)if(!wanted.has(id)){bar.root.removeFromParent();bar.root.visible=false;bar.row?.remove();bar.signature='';this.bars.delete(id);}
    const active=new Set<string>();
    this.camera.updateWorldMatrix(true,false);this.camera.getWorldPosition(this.cameraPosition);this.camera.getWorldQuaternion(this.cameraRotation);
    this.projection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);
    for(const boss of bosses){
      if(!valid(boss)||active.has(boss.id)||active.size>=CAPACITY)continue;
      active.add(boss.id);let bar=this.bars.get(boss.id);
      if(!bar){
        const assigned=new Set(this.bars.values());bar=this.pool.find(item=>!assigned.has(item))??this.create()??undefined;
        if(!bar)continue;this.bars.set(boss.id,bar);this.scene.add(bar.root);if(bar.row)this.rows?.append(bar.row);
      }
      const hp=T.MathUtils.clamp(boss.hp,0,boss.maxHp),ratio=hp/boss.maxHp,height=Number.isFinite(boss.barHeight)?T.MathUtils.clamp(boss.barHeight!,1,15):boss.kind==='boar'?4.6:5.3;
      bar.alive=hp>0;bar.root.position.set(boss.position.x,boss.position.y+height,boss.position.z);bar.root.quaternion.copy(this.cameraRotation);
      this.sphere.center.copy(bar.root.position);bar.root.visible=bar.alive&&this.cameraPosition.distanceToSquared(bar.root.position)<=this.distance*this.distance&&this.frustum.intersectsSphere(this.sphere);
      bar.fill.scale.x=3.08*ratio;bar.fill.position.x=-3.08*(1-ratio)/2;bar.fill.material=boss.kind==='owl'?this.owlFill:this.boarFill;
      const signature=`${boss.name}:${boss.kind}:${Math.ceil(hp)}:${boss.maxHp}`;
      if(signature!==bar.signature){
        bar.signature=signature;
        if(bar.row){bar.row.dataset.kind=boss.kind;bar.row.dataset.defeated=String(hp<=0);bar.row.dataset.bossId=boss.id;}
        if(bar.name)bar.name.textContent=boss.name;
        if(bar.numbers)bar.numbers.textContent=hp<=0?'撃破':`${Math.ceil(hp).toLocaleString('ja-JP')} / ${boss.maxHp.toLocaleString('ja-JP')}`;
        if(bar.track){bar.track.setAttribute('aria-label',`${boss.name}の体力`);bar.track.setAttribute('aria-valuemax',String(boss.maxHp));bar.track.setAttribute('aria-valuenow',String(Math.ceil(hp)));bar.track.setAttribute('aria-valuetext',hp<=0?'撃破':`${Math.ceil(hp)} / ${boss.maxHp}`);}
        if(bar.domFill)bar.domFill.style.width=`${ratio*100}%`;
      }
    }
    for(const [id,bar]of this.bars)if(!active.has(id)){bar.root.removeFromParent();bar.root.visible=false;bar.row?.remove();bar.signature='';this.bars.delete(id);}
    if(this.panel){const wasHidden=this.panel.hidden;this.panel.hidden=this.bars.size===0;if(wasHidden&&!this.panel.hidden)this.layout();}
  }

  setViewDistance(metres:number):void{if(Number.isFinite(metres))this.distance=T.MathUtils.clamp(metres,30,300);}
  reset():void{for(const bar of this.bars.values()){bar.root.removeFromParent();bar.root.visible=false;bar.row?.remove();bar.signature='';}this.bars.clear();if(this.panel)this.panel.hidden=true;}
  snapshot(){return{bars:this.bars.size,visibleBars:[...this.bars.values()].filter(bar=>bar.root.visible).length,capacity:this.pool.length,hudRows:[...this.bars.values()].filter(bar=>bar.row).length,resources:{geometries:this.disposed?0:1,materials:this.disposed?0:4},bosses:[...this.bars].map(([id,bar])=>({id,alive:bar.alive,visible:bar.root.visible,position:{x:bar.root.position.x,y:bar.root.position.y,z:bar.root.position.z}}))};}
  dispose():void{if(this.disposed)return;this.reset();this.disposed=true;this.observer?.disconnect();if(typeof window!=='undefined')window.removeEventListener('resize',this.layout);this.panel?.remove();this.geometry.dispose();for(const material of [this.backing,this.border,this.boarFill,this.owlFill])material.dispose();this.pool.length=0;}
}
