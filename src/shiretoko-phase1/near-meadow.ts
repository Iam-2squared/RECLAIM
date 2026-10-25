import * as T from 'three';
import { ShiretokoTerrain, routeSample, wetnessAt, TERRAIN } from './terrain.ts';
import { FLORA_RULES } from './vegetation-plan.ts';
import { cabinSiteClearanceDistance } from './cabin-site.ts';

/**
 * Near-camera, terrain-grounded low-poly meadow grass for the opt-in 2.4km
 * Shiretoko 3D review only. No 2.4km second scatter field is allocated.
 * A ONE-draw-call InstancedMesh follows the viewer in 12m increments.
 * World-cell hashed positions never depend on frame time or observer order.
 */
export type MeadowQuality = 'low' | 'balanced';
export type NearMeadowReview = Readonly<{
  group:T.Group;
  get instances():number;
  get cottonClusters():number;
  get drawGroups():number;
  get rebuilds():number;
  sync:(x:number,z:number)=>boolean;
}>;

const CONFIG = Object.freeze({
  // Twice as many visible knee-height tufts at walking distance, without
  // changing the radius, ground grid, safe clearing or one-draw GPU layout.
  // Worst-case dry-land instances remain bounded below these capacities.
  low:Object.freeze({spacing:2.7,radius:34,capacity:600,cottonCapacity:240,accept:.74}),
  balanced:Object.freeze({spacing:2.25,radius:44,capacity:1420,cottonCapacity:600,accept:.82}),
  step:12,
});
const hash=(x:number,z:number,salt:number)=>{
  let h=(Math.imul(x,0x9e3779b1)^Math.imul(z,0x85ebca77)^Math.imul(salt,0xc2b2ae3d)^431071)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
  h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967296;
};

function grassGeometry():T.BufferGeometry {
  // Each rooted clump has nine different 3D bent blades. Their curved apex
  // projects into TWO horizontal directions: no flat grass card or texture.
  // Vertex colours keep all blades in one static Lambert material/draw group.
  const vertices:number[]=[],colors:number[]=[],indices:number[]=[];
  const palette=[0x657647,0x819052,0x738650,0x9b9c62,0x677b4b,
    0x87955c,0x6d7f43,0xaaa068,0x76844d];
  for(let i=0;i<9;i++){
    const base=vertices.length/3,angle=i*Math.PI*2/9+(i%2)*.08;
    const h=.34+(i%3)*.105,w=.09+(i%2)*.034;
    const yaw=Math.cos(angle),side=-Math.sin(angle),forward=Math.sin(angle);
    const coords=[
      [-w/2,.012,0],[w/2,.012,0],
      [-w*.28,h*.52,.055],[w*.28,h*.52,.055],
      [0,h,.27+(i%3)*.04],
    ];
    for(const [sx,y,d] of coords){
      vertices.push(side*sx+yaw*d,y,yaw*sx+forward*d);
      const c=new T.Color(palette[i]);colors.push(c.r,c.g,c.b);
    }
    indices.push(base,base+1,base+2,base+1,base+3,base+2,
      base+2,base+3,base+4);
  }
  // Two bent seed-bearing stalks rise above the short leaf fan. Tiny
  // tetrahedral seed clusters have actual depth at walking distance, rather
  // than facing the camera as sprites. All triangles live in the SAME
  // vertex-coloured, sampler-free InstancedMesh as the original nine blades:
  // zero extra draw calls, plant positions, clearance changes or allocations
  // per frame. The seed tips stop below the walker's eye height.
  const vertex=(x:number,y:number,z:number,hex:number):number=>{
    const index=vertices.length/3,c=new T.Color(hex);
    vertices.push(x,y,z);colors.push(c.r,c.g,c.b);return index;
  };
  function seed(x:number,y:number,z:number,r:number,hex:number):void {
    const a=vertex(x,y+r*1.5,z,hex),b=vertex(x-r,y-r*.4,z-r*.6,hex);
    const c=vertex(x+r,y-r*.4,z-r*.6,hex),d=vertex(x,y-r*.4,z+r,hex);
    indices.push(a,b,c,a,c,d,a,d,b,b,d,c);
  }
  for(const [angle,h,grain] of [
    [.43,.76,0xa99b68],[3.76,.69,0x9b885b],
  ] as const){
    const dx=Math.cos(angle),dz=Math.sin(angle),wx=-dz,wz=dx;
    const root=vertex(wx*.022,.027,wz*.022,0x65764b);
    const left=vertex(wx*-.025,.035,wz*-.025,0x65764b);
    const right=vertex(wx*.025,.035,wz*.025,0x65764b);
    const middleL=vertex(dx*.09+wx*-.016,h*.58,dz*.09+wz*-.016,0x778853);
    const middleR=vertex(dx*.09+wx*.016,h*.58,dz*.09+wz*.016,0x778853);
    const tip=vertex(dx*.21,h,dz*.21,0x7c8653);
    indices.push(root,left,middleL,root,middleL,middleR,root,middleR,right,
      middleL,tip,middleR);
    seed(dx*.21,h-.035,dz*.21,.048,grain);
    seed(dx*.18+wx*.040,h-.115,dz*.18+wz*.040,.037,grain);
    seed(dx*.18-wx*.040,h-.155,dz*.18-wz*.040,.031,grain);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
  return g;
}

/**
 * Moisture-gated Eriophorum-inspired cottongrass: two slender, slightly bent
 * 3D stems and uneven cream cotton tufts per root. Frustum-cullable instances
 * follow the SAME world-hashed 12m ring as ordinary meadow blades. There are
 * no sprites, alpha cards, textures, static distant carpet, or RAF allocations.
 */
function cottonGrassGeometry():T.BufferGeometry {
  const vertices:number[]=[],colours:number[]=[],indices:number[]=[];
  const vertex=(x:number,y:number,z:number,hex:number):number=>{
    const i=vertices.length/3,c=new T.Color(hex);
    vertices.push(x,y,z);colours.push(c.r,c.g,c.b);return i;
  };
  function puff(x:number,y:number,z:number,r:number,hex:number):void {
    const t=vertex(x,y+r,z,hex),b=vertex(x,y-r,z,hex);
    const l=vertex(x-r,y,z,hex),right=vertex(x+r,y,z,hex);
    const f=vertex(x,y,z+r,hex),back=vertex(x,y,z-r,hex);
    indices.push(t,f,right,t,l,f,t,back,l,t,right,back,
      b,right,f,b,f,l,b,l,back,b,back,right);
  }
  const stems=[
    {x:-.09,z:.025,h:.94,dx:-.065,dz:.075},
    {x:.115,z:-.05,h:.78,dx:.07,dz:-.045},
  ] as const;
  for(const [i,stem] of stems.entries()){
    const start=vertices.length/3;
    for(let ring=0;ring<3;ring++){
      const t=ring/2,h=(stem.h-.085)*t,r=.016-.006*t;
      const x=stem.x+stem.dx*t*t,z=stem.z+stem.dz*t*t;
      for(let side=0;side<3;side++){
        const angle=side*Math.PI*2/3+i*.3;
        vertex(x+Math.cos(angle)*r,.012+h,z+Math.sin(angle)*r,
          ring===0?0x627b4c:ring===1?0x8da16c:0xabb48a);
      }
    }
    for(let ring=0;ring<2;ring++)for(let side=0;side<3;side++){
      const a=start+ring*3+side,b=start+ring*3+(side+1)%3;
      indices.push(a,b,a+3,b,b+3,a+3);
    }
    const tipX=stem.x+stem.dx,tipZ=stem.z+stem.dz;
    // Separated, nonidentical octahedra make a cotton tuft with volume in
    // every viewing direction instead of the same flat white billboard.
    puff(tipX,stem.h,tipZ,.073,i?0xe7e2cf:0xf3f0e2);
    puff(tipX-.045,stem.h+.012,tipZ+.02,.051,0xf7f5e9);
    puff(tipX+.047,stem.h-.025,tipZ-.034,.046,0xdedbc8);
    puff(tipX+.008,stem.h+.035,tipZ+.052,.043,0xeee9d7);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colours,3));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  return g;
}

export function createNearMeadowReview(
  terrain:ShiretokoTerrain,quality:MeadowQuality='low',
):NearMeadowReview {
  if(quality!=='low'&&quality!=='balanced')throw new RangeError('invalid near meadow quality');
  const spec=CONFIG[quality],geometry=grassGeometry();
  const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,flatShading:true});
  const mesh=new T.InstancedMesh(geometry,material,spec.capacity);
  mesh.name='flora/review/near-field-meadow/one-instanced-draw';
  mesh.count=0;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled=true;
  // One extra bounded draw batch ONLY where the real terrain is damp, not
  // a full-map mesh. No additional per-frame material or geometry creation.
  const cotton=new T.InstancedMesh(cottonGrassGeometry(),
    new T.MeshLambertMaterial({vertexColors:true,flatShading:true}),spec.cottonCapacity);
  cotton.name='flora/review/near-field-cottongrass/moisture-gated';
  cotton.count=0;cotton.instanceMatrix.setUsage(T.DynamicDrawUsage);
  cotton.frustumCulled=true;
  const group=new T.Group();group.name='opt-in terrain-grounded near-field meadow';
  group.add(mesh,cotton);
  const origin=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),mat=new T.Matrix4(),axis=new T.Vector3(0,1,0);
  const instanceTint=new T.Color();
  let anchorX=Infinity,anchorZ=Infinity,rebuilds=0;
  function sync(x:number,z:number):boolean {
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    // Quantized centre avoids reallocations on every orbit/walk RAF.
    const cx=Math.floor(x/CONFIG.step)*CONFIG.step;
    const cz=Math.floor(z/CONFIG.step)*CONFIG.step;
    if(cx===anchorX&&cz===anchorZ)return false;
    anchorX=cx;anchorZ=cz;rebuilds++;
    let count=0,cottonCount=0;
    const loX=Math.floor((cx-spec.radius)/spec.spacing);
    const hiX=Math.ceil((cx+spec.radius)/spec.spacing);
    const loZ=Math.floor((cz-spec.radius)/spec.spacing);
    const hiZ=Math.ceil((cz+spec.radius)/spec.spacing);
    for(let gz=loZ;gz<=hiZ;gz++)for(let gx=loX;gx<=hiX;gx++){
      const jx=.19+.62*hash(gx,gz,2),jz=.19+.62*hash(gx,gz,3);
      const px=Math.fround((gx+jx)*spec.spacing),pz=Math.fround((gz+jz)*spec.spacing);
      // Coherent ~15m patches provide reed/grass bunches and open gaps,
      // rather than a near-uniform lattice. The hash uses WORLD cells and
      // never the current camera position, so walking cannot reshuffle it.
      const patch=hash(Math.floor(gx/6),Math.floor(gz/6),21);
      const localAccept=spec.accept*(.64+.58*patch);
      if((px-cx)**2+(pz-cz)**2>spec.radius**2 ||
        Math.abs(px)>=TERRAIN.extent-3||Math.abs(pz)>=TERRAIN.extent-3 ||
        hash(gx,gz,1)>localAccept)continue;
      // Protect open water, sensitive marsh, the walkable trail, cabin stairs,
      // lookout site and existing unchanged 5m terrain/collision surface.
      const y=terrain.heightAt(px,pz),wet=wetnessAt(px,pz,y),slope=terrain.slopeAt(px,pz);
      if(!Number.isFinite(y)||!Number.isFinite(wet)||!Number.isFinite(slope)||
        y>265||terrain.inWater(px,pz)||
        slope>.48||wet>.70||
        routeSample(px,pz).distance<FLORA_RULES.trailClearance)continue;
      const foundation=Math.min(Math.hypot(px+170,pz-850)-65,
        Math.hypot(px+140,pz+310)-18,cabinSiteClearanceDistance(px,pz));
      if(!Number.isFinite(foundation)||foundation<FLORA_RULES.structureClearance)continue;
      if(count>=spec.capacity)throw new RangeError('near-field flora capacity exceeded');
      origin.set(px,Math.fround(y),pz);
      rotation.setFromAxisAngle(axis,hash(gx,gz,4)*Math.PI*2);
      const s=.72+.5*hash(gx,gz,5);
      scale.set(s*(.83+.25*hash(gx,gz,6)),s*(.80+.17*hash(gx,gz,7)),
        s*(.87+.27*hash(gx,gz,8)));
      mat.compose(origin,rotation,scale);
      // A single instanced colour attribute adds dry ochre / moist green
      // variation to EXISTING vertex colours; no separate grass meshes,
      // texture samplers, per-frame objects, save mutations or draw calls.
      const sunny=.93+.13*hash(gx,gz,9);
      instanceTint.setRGB(sunny*(.98+.06*(1-wet)),
        sunny*(.94+.08*wet),sunny*(.84+.16*wet));
      mesh.setColorAt(count,instanceTint);
      mesh.setMatrixAt(count++,mat);
      // Marsh-fringe cottongrass shares that ROOT/rotation/scale, so every
      // white head grows out of an accepted physical 5m-ground grass clump.
      // Wet inland edges only: the dry forest, open water, steep banks, route
      // and all timber/cabin clearances remain free.
      if(wet>=.14&&wet<=.65&&slope<.35&&
        hash(gx,gz,19)<.40&&cottonCount<spec.cottonCapacity)
        cotton.setMatrixAt(cottonCount++,mat);
    }
    cotton.count=cottonCount;cotton.instanceMatrix.needsUpdate=true;
    cotton.computeBoundingSphere();
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
    return true;
  }
  return Object.freeze({group,
    get instances(){return mesh.count;},
    get cottonClusters(){return cotton.count;},
    get drawGroups(){return (mesh.count>0?1:0)+(cotton.count>0?1:0);},
    get rebuilds(){return rebuilds;},sync});
}
