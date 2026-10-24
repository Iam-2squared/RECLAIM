import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planFlora, type FloraKind } from './vegetation-plan.ts';
import { ShiretokoTerrain, routeSample, wetnessAt } from './terrain.ts';
import { cabinSiteClearanceDistance } from './cabin-site.ts';

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
      // Layer irregular boughs along a mature trunk instead of repeating
      // three large, evenly spaced tree-shaped blobs. Reuse the same shared
      // species geometry and existing instance/draw-call budget.
      trunk(0x514335,8.0,.20);
      rock(0x314b39,-.42,3.85,.10,1.14,1.55,.97);
      rock(0x3f6046,.22,4.96,-.15,1.28,1.48,1.06);
      rock(0x37513c,-.30,6.05,.22,1.02,1.30,.96);
      rock(0x35543e,.25,7.11,-.12,.79,1.00,.81);
      rock(0x416149,-.07,7.95,.04,.49,.80,.52);
      break;
    case 'birch':
      // A split, offset deciduous crown makes birch read differently from
      // spruce in both distant silhouette and low-density SwiftShader mode.
      trunk(0xbab3a0,7.25,.16);
      rock(0x6b8554,-.75,5.35,.08,1.11,1.18,.99);
      rock(0x6e925c,.60,5.86,-.31,1.28,1.16,1.10);
      rock(0x4e7651,-.19,6.77,.52,1.11,1.13,1.02);
      rock(0x729057,.46,7.49,.11,.73,.87,.78);
      rock(0x547a52,-.51,6.79,-.58,.79,.95,.77);
      // Two uneven pale fork limbs, partly emerging between crown lobes.
      // Their geometry and bark scars are merged into this SAME shared birch
      // species mesh. No new textures, draw calls, instances or collision.
      part(parts,new T.CylinderGeometry(.045,.10,2.35,4,1),0xa59f8a,g=>{
        g.rotateZ(.51);g.translate(.43,5.54,.18);
      });
      part(parts,new T.CylinderGeometry(.04,.085,1.84,4,1),0xb4ad98,g=>{
        g.rotateZ(-.63);g.translate(-.53,6.10,-.18);
      });
      // Lenticel scars break up the bright, formerly featureless trunk from
      // near walking distance. Six double-sided planes, not six scene meshes.
      for(let i=0;i<6;i++){
        const back=i%2===1;
        part(parts,new T.PlaneGeometry(.22+(i%3)*.025,.065+(i%2)*.015),
          i%2?0x4c5046:0x3e453f,g=>{
            if(back)g.rotateY(Math.PI);
            g.translate((i%3-1)*.012,1.35+i*.73,back?-.145:.145);
          });
      }
      break;
    case 'alpine-shrub':
      // Original understory detail: three irregular rooted woody shoots carry
      // offset crowns and small seed heads, rather than three ground-level
      // identical boulders. Every triangle joins the existing ONE instanced
      // species mesh: no extra draw call, texture, plant or collision volume.
      for(const shoot of [
        {x:-.31,z:.04,tilt:-.36,h:.76,color:0x554431},
        {x:.29,z:-.15,tilt:.43,h:.87,color:0x665139},
        {x:.05,z:.25,tilt:-.15,h:.81,color:0x584934},
      ]){
        part(parts,new T.CylinderGeometry(.025,.053,shoot.h,4,1),
          shoot.color,g=>{
            g.rotateZ(shoot.tilt);
            g.translate(shoot.x,shoot.h*.5,shoot.z);
          });
      }
      rock(0x546647,-.42,.67,.04,.64,.52,.62);
      rock(0x68804e,.40,.74,-.17,.67,.58,.58);
      rock(0x475943,.03,.87,.31,.64,.55,.52);
      part(parts,new T.IcosahedronGeometry(.105,0),0x9c6347,
        g=>g.translate(-.76,1.15,.19));
      part(parts,new T.IcosahedronGeometry(.09,0),0xb08058,
        g=>g.translate(.73,1.18,-.18));
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
      // Marsh sedges now carry a real low-poly seed spike above their
      // blades. Stem and seed share the existing species geometry/material:
      // no new draw calls, textures, instances, route or water occupancy.
      if(sedge){
        part(parts,new T.CylinderGeometry(.024,.035,1.12,4,1),
          0x728356,g=>g.translate(.05,.56,.01));
        part(parts,new T.CylinderGeometry(.048,.06,.25,5,1),
          0x826947,g=>g.translate(.05,1.21,.01));
      }
      break;
    }
    case 'stone':
      // A grounded, irregular talus cluster replaces the solitary repeated
      // dodecahedron. Three faceted fragments share ONE merged geometry,
      // material and existing instanced draw group; bases sit slightly inside
      // the exact 5m ground rather than floating above their sampled origin.
      part(parts,new T.DodecahedronGeometry(1,0),0x6d756e,g=>{
        g.scale(.88,.46,.72);g.rotateY(.27);g.translate(-.10,.41,0);
      });
      part(parts,new T.DodecahedronGeometry(1,0),0x555f5b,g=>{
        g.scale(.39,.31,.36);g.rotateY(.73);g.translate(.65,.28,-.26);
      });
      part(parts,new T.IcosahedronGeometry(1,0),0x879082,g=>{
        g.scale(.33,.23,.40);g.rotateY(-.37);g.translate(-.62,.19,.34);
      });
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
      // Existing clearings remain; the actual relocated cabin and east stairs
      // require their own margin, or vegetation can pierce walls/decking.
      structureDistance:(x,z)=>Math.min(
        Math.hypot(x+170,z-850)-65,
        Math.hypot(x+140,z+310)-18,
        cabinSiteClearanceDistance(x,z),
      ),
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
  // Keep this first-stage low-poly review vertex-lit and sampler-free.
  // MeshStandardMaterial allocated an extra fallback WebGL texture in the
  // opt-in scene that remained counted after disposing its owned resources.
  // PBR vegetation is a separate gated upgrade, not a hidden resource leak.
  const material=new T.MeshLambertMaterial({vertexColors:true,flatShading:true,side:T.DoubleSide});
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
      // Species-specific, deterministic nonuniform silhouettes prevent
      // identical trees without extra instances, materials or draw calls.
      if(kind==='spruce' || kind==='birch'){
        const width=.90+.14*Math.abs(Math.sin(p.rotation*1.7));
        const depth=.90+.14*Math.abs(Math.cos(p.rotation*1.3));
        const height=.93+.12*Math.abs(Math.sin(p.rotation+.75));
        scale.set(s*width,s*height,s*depth);
      } else scale.set(s,s,s);
      matrix.compose(origin,rotation,scale);
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
