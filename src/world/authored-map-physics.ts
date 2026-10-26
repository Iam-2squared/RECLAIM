import type { AreaDefinition, Collider, Landmark, WorldBounds } from './types.ts';
import { getAreaDefinition } from './areas.ts';
import { AUTHORED_MAP_META } from './authored-map-meta.ts';

export interface AuthoredMesh {
  name:string;positions:readonly number[];indices:readonly number[];water?:boolean;
  houseLayer?:string;warehouseLayer?:string;
}
export interface AuthoredMapPhysicsData {
  meshes:readonly AuthoredMesh[];structures?:readonly AuthoredMesh[];
  spawn?:readonly number[];bounds?:{min:readonly number[];max:readonly number[]};
  house?:{center?:readonly number[];door?:readonly number[];floor1?:readonly number[];floor2?:readonly number[];metadata?:Record<string,unknown>};
  warehouse?:{center?:readonly number[];floor?:readonly number[];doors?:readonly {position:readonly number[]}[];metadata?:Record<string,unknown>};
  boundary?:{hardLimit:number;safetyMargin?:number};
  vegetation?:{prototypes:readonly AuthoredMesh[];instances:readonly {prototype:string;position:readonly number[];scale:readonly number[];rotation:number}[]};
  trail?:{path?:readonly (readonly number[])[];playable_end?:readonly number[]};
}

type Triangle={ax:number;az:number;ay:number;bx:number;bz:number;by:number;cx:number;cz:number;cy:number;den:number;slope:number;kind:number};
type Surface={height:number;slope:number;kind:number};
const CELL=12,COLLISION_CELL=16,STEP=.48;
const cellKey=(x:number,z:number,size=CELL)=>`${Math.floor(x/size)},${Math.floor(z/size)}`;

/** Source geometry has Blender X/Y horizontal and Z vertical. */
export const authoredPoint=(point:readonly number[])=>({x:point[0],y:point[2],z:-point[1]});

class TriangleIndex {
  readonly triangles:Triangle[]=[];
  private readonly cells=new Map<string,number[]>();
  add(mesh:AuthoredMesh,kind:number):void {
    const positions=mesh.positions,indices=mesh.indices;
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const ax=positions[a],az=-positions[a+1],ay=positions[a+2],bx=positions[b],bz=-positions[b+1],by=positions[b+2],cx=positions[c],cz=-positions[c+1],cy=positions[c+2];
      if(![ax,az,ay,bx,bz,by,cx,cz,cy].every(Number.isFinite))throw new Error(`Invalid authored triangle: ${mesh.name}`);
      const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(den)<1e-8)continue;
      const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      const slope=Math.hypot(nx,nz)/Math.abs(ny);
      // Undersides and near-vertical side faces never become a walking floor.
      if(kind!==2&&(ny<=0||slope>2.5))continue;
      const triangle:Triangle={ax,az,ay,bx,bz,by,cx,cz,cy,den,slope,kind},index=this.triangles.push(triangle)-1;
      const minX=Math.floor(Math.min(ax,bx,cx)/CELL),maxX=Math.floor(Math.max(ax,bx,cx)/CELL),minZ=Math.floor(Math.min(az,bz,cz)/CELL),maxZ=Math.floor(Math.max(az,bz,cz)/CELL);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
        const key=`${x},${z}`,cell=this.cells.get(key);if(cell)cell.push(index);else this.cells.set(key,[index]);
      }
    }
  }
  at(x:number,z:number):Surface[]{
    const result:Surface[]=[];
    for(const index of this.cells.get(cellKey(x,z))??[]){
      const t=this.triangles[index],u=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.den,v=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.den,w=1-u-v;
      if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)result.push({height:u*t.ay+v*t.by+w*t.cy,slope:t.slope,kind:t.kind});
    }
    return result;
  }
}

export class AuthoredMapPhysics {
  readonly data:AuthoredMapPhysicsData;
  readonly bounds:WorldBounds;
  readonly spawn={...AUTHORED_MAP_META.spawn};
  readonly area:AreaDefinition;
  readonly colliders:readonly Collider[];
  readonly stats:{terrainTriangles:number;walkingTriangles:number;waterTriangles:number;colliders:number};
  private readonly ground=new TriangleIndex();
  private readonly walking=new TriangleIndex();
  private readonly water=new TriangleIndex();
  private readonly colliderCells=new Map<string,Collider[]>();
  private readonly nearbyCache=new Map<string,readonly Collider[]>();

  constructor(data:AuthoredMapPhysicsData){
    this.data=data;
    const sourceBounds=data.bounds;
    this.bounds=sourceBounds?{minX:sourceBounds.min[0],maxX:sourceBounds.max[0],minZ:Math.max(-sourceBounds.max[1],-(data.boundary?.hardLimit??630)+(data.boundary?.safetyMargin??1.25)),maxZ:-sourceBounds.min[1]}:{...AUTHORED_MAP_META.bounds};
    for(const mesh of data.meshes){
      if(mesh.water)this.water.add(mesh,2);
      else if(/Terrain_Surface|Coastal_Cliffs/.test(mesh.name))this.ground.add(mesh,0);
    }
    for(const mesh of data.structures??[]){
      const name=mesh.name;
      const house=/StartHouse_(floor1|floor2|porch_deck|stairs)$/.test(name);
      const warehouse=/Warehouse \/ (Foundation|Mezzanine_Stairs|荒れた搬入口の小径)$/.test(name);
      const trail=/Trail \/ (木道と登山階段|土と高山の小径|山越えの展望デッキ|山道の岩混じり盛土)$/.test(name);
      if(house||warehouse||trail)this.walking.add(mesh,/StartHouse_floor2/.test(name)?3:/Mezzanine/.test(name)?4:1);
    }
    const collisions:Collider[]=[],dedup=new Set<string>();
    const addCollider=(collider:Collider)=>{
      const key=collider.type==='aabb'?[collider.minX,collider.maxX,collider.minZ,collider.maxZ,collider.minY,collider.maxY].map(v=>Math.round(v*100)).join(','):`${collider.x},${collider.z},${collider.radius}`;
      if(dedup.has(key))return;dedup.add(key);collisions.push(collider);
    };
    for(const mesh of data.structures??[]){
      // Route surfaces use their sampled top; tiny risers must remain step-able.
      if(/道標文字|小石|小岩|山道の岩混じり盛土|土と高山の小径|木道と登山階段|StartHouse_(roof|floor1|floor2)|Warehouse \/ (Broken_Roof|Floor_Markings)/.test(mesh.name))continue;
      const p=mesh.positions,ix=mesh.indices;
      for(let i=0;i<ix.length;i+=3){
        const points=[ix[i],ix[i+1],ix[i+2]].map(index=>authoredPoint(p.slice(index*3,index*3+3)));
        const [a,b,c]=points,ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);
        if(length<1e-8||Math.abs(ny)/length>.35)continue;
        const xs=points.map(v=>v.x),ys=points.map(v=>v.y),zs=points.map(v=>v.z),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),minZ=Math.min(...zs),maxZ=Math.max(...zs);
        // Timber siding is assembled from short horizontal boards; its narrow
        // vertical faces still form a solid wall around the authored openings.
        if(maxY-minY<.08)continue;
        const tag=`authored/${/Warehouse|Ruins|Metal/.test(mesh.name)?'metal':'wood'}/${mesh.name}`;
        // A long rotated rail cannot use its whole AABB: that would block the
        // diagonal walkway beside it. Subdivide its actual projected segment.
        if(Math.max(Math.abs(nx),Math.abs(nz))/length<.97){
          let from=a,to=b,span=Math.hypot(a.x-b.x,a.z-b.z);
          for(const [u,v]of [[a,c],[b,c]]){const distance=Math.hypot(u.x-v.x,u.z-v.z);if(distance>span){from=u;to=v;span=distance;}}
          if(span>.6){
            const pieces=Math.ceil(span/.28);
            for(let part=0;part<pieces;part++){
              const t=part/pieces,s=(part+1)/pieces,x0=from.x+(to.x-from.x)*t,z0=from.z+(to.z-from.z)*t,x1=from.x+(to.x-from.x)*s,z1=from.z+(to.z-from.z)*s;
              addCollider({type:'aabb',minX:Math.min(x0,x1)-.025,maxX:Math.max(x0,x1)+.025,minZ:Math.min(z0,z1)-.025,maxZ:Math.max(z0,z1)+.025,minY,maxY,tag});
            }
            continue;
          }
        }
        addCollider({type:'aabb',minX:minX-.025,maxX:maxX+.025,minZ:minZ-.025,maxZ:maxZ+.025,minY,maxY,tag});
      }
    }
    const prototypes=new Map(data.vegetation?.prototypes.map(p=>[p.name,p])??[]);
    for(const instance of data.vegetation?.instances??[]){
      if(!/pine|birch|spruce|tree|rock_large|boulder/i.test(instance.prototype))continue;
      const p=authoredPoint(instance.position),tree=/pine|birch|spruce|tree/i.test(instance.prototype),prototype=prototypes.get(instance.prototype);
      let height=tree?8:1.4,radius=tree?.24:.7;
      if(prototype){const ps=prototype.positions;let maxH=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<ps.length;i+=3){maxH=Math.max(maxH,ps[i+2]);minX=Math.min(minX,ps[i]);maxX=Math.max(maxX,ps[i]);minZ=Math.min(minZ,ps[i+1]);maxZ=Math.max(maxZ,ps[i+1]);}height=maxH*instance.scale[2];if(!tree)radius=Math.max(maxX-minX,maxZ-minZ)*Math.max(instance.scale[0],instance.scale[1])*.4;}
      if(!tree&&data.trail?.path?.length){
        let clearance=Infinity;for(const point of data.trail.path)clearance=Math.min(clearance,Math.hypot(p.x-point[0],p.z+point[1]));
        // A conservative circular rock proxy must not cover a clear authored trail.
        radius=Math.min(radius,Math.max(.25,clearance-1.1));
      }
      addCollider({type:'cylinder',x:p.x,z:p.z,radius:Math.max(.15,Math.min(3,radius)),minY:p.y,maxY:p.y+height,tag:`authored/${tree?'tree':'stone'}`});
    }
    addCollider({type:'aabb',minX:this.bounds.minX-10,maxX:this.bounds.maxX+10,minZ:this.bounds.minZ-2,maxZ:this.bounds.minZ-.02,minY:-100,maxY:1000,tag:'authored/fog-boundary'});
    this.colliders=collisions;
    for(const collider of collisions){
      const minX=collider.type==='aabb'?collider.minX:collider.x-collider.radius,maxX=collider.type==='aabb'?collider.maxX:collider.x+collider.radius,minZ=collider.type==='aabb'?collider.minZ:collider.z-collider.radius,maxZ=collider.type==='aabb'?collider.maxZ:collider.z+collider.radius;
      for(let x=Math.floor(minX/COLLISION_CELL);x<=Math.floor(maxX/COLLISION_CELL);x++)for(let z=Math.floor(minZ/COLLISION_CELL);z<=Math.floor(maxZ/COLLISION_CELL);z++){
        const key=`${x},${z}`,cell=this.colliderCells.get(key);if(cell)cell.push(collider);else this.colliderCells.set(key,[collider]);
      }
    }
    this.stats={terrainTriangles:this.ground.triangles.length,walkingTriangles:this.walking.triangles.length,waterTriangles:this.water.triangles.length,colliders:collisions.length};
    this.area=this.createArea();
    if(!this.isWalkable(this.spawn.x,this.spawn.z,this.spawn.y)||this.blockedAt(this.spawn.x,this.spawn.z,this.spawn.y))throw new Error('Authored house spawn is not walkable');
    this.spawn.y=this.heightAt(this.spawn.x,this.spawn.z,this.spawn.y);
  }

  private surfaceAt(x:number,z:number,referenceY?:number):Surface|null {
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    const grounds=this.ground.at(x,z);let ground:Surface|null=null;
    for(const surface of grounds)if(!ground||surface.height>ground.height)ground=surface;
    let chosen=ground;
    const ceiling=Number.isFinite(referenceY)?referenceY!+STEP:Infinity;
    for(const surface of this.walking.at(x,z)){
      if(surface.height>ceiling)continue;
      // Upper floors require an explicit current height, preventing ground-floor teleportation.
      if(surface.kind>=3&&!Number.isFinite(referenceY))continue;
      if(!chosen||surface.height>chosen.height)chosen=surface;
    }
    return chosen;
  }
  heightAt(x:number,z:number,referenceY?:number):number {return this.surfaceAt(x,z,referenceY)?.height??-1000;}
  slopeAt(x:number,z:number,referenceY?:number):number {return this.surfaceAt(x,z,referenceY)?.slope??Infinity;}
  inWater(x:number,z:number,referenceY?:number):boolean {
    const surface=this.surfaceAt(x,z,referenceY);if(!surface)return true;
    return this.water.at(x,z).some(water=>water.height>surface.height+.12);
  }
  isWalkable(x:number,z:number,referenceY?:number):boolean {
    if(x<this.bounds.minX+.4||x>this.bounds.maxX-.4||z<this.bounds.minZ+.35||z>this.bounds.maxZ-.4)return false;
    const surface=this.surfaceAt(x,z,referenceY);return !!surface&&surface.slope<=1.05&&!this.inWater(x,z,referenceY);
  }
  blockedAt(x:number,z:number,y:number,radius=.32,height=1.76):boolean {
    const minX=Math.floor((x-radius)/COLLISION_CELL),maxX=Math.floor((x+radius)/COLLISION_CELL),minZ=Math.floor((z-radius)/COLLISION_CELL),maxZ=Math.floor((z+radius)/COLLISION_CELL);
    for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++)for(const c of this.colliderCells.get(`${cx},${cz}`)??[]){
      if(y+height<=c.minY+.015||y+STEP>=c.maxY-.015)continue;
      if(c.type==='cylinder'){if(Math.hypot(x-c.x,z-c.z)<c.radius+radius)return true;}
      else {const nx=Math.max(c.minX,Math.min(c.maxX,x)),nz=Math.max(c.minZ,Math.min(c.maxZ,z));if(Math.hypot(x-nx,z-nz)<radius)return true;}
    }
    return false;
  }
  collidersNear(x:number,z:number,radius=32):readonly Collider[] {
    const rings=Math.max(1,Math.ceil(radius/COLLISION_CELL));
    const key=`${rings}/${cellKey(x,z,COLLISION_CELL)}`,cached=this.nearbyCache.get(key);if(cached)return cached;
    const cx=Math.floor(x/COLLISION_CELL),cz=Math.floor(z/COLLISION_CELL),result=new Set<Collider>();
    for(let dx=-rings;dx<=rings;dx++)for(let dz=-rings;dz<=rings;dz++)for(const collider of this.colliderCells.get(`${cx+dx},${cz+dz}`)??[])result.add(collider);
    const array=Array.from(result);if(this.nearbyCache.size>64)this.nearbyCache.clear();this.nearbyCache.set(key,array);return array;
  }
  private createArea():AreaDefinition {
    const source=getAreaDefinition('shiretoko'),meta=AUTHORED_MAP_META;
    const point=(id:string,type:Landmark['type'],position:{x:number;z:number},radius:number):Landmark=>({id,type,position:{x:position.x,z:position.z},radius,provisional:true});
    const route=(this.data.trail?.path??[]).filter((_,i)=>i%20===0).map(v=>({x:v[0],z:-v[1],height:v[2]}));
    return {...source,bounds:this.bounds,spawn:this.spawn,route,landmarks:[point('cabin','cabin',meta.houseCenter,15),point('cabin-spawn','bed',meta.spawn,2),point('radio','radio',meta.radio,2.4),point('cabin-door','door',meta.door,3),point('drone','drone',meta.drone,12),point(meta.checkpoint.id,'checkpoint',meta.checkpoint,7),point(meta.exit.id,'exit',meta.exit,7),point('lake','lake',{x:25,z:-195},40),point('boardwalk','boardwalk',{x:-20,z:258},5)],exitTriggers:[{id:meta.exit.id,position:{x:meta.exit.x,z:meta.exit.z},radius:7,targetAreaId:'ishikari-mountains',provisional:true}],assetRefs:['home-map/shiretoko.html']};
  }
}

export function createAuthoredMapPhysics(data:AuthoredMapPhysicsData):AuthoredMapPhysics{return new AuthoredMapPhysics(data);}
