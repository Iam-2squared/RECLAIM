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

const kinds: readonly FloraKind[] = ['spruce','birch','alpine-shrub','sedge','sasa','meadow-grass','stone','deadwood'];
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
      // Six outward-drooping low boughs make the mature spruce legible at
      // walking distance. Their open-backed, triangular needle silhouettes
      // emerge from the trunk beneath the uneven crown; all are merged into
      // the SAME shared instanced geometry and Lambert draw group. Density,
      // water/route clearance, exact ground origin, saves and collisions
      // remain untouched. No new assets, textures or material allocations.
      const lowerBoughColours=[0x2a4336,0x3b5840,0x304b38,0x486047,0x344b39,0x405a42];
      for(let i=0;i<lowerBoughColours.length;i++){
        const angle=i*Math.PI/3+(i%2)*.12;
        part(parts,new T.ConeGeometry(.26+(i%3)*.035,1.95+(i%2)*.28,3,1,true),
          lowerBoughColours[i],g=>{
            g.rotateZ(-1.87);
            g.rotateY(angle);
            g.translate(Math.cos(angle)*.94,3.35+(i%3)*.35,Math.sin(angle)*.94);
          });
      }
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
      rock(0x475943,.03,.95,.31,.64,.55,.52);
      part(parts,new T.IcosahedronGeometry(.105,0),0x9c6347,
        g=>g.translate(-.76,1.15,.19));
      part(parts,new T.IcosahedronGeometry(.09,0),0xb08058,
        g=>g.translate(.73,1.18,-.18));
      break;
    case 'sedge': {
      // Actual wetland sedges: six asymmetrical, tapering leaves bend outward
      // from the same rooted point, rather than five upright rectangular
      // billboards. UVs match the built-in seed-stalk attributes, allowing
      // every triangle to remain inside ONE existing instanced draw group.
      // Density, habitat, physical ground, clearances and collision do not move.
      const leafColours=[0x6f8650,0x85985b,0x728c52,0x8b9a60,0x647c4a,0x7e9657];
      for(let i=0;i<6;i++){
        const h=.76+(i%3)*.085,w=.19+(i%2)*.035;
        const leaf=new T.BufferGeometry();
        leaf.setAttribute('position',new T.Float32BufferAttribute([
          0,.025,0,
          -w*.5,h*.45,.012,
          w*.5,h*.45,.012,
          -w*.26,h*.75,.095,
          w*.26,h*.75,.095,
          0,h,.18,
        ],3));
        leaf.setAttribute('uv',new T.Float32BufferAttribute([
          .5,0, 0,.45, 1,.45, .24,.75, .76,.75, .5,1,
        ],2));
        leaf.setIndex([0,1,2,1,3,4,1,4,2,3,5,4]);
        leaf.computeVertexNormals();
        const angle=2*Math.PI*i/6+(i%2)*.12;
        part(parts,leaf,leafColours[i],g=>{
          g.rotateZ((i%2?1:-1)*(.14+.03*(i%3)));
          g.rotateY(angle);
          g.translate(Math.cos(angle)*.04,0,Math.sin(angle)*.04);
        });
      }
      // A slender seed-bearing stalk and two short offset seed spikes give
      // a recognizable marsh sedge silhouette without extra meshes/textures.
      part(parts,new T.CylinderGeometry(.024,.035,1.12,4,1),
        0x728356,g=>g.translate(.05,.56,.01));
      part(parts,new T.CylinderGeometry(.048,.06,.25,5,1),
        0x826947,g=>g.translate(.05,1.21,.01));
      for(let i=0;i<2;i++)
        part(parts,new T.ConeGeometry(.035,.10,3,1),
          i?0x9a8253:0x776843,g=>{
            g.rotateZ(i?-.33:.33);
            g.translate(i?-.075:.085,1.095+i*.07,i?-.035:.04);
          });
      break;
    }
    case 'meadow-grass': {
      // Short, arching lowland grass fans live in an existing planned cell,
      // never on a second dense scatter lattice. Eight tapered leaf ribbons
      // share one sampler-free species geometry, one material and the existing
      // 600m instanced culling grid, without modifying walker collision.
      const colours=[0x76864d,0x88945d,0x6f8051,0x9b995f,0x63784b,0x84975b,0x9a8d50,0x71844e];
      for(let i=0;i<8;i++){
        const h=.49+(i%4)*.065,w=.16+(i%3)*.035;
        const leaf=new T.BufferGeometry();
        leaf.setAttribute('position',new T.Float32BufferAttribute([
          0,.015,0,
          -w*.5,h*.42,.015, w*.5,h*.42,.015,
          -w*.26,h*.74,.12, w*.26,h*.74,.12,
          0,h,.25,
        ],3));
        leaf.setAttribute('uv',new T.Float32BufferAttribute([
          .5,0, 0,.42, 1,.42, .24,.74, .76,.74, .5,1,
        ],2));
        leaf.setIndex([0,1,2,1,3,4,1,4,2,3,5,4]);
        leaf.computeVertexNormals();
        const angle=i*Math.PI/4+(i%2)*.11;
        part(parts,leaf,colours[i],g=>{
          g.rotateZ((i%2?1:-1)*(.08+.015*(i%3)));
          g.rotateY(angle);
          g.translate(Math.cos(angle)*.10,0,Math.sin(angle)*.10);
        });
      }
      // One shared root closes the fan visually against the exact ground.
      part(parts,new T.CylinderGeometry(.055,.085,.15,5,1),
        0x667348,g=>g.translate(0,.075,0));
      break;
    }
    case 'sasa': {
      // A native understorey tuft reads as six tapered, asymmetrically bent
      // leaves rather than four upright rectangular billboards. Every leaf
      // merges into the existing ONE species geometry/material/instanced draw
      // group. Habitat, route clearance, density and ground origin stay fixed.
      const colours=[0x416d4b,0x507c52,0x608958,0x375f46,0x638755,0x46754b];
      for(let i=0;i<6;i++){
        const h=1.02+(i%3)*.105,w=.29+(i%2)*.055;
        const leaf=new T.BufferGeometry();
        leaf.setAttribute('position',new T.Float32BufferAttribute([
          0,.08,0,
          -w/2,h*.54,.025,
          w/2,h*.54,.025,
          0,h,.12,
        ],3));
        // Three's geometry merger requires the same vertex attributes on
        // the hand-authored leaf and the built-in UV-bearing wooden stem.
        // UVs are metadata only here: the foliage material stays sampler-free.
        leaf.setAttribute('uv',new T.Float32BufferAttribute([
          .5,0, 0,.54, 1,.54, .5,1,
        ],2));
        leaf.setIndex([0,1,2,1,3,2]);
        leaf.computeVertexNormals();
        const angle=2*Math.PI*i/6+(i%2)*.17;
        part(parts,leaf,colours[i],g=>{
          g.rotateZ((i%2?1:-1)*(.20+.025*(i%3)));
          g.rotateY(angle);
          g.translate(Math.cos(angle)*.055,0,Math.sin(angle)*.055);
        });
      }
      // Short real stem closes the visual gap from the 5m terrain origin.
      part(parts,new T.CylinderGeometry(.024,.045,.24,5,1),
        0x495e3b,g=>g.translate(0,.12,0));
      break;
    }
    case 'deadwood': {
      // Mossy, snapped windfall on the forest floor, never an upright tree.
      // All bark, broken branches and moss are merged into ONE cullable,
      // sampler-free species mesh. Existing habitat/clearance gates apply.
      part(parts,new T.CylinderGeometry(.18,.22,3.15,6,1),0x65513c,g=>{
        g.rotateZ(Math.PI/2);g.translate(0,.205,0);
      });
      part(parts,new T.CylinderGeometry(.055,.10,.82,5,1),0x4b392d,g=>{
        g.rotateZ(.88);g.translate(-.72,.45,.10);
      });
      part(parts,new T.CylinderGeometry(.045,.075,.63,4,1),0x72543a,g=>{
        g.rotateZ(-.92);g.translate(.65,.39,-.09);
      });
      part(parts,new T.IcosahedronGeometry(1,0),0x526c47,g=>{
        g.scale(.62,.10,.23);g.translate(-.26,.39,.03);
      });
      part(parts,new T.IcosahedronGeometry(1,0),0x617850,g=>{
        g.scale(.35,.08,.19);g.translate(.52,.39,-.05);
      });
      // Both saw-cut ends reveal pale sapwood and darker heartwood instead
      // of terminating in blank bark-coloured cylinder caps. Each end disc
      // sits directly on the original 3.15m log axis, just 3-9mm outside its
      // respective cap. All four thin faces merge into the SAME existing
      // vertex-coloured deadwood species geometry: no new draw calls, texture,
      // standing obstacle, ground height or clearing/route changes.
      for(const side of [-1,1] as const){
        const radius=side<0?.174:.208;
        part(parts,new T.CircleGeometry(radius,6),0xbba17e,g=>{
          g.rotateY(side*Math.PI/2);
          g.translate(side*1.578,.205,0);
        });
        part(parts,new T.CircleGeometry(radius*.38,5),0x88694e,g=>{
          g.rotateY(side*Math.PI/2);
          g.translate(side*1.584,.205,0);
        });
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
      // Two frost-fractured, mineral-stained faces sit partly embedded in
      // the main talus boulder, breaking its uniform convex silhouette.
      // Their tetrahedral caps keep the original one-material, one-instance
      // species mesh and 600m culling architecture; they cannot affect
      // terrain, route clearance, water or physical player collision.
      part(parts,new T.TetrahedronGeometry(1,0),0x879184,g=>{
        g.scale(.23,.12,.26);g.rotateY(.56);g.rotateZ(-.15);
        g.translate(-.48,.70,.35);
      });
      part(parts,new T.TetrahedronGeometry(1,0),0x687a65,g=>{
        g.scale(.22,.11,.19);g.rotateY(-.27);
        g.translate(.25,.71,-.38);
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
  const axis=new T.Vector3(0,1,0),logAxis=new T.Vector3(0,0,1),logTilt=new T.Quaternion(),matrix=new T.Matrix4(),origin=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
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
      // The lying trunk follows the local 5m height mesh along its long axis.
      // This is a visual tilt about the unchanged physics-grounded origin,
      // with no terrain edit, new collider, materials or campaign save access.
      if(kind==='deadwood'){
        const span=1.35*s,dx=Math.cos(p.rotation)*span,dz=-Math.sin(p.rotation)*span;
        const endDelta=terrain.heightAt(x+dx,z+dz)-terrain.heightAt(x-dx,z-dz);
        rotation.multiply(logTilt.setFromAxisAngle(logAxis,Math.atan2(endDelta,span*2)));
      }
      // Species-specific, deterministic nonuniform silhouettes prevent
      // identical trees without extra instances, materials or draw calls.
      if(kind==='spruce' || kind==='birch'){
        const width=.90+.14*Math.abs(Math.sin(p.rotation*1.7));
        const depth=.90+.14*Math.abs(Math.cos(p.rotation*1.3));
        const height=.93+.12*Math.abs(Math.sin(p.rotation+.75));
        scale.set(s*width,s*height,s*depth);
      } else if(kind==='alpine-shrub'){
        // Wind-flattened, laterally uneven tundra scrub; the shared actual
        // three-shoot mesh and 600m instanced draw group remain unchanged.
        // The widest rooted crown stays inside the existing 8m trail and 7m
        // structure clearances. No new polygons, textures or collisions.
        const width=.96+.27*Math.abs(Math.sin(p.rotation*1.7));
        const depth=.90+.20*Math.abs(Math.cos(p.rotation*1.32));
        const height=.79+.12*Math.abs(Math.sin(p.rotation*.83));
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
