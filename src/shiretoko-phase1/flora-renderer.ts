import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planFlora, type FloraKind } from './vegetation-plan.ts';
import { ShiretokoTerrain, routeSample, wetnessAt } from './terrain.ts';

/**
 * Opt-in, non-campaign Shiretoko foliage review.
 * Six shared, lightweight original geometries; 600m culling cells prevent
 * a single giant draw group from defeating frustum culling. The existing
 * 5m height surface is the only ground authority.
 */
export type FloraReviewQuality = 'low' | 'balanced';
export type FloraReviewLayer = Readonly<{
  group: T.Group;
  instances: number;
  drawGroups: number;
  instanceBytes: number;
  quality: FloraReviewQuality;
}>;

const kinds: readonly FloraKind[] = ['spruce','birch','alpine-shrub','sedge','sasa','stone'];
const MAX_INSTANCES = 58_000;
const MAX_DRAW_GROUPS = 96;

function part(parts: T.BufferGeometry[], original: T.BufferGeometry, hex: number, place: (g: T.BufferGeometry) => void): void {
  const geometry = original.index ? original.toNonIndexed() : original;
  if (geometry !== original) original.dispose();
  place(geometry);
  const color = new T.Color(hex);
  const values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i=0;i<values.length;i+=3) {values[i]=color.r; values[i+1]=color.g; values[i+2]=color.b;}
  geometry.setAttribute('color',new T.BufferAttribute(values,3));
  parts.push(geometry);
}

function geometryFor(kind: FloraKind): T.BufferGeometry {
  const parts: T.BufferGeometry[]=[];
  const rock=(c:number,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
    part(parts,new T.IcosahedronGeometry(1,0),c,g=>{g.scale(sx,sy,sz);g.translate(x,y,z);});
  };
  const trunk=(c:number,height:number,radius:number)=>{
    part(parts,new T.CylinderGeometry(radius*.72,radius,height,5,1),c,g=>g.translate(0,height*.5,0));
  };
  switch(kind){
    case 'spruce':
      trunk(0x514335,3.3,.16);
      rock(0x314b39,-.23,2.03,.10,.84,.92,.70);
      rock(0x3f6046,.21,2.80,-.16,.67,.89,.63);
      rock(0x37513c,-.11,3.49,.05,.46,.73,.47);
      break;
    case 'birch':
      trunk(0xbab3a0,4.6,.14);
      rock(0x6b8554,-.52,3.64,.06,.90,.91,.75);
      rock(0x6e925c,.43,4.11,.28,.87,1.01,.73);
      rock(0x4e7651,.04,4.94,-.24,.65,.68,.67);
      break;
    case 'alpine-shrub':
      rock(0x546647,-.42,.47,.04,.64,.52,.62);
      rock(0x68804e,.40,.55,-.17,.67,.58,.58);
      rock(0x475943,.03,.72,.31,.64,.55,.52);
      break;
    case 'sedge':
    case 'sasa': {
      const sedge=kind==='sedge',leaves=sedge?5:4;
      for(let i=0;i<leaves;i++){
        const angle=Math.PI*2*i/leaves;
        part(parts,new T.PlaneGeometry(sedge?.09:.27,sedge?.78:1.14),sedge?0x7b9155:0x446949,g=>{
          g.translate(0,sedge?.39:.53,0);g.rotateZ(sedge?.22:.42);g.rotateY(angle);
        });
      }
      break;
    }
    case 'stone':
      part(parts,new T.DodecahedronGeometry(1,0),0x6e7772,g=>{g.scale(.82,.44,.71);g.rotateY(.22);g.translate(0,.40,0);});
      break;
  }
  const merged=mergeGeometries(parts,false);
  for(const g of parts)g.dispose();
  if(!merged)throw new Error('Flora parts cannot be merged');
  merged.computeBoundingBox();merged.computeBoundingSphere();
  return merged;
}

function tint(x:number,z:number): T.Color {
  const n=Math.abs(Math.sin(x*12.9898+z*78.233)*43758.5453)%1;
  const value=.87+n*.23;
  return new T.Color().setRGB(value,value*(.97+n*.045),value*.95+.045);
}

/**
 * A review-only layer: no mutation of the world, save, walking collision,
 * TITLE/HOME, or story unlock state.
 */
export function createFloraReviewLayer(
  terrain: ShiretokoTerrain, quality: FloraReviewQuality='low',
): FloraReviewLayer {
  if(quality!=='low'&&quality!=='balanced')throw new RangeError('invalid flora quality');
  // World-space 600m cells, four-by-four. Preserve room for the future cabin
  // footprint, lake deck and every path even before structural mesh is added.
  const buckets=Array.from({length:16},()=>new Map<FloraKind,ReturnType<typeof planFlora>[number][]>());
  let instances=0;
  for(let cz=0;cz<8;cz++)for(let cx=0;cx<8;cx++){
    const cell=(Math.floor(cz/2)*4+Math.floor(cx/2));
    const planned=planFlora(cx,cz,{
      height:(x,z)=>terrain.heightAt(x,z),
      slope:(x,z)=>terrain.slopeAt(x,z),
      wetness:wetnessAt,
      routeDistance:(x,z)=>routeSample(x,z).distance,
      water:(x,z)=>terrain.inWater(x,z),
      structureDistance:(x,z)=>Math.min(Math.hypot(x+170,z-850)-65,Math.hypot(x+140,z+310)-18),
    },quality);
    for(const plant of planned){
      instances++;
      if(instances>MAX_INSTANCES)throw new RangeError('flora instance budget exceeded');
      const group=buckets[cell].get(plant.kind)??[];
      group.push(plant);buckets[cell].set(plant.kind,group);
    }
  }
  const group=new T.Group();
  group.name='DEVELOPMENT REVIEW foliage - opt in / no campaign or save';
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:0,flatShading:true,side:T.DoubleSide});
  const geometries=new Map(kinds.map(kind=>[kind,geometryFor(kind)]));
  const axis=new T.Vector3(0,1,0),matrix=new T.Matrix4(),origin=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
  let drawGroups=0,instanceBytes=0;
  for(let cell=0;cell<16;cell++)for(const kind of kinds){
    const plants=buckets[cell].get(kind);
    if(!plants?.length)continue;
    const mesh=new T.InstancedMesh(geometries.get(kind)!,material,plants.length);
    mesh.name=`flora/review/600m-${cell}/${kind}`;
    for(let i=0;i<plants.length;i++){
      const p=plants[i],s=p.scale;
      // InstancedMesh stores float32 matrices: collision and render must sample
      // precisely the SAME quantized X/Z, not the unrounded plan coordinates.
      const x=Math.fround(p.x),z=Math.fround(p.z);
      origin.set(x,Math.fround(terrain.heightAt(x,z)),z);
      rotation.setFromAxisAngle(axis,p.rotation);
      scale.set(s,s,s);matrix.compose(origin,rotation,scale);
      mesh.setMatrixAt(i,matrix);
      mesh.setColorAt(i,tint(p.x,p.z));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled=true;
    group.add(mesh);drawGroups++;
    instanceBytes+=plants.length*(16+3)*4;
  }
  if(drawGroups>MAX_DRAW_GROUPS)throw new RangeError('flora draw-group budget exceeded');
  const ambient=new T.AmbientLight(0xc9d5d7,1.25);
  const sun=new T.DirectionalLight(0xffebca,2.1);
  sun.position.set(-900,1400,650);
  group.add(ambient,sun);
  return Object.freeze({group,instances,drawGroups,instanceBytes,quality});
}
