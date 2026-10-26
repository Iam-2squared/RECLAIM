import type { AuthoredVisualMesh } from './authored-map-data.ts';
import type { AuthoredMapPhysicsData, AuthoredMesh, AuthoredGroundMask } from './authored-map-physics.ts';
import type { Collider } from './types.ts';

export interface EncounterPoint {x:number;y:number;z:number}
type EncounterKind='humanoid'|'drone';
type EncounterBounds={minX:number;maxX:number;minZ:number;maxZ:number};
export interface ShiretokoEncounterLayout {
  warehouse:{
    id:string;center:EncounterPoint;entrance:EncounterPoint;roadJoin:EncounterPoint;
    floorHeight:number;bounds:EncounterBounds;roadProgress:number;
    devices:readonly {kind:EncounterKind;position:EncounterPoint;radius:number}[];
    paths:Readonly<Record<EncounterKind,readonly EncounterPoint[]>>;
  };
  bossArena:{
    id:string;center:EncounterPoint;entrance:EncounterPoint;roadJoin:EncounterPoint;
    radius:number;blendRadius:number;accessPath:readonly EncounterPoint[];
  };
  /** Additive source-coordinate meshes; the original payload remains untouched. */
  meshes:readonly AuthoredVisualMesh[];
  walkingMeshes:readonly AuthoredMesh[];
  colliders:readonly Collider[];
  groundMask:AuthoredGroundMask;
  sourceMeshNames:readonly string[];
}

type RGB=readonly[number,number,number];
const cached=new WeakMap<AuthoredMapPhysicsData,ShiretokoEncounterLayout>();
const point=(x:number,y:number,z:number):EncounterPoint=>({x,y,z});
const horizontal=(a:EncounterPoint,b:EncounterPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Build immutable, already-world-positioned buffers in the authored X/-Z/Y axes. */
class MeshBuilder {
  positions:number[]=[];indices:number[]=[];colors:number[]=[];
  triangle(a:EncounterPoint,b:EncounterPoint,c:EncounterPoint,color:RGB,bColor:RGB=color,cColor:RGB=color){
    const start=this.positions.length/3;
    for(const p of[a,b,c])this.positions.push(p.x,-p.z,p.y);
    this.colors.push(...color,...bColor,...cColor);
    this.indices.push(start,start+1,start+2);
  }
  quad(a:EncounterPoint,b:EncounterPoint,c:EncounterPoint,d:EncounterPoint,color:RGB){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:RGB){
    const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
    this.quad(point(x0,y1,z0),point(x0,y1,z1),point(x1,y1,z1),point(x1,y1,z0),color);
    this.quad(point(x0,y0,z0),point(x1,y0,z0),point(x1,y0,z1),point(x0,y0,z1),color);
    this.quad(point(x0,y0,z0),point(x0,y0,z1),point(x0,y1,z1),point(x0,y1,z0),color);
    this.quad(point(x1,y0,z1),point(x1,y0,z0),point(x1,y1,z0),point(x1,y1,z1),color);
    this.quad(point(x1,y0,z0),point(x0,y0,z0),point(x0,y1,z0),point(x1,y1,z0),color);
    this.quad(point(x0,y0,z1),point(x1,y0,z1),point(x1,y1,z1),point(x0,y1,z1),color);
  }
  mesh(name:string,roughness=.94):AuthoredVisualMesh{return{name,positions:this.positions,indices:this.indices,colors:this.colors,roughness,doubleSided:true};}
}

/** Only original terrain is sampled, so repeated calls never accumulate overlays. */
function originalGroundSampler(data:AuthoredMapPhysicsData){
  const meshes=data.meshes.filter(mesh=>/Terrain_Surface|Coastal_Cliffs/.test(mesh.name));
  return(x:number,z:number)=>{
    let result=-Infinity;
    for(const mesh of meshes){const p=mesh.positions,ix=mesh.indices;
      for(let i=0;i<ix.length;i+=3){
        const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3,ax=p[a],az=-p[a+1],bx=p[b],bz=-p[b+1],cx=p[c],cz=-p[c+1];
        if(x<Math.min(ax,bx,cx)-1e-6||x>Math.max(ax,bx,cx)+1e-6||z<Math.min(az,bz,cz)-1e-6||z>Math.max(az,bz,cz)+1e-6)continue;
        const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-8)continue;
        const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
        if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)result=Math.max(result,u*p[a+2]+v*p[b+2]+w*p[c+2]);
      }
    }
    return Number.isFinite(result)?result:109.6;
  };
}

function closestRoad(data:AuthoredMapPhysicsData,target:EncounterPoint,start=0,end=Infinity){
  const path=data.trail?.path??[];let best:EncounterPoint|undefined,bestIndex=0,bestDistance=Infinity,total=0,chosen=0;
  for(let i=0;i<path.length;i++){
    const p=point(path[i][0],path[i][2],-path[i][1]);
    if(i)total+=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]);
    const distance=horizontal(p,target);if(i>=start&&i<=end&&distance<bestDistance){best=p;bestDistance=distance;bestIndex=i;chosen=total;}
  }
  return{point:best??target,index:bestIndex,distance:chosen};
}

function walkway(builder:MeshBuilder,path:readonly EncounterPoint[],width:number,color:RGB){
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=horizontal(a,b);if(length<1e-6)continue;
    const nx=-(b.z-a.z)/length*width/2,nz=(b.x-a.x)/length*width/2;
    // Counter-clockwise in X/Z gives an upward normal in the source coordinates.
    builder.quad(point(a.x-nx,a.y,a.z-nz),point(a.x+nx,a.y,a.z+nz),point(b.x+nx,b.y,b.z+nz),point(b.x-nx,b.y,b.z-nz),color);
  }
}

/** Fixed Shiretoko additions. `terrain` is accepted for source-builder compatibility,
 * but original source geometry alone determines placement and surface heights. */
export function createShiretokoEncounterLayout(data:AuthoredMapPhysicsData,_terrain?:unknown):ShiretokoEncounterLayout {
  const existing=cached.get(data);if(existing)return existing;
  const floorHeight=70.55,center=point(-10,floorHeight,260),entrance=point(-20,floorHeight,260);
  const joined=closestRoad(data,entrance,950,1260),roadJoin={...joined.point};
  const originalJoin=closestRoad(data,point(-190,110.2,-95));
  const devices=[{kind:'humanoid' as const,position:point(-4,floorHeight,256),radius:1.55},{kind:'drone' as const,position:point(-4,floorHeight,264),radius:1.7}];
  const paths={
    humanoid:[devices[0].position,point(-12,floorHeight,256),point(-16,floorHeight,260),entrance,roadJoin],
    drone:[devices[1].position,point(-12,floorHeight,264),point(-16,floorHeight,260),entrance,roadJoin],
  };
  const warehouse={id:'warehouse-midway',center,entrance,roadJoin,floorHeight,bounds:{minX:-20,maxX:0,minZ:252,maxZ:268},roadProgress:originalJoin.distance?joined.distance/originalJoin.distance:.46,devices,paths};
  const arenaCenter=point(-118,109.6,-290),radius=14,blendRadius=19,nearestArenaRoad=closestRoad(data,arenaCenter,2600,3250);
  // Join on the approach before the existing path enters the earthworks, so the
  // branch never starts underneath the raised clearing or doubles back on itself.
  let arenaRoad=nearestArenaRoad.point;
  for(let i=nearestArenaRoad.index;i>=0&&horizontal(arenaRoad,arenaCenter)<blendRadius+2;i--){const p=data.trail?.path?.[i];if(p)arenaRoad=point(p[0],p[2],-p[1]);}
  const length=horizontal(arenaCenter,arenaRoad),arenaEntrance=point(arenaCenter.x+(arenaRoad.x-arenaCenter.x)*radius/length,arenaCenter.y,arenaCenter.z+(arenaRoad.z-arenaCenter.z)*radius/length);
  const bossArena={id:'shiretoko-foothill-arena',center:arenaCenter,entrance:arenaEntrance,roadJoin:{...arenaRoad},radius,blendRadius,accessPath:[{...arenaRoad},arenaEntrance,arenaCenter]};
  const floor=new MeshBuilder(),metal=new MeshBuilder(),arena=new MeshBuilder(),colliders:Collider[]=[];
  // Authored colours are sRGB; pale concrete and galvanized walls keep the two
  // machines readable under the unchanged outdoor hemisphere lighting.
  const concrete:RGB=[.55,.565,.49],wall:RGB=[.64,.68,.63],rust:RGB=[.42,.30,.19],frame:RGB=[.36,.43,.39];
  floor.box(-10,floorHeight-1.1,260,20.4,2.2,16.4,concrete);
  const ramp=new MeshBuilder();walkway(ramp,[roadJoin,entrance],5.6,concrete);
  const wallBox=(x:number,z:number,w:number,d:number,height=5.7,bottom=floorHeight,color:RGB=wall)=>{
    metal.box(x,bottom+height/2,z,w,height,d,color);
    colliders.push({type:'aabb',minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:bottom,maxY:bottom+height,tag:'encounter/metal/warehouse-midway/wall'});
  };
  wallBox(0,260,.25,16);wallBox(-10,252,20,.25);wallBox(-10,268,20,.25);
  wallBox(-20,254.25,.25,4.5);wallBox(-20,265.75,.25,4.5);wallBox(-20,260,.25,7,1.1,floorHeight+4.6);
  // Corrugated siding and structural ribs share one static mesh/material.
  for(let i=0;i<=28;i++){const x=-20+i*20/28;metal.box(x,floorHeight+2.9,251.84,.065,5.6,.08,i%6===0?rust:frame);metal.box(x,floorHeight+2.9,268.16,.065,5.6,.08,i%7===0?rust:frame);}
  for(const x of[-20,0])for(const z of[252,268])metal.box(x,floorHeight+2.9,z,.34,5.9,.34,frame);
  for(const z of[256.5,263.5])metal.box(-20.15,floorHeight+2.3,z,.32,4.6,.24,frame);
  metal.box(-20.18,floorHeight+4.65,260,.34,.3,7.4,frame);
  const eave=floorHeight+5.85,peak=floorHeight+7.85;
  metal.quad(point(-20.6,eave,251.4),point(-20.6,peak,260),point(.6,peak,260),point(.6,eave,251.4),wall);
  metal.quad(point(-20.6,peak,260),point(-20.6,eave,268.6),point(.6,eave,268.6),point(.6,peak,260),rust);
  metal.triangle(point(-20, floorHeight+5.7,252),point(-20,eave+2,260),point(-20,floorHeight+5.7,268),wall);
  metal.triangle(point(0,floorHeight+5.7,268),point(0,eave+2,260),point(0,floorHeight+5.7,252),wall);
  for(const x of[-18,-13,-8,-3])metal.box(x,floorHeight+.035,260,.1,.025,12,[.35,.31,.16]);
  metal.box(-20.3,floorHeight+5.15,260,.08,.52,3.4,[.11,.22,.22]);
  for(const z of[258.8,259.6,260.4,261.2])metal.box(-20.36,floorHeight+5.15,z,.035,.07,.48,[.3,.48,.43]);
  colliders.push({type:'aabb',minX:-20.2,maxX:.2,minZ:251.8,maxZ:268.2,minY:floorHeight-2.2,maxY:floorHeight,tag:'encounter/stone/warehouse-midway/foundation'});
  const ground=originalGroundSampler(data),rings=[0,7,radius,16,17.5,blendRadius],segments=48;
  const ringPoint=(ring:number,index:number)=>{
    const angle=index/segments*Math.PI*2,r=rings[ring],x=arenaCenter.x+Math.cos(angle)*r,z=arenaCenter.z+Math.sin(angle)*r;
    const blend=Math.max(0,(r-radius)/(blendRadius-radius)),y=blend===0?arenaCenter.y:arenaCenter.y*(1-blend)+(ground(x,z)+.045)*blend;
    return point(x,y,z);
  };
  const ringPoints=rings.map((_,r)=>Array.from({length:segments+1},(_,s)=>ringPoint(r,s)));
  const earth:RGB=[.60,.61,.40],grass:RGB=[.50,.64,.28];
  const ringColor=(ring:number,index:number):RGB=>{
    const r=rings[ring],blend=r<=radius?.24*(r/radius)**2:.24+.76*(r-radius)/(blendRadius-radius);
    const angle=index/segments*Math.PI*2,shade=.0015*Math.sin(Math.cos(angle)*r*.53+Math.sin(angle)*r*.37);
    return[earth[0]+(grass[0]-earth[0])*blend+shade,earth[1]+(grass[1]-earth[1])*blend+shade,earth[2]+(grass[2]-earth[2])*blend+shade];
  };
  const ringColors=rings.map((_,r)=>Array.from({length:segments+1},(_,s)=>ringColor(r,s)));
  for(let r=1;r<rings.length;r++)for(let s=0;s<segments;s++){
    if(r===1)arena.triangle(arenaCenter,ringPoints[r][s+1],ringPoints[r][s],earth,ringColors[r][s+1],ringColors[r][s]);
    else{
      arena.triangle(ringPoints[r-1][s],ringPoints[r-1][s+1],ringPoints[r][s+1],ringColors[r-1][s],ringColors[r-1][s+1],ringColors[r][s+1]);
      arena.triangle(ringPoints[r-1][s],ringPoints[r][s+1],ringPoints[r][s],ringColors[r-1][s],ringColors[r][s+1],ringColors[r][s]);
    }
  }
  const access=new MeshBuilder();walkway(access,[arenaRoad,arenaEntrance],4.8,[.57,.59,.39]);
  // A physical sign identifies the short turn off the existing mountain path.
  const sign=point(arenaRoad.x-2.7,arenaRoad.y,arenaRoad.z-.4);
  metal.box(sign.x,sign.y+1,sign.z,.12,2,.12,frame);metal.box(sign.x,sign.y+1.7,sign.z,1.65,.45,.11,[.17,.28,.27]);
  const meshes=[floor.mesh('Encounter / Midway Warehouse / Foundation'),ramp.mesh('Encounter / Midway Warehouse / Access'),metal.mesh('Encounter / Midway Warehouse / Shell',.84),arena.mesh('Encounter / Foothill Arena / Earthworks'),access.mesh('Encounter / Foothill Arena / Access')];
  const layout:ShiretokoEncounterLayout={warehouse,bossArena,meshes,walkingMeshes:[meshes[0],meshes[1],meshes[3],meshes[4]],colliders,groundMask:{center:arenaCenter,radius:blendRadius,sides:segments},sourceMeshNames:meshes.map(mesh=>mesh.name)};
  cached.set(data,layout);return layout;
}
