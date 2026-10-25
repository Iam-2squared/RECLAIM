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
  get rebuilds():number;
  sync:(x:number,z:number)=>boolean;
}>;

const CONFIG = Object.freeze({
  low:Object.freeze({spacing:3.6,radius:34,capacity:430,accept:.64}),
  balanced:Object.freeze({spacing:2.8,radius:44,capacity:1150,accept:.78}),
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
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
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
  const group=new T.Group();group.name='opt-in terrain-grounded near-field meadow';
  group.add(mesh);
  const origin=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),mat=new T.Matrix4(),axis=new T.Vector3(0,1,0);
  let anchorX=Infinity,anchorZ=Infinity,rebuilds=0;
  function sync(x:number,z:number):boolean {
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    // Quantized centre avoids reallocations on every orbit/walk RAF.
    const cx=Math.floor(x/CONFIG.step)*CONFIG.step;
    const cz=Math.floor(z/CONFIG.step)*CONFIG.step;
    if(cx===anchorX&&cz===anchorZ)return false;
    anchorX=cx;anchorZ=cz;rebuilds++;
    let count=0;
    const loX=Math.floor((cx-spec.radius)/spec.spacing);
    const hiX=Math.ceil((cx+spec.radius)/spec.spacing);
    const loZ=Math.floor((cz-spec.radius)/spec.spacing);
    const hiZ=Math.ceil((cz+spec.radius)/spec.spacing);
    for(let gz=loZ;gz<=hiZ;gz++)for(let gx=loX;gx<=hiX;gx++){
      const jx=.19+.62*hash(gx,gz,2),jz=.19+.62*hash(gx,gz,3);
      const px=Math.fround((gx+jx)*spec.spacing),pz=Math.fround((gz+jz)*spec.spacing);
      if((px-cx)**2+(pz-cz)**2>spec.radius**2 ||
        Math.abs(px)>=TERRAIN.extent-3||Math.abs(pz)>=TERRAIN.extent-3 ||
        hash(gx,gz,1)>spec.accept)continue;
      // Protect open water, sensitive marsh, the walkable trail, cabin stairs,
      // lookout site and existing unchanged 5m terrain/collision surface.
      const y=terrain.heightAt(px,pz);
      if(!Number.isFinite(y)||y>265||terrain.inWater(px,pz)||
        terrain.slopeAt(px,pz)>.48||wetnessAt(px,pz,y)>.70||
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
      mesh.setMatrixAt(count++,mat);
    }
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    return true;
  }
  return Object.freeze({group,
    get instances(){return mesh.count;},
    get rebuilds(){return rebuilds;},sync});
}
