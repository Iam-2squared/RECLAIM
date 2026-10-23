import * as T from 'three';
import {ShiretokoTerrain,coastDistance,routeSample} from './terrain.ts';

/** Original, opt-in headland cabin in the standalone 2400m review.
 * Floor and stair heights are queried from the SAME rectangles drawn in 3D.
 * No imported assets, gameplay state, campaign spawn or save access.
 */
export type CabinReview = Readonly<{
  group: T.Group;
  floorY: number;
  heightAt: (x:number,z:number)=>number|null;
  blockedAt: (x:number,z:number)=>boolean;
  stairs: number;
  parts: number;
  supports: number;
  entrance: Readonly<{x:number;z:number}>;
}>;
const X=-100, Z=835, WIDTH=18, DEPTH=14, WALL=.34;
const DOOR_HALF=1.15, PERSON=.23;
export function createCliffCabinReview(terrain: ShiretokoTerrain): CabinReview {
  const left=X-WIDTH/2,right=X+WIDTH/2,back=Z-DEPTH/2,front=Z+DEPTH/2;
  const samples=[[left,back],[left,front],[right,back],[right,front],[X,Z],
    [right+9,Z],[right+5,Z]] as const;
  // The previous footprint spanned 16.6m of vertical cliff relief. Ground
  // height and the shoreline are sampled from the actual immutable 5m terrain.
  const footprint=[[left,back],[left,front],[right,back],[right,front],[X,Z]] as const;
  const sampled=footprint.map(([x,z])=>terrain.heightAt(x,z));
  if(Math.max(...sampled)-Math.min(...sampled)>2.0 ||
     footprint.some(([x,z])=>terrain.inWater(x,z) ||
     coastDistance(x,z)<45 || routeSample(x,z).distance<20))
    throw new RangeError('Cabin requires stable inland headland footing and route clearance');
  const floorY=Math.max(...samples.map(([x,z])=>terrain.heightAt(x,z)))+.38;
  const outsideX=right+9, outsideGround=terrain.heightAt(outsideX,Z);
  const rise=floorY-outsideGround;
  const stairs=Math.max(3,Math.ceil(rise/.26));
  if(stairs>36)throw new RangeError('Cliff cabin stairs exceed compact site budget');
  const run=9/stairs, stairTop=(i:number)=>outsideGround+rise*(i+1)/stairs;
  const group=new T.Group();group.name='review / enterable cliff headland cabin';
  const mats={
    wood:new T.MeshLambertMaterial({color:0x755c43}),
    trim:new T.MeshLambertMaterial({color:0x382f29}),
    wall:new T.MeshLambertMaterial({color:0xaaa78e}),
    stone:new T.MeshLambertMaterial({color:0x585c59}),
    roof:new T.MeshLambertMaterial({color:0x3b5055,side:T.DoubleSide}),
    glass:new T.MeshBasicMaterial({color:0xb2d5dc,transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide}),
    stair:new T.MeshLambertMaterial({color:0x92775c}),
    cloth:new T.MeshLambertMaterial({color:0x8d9280}),
  };
  const cache=new Map<string,T.BoxGeometry>();
  let parts=0;
  function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,material:T.Material){
    const key=[w,h,d].join('/');
    let geometry=cache.get(key);if(!geometry){geometry=new T.BoxGeometry(w,h,d);cache.set(key,geometry);}
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,y,z);group.add(mesh);parts++;
    return mesh;
  }
  // The walkable rectangle matches the visible timber top; the lower stone
  // plinth stays underneath and cannot overwrite the walking Y coordinate.
  box('cabin / real wooden floor',X,floorY-.13,Z,WIDTH,.26,DEPTH,mats.wood);
  box('cabin / stone foundation',X,floorY-.78,Z,WIDTH,1.05,DEPTH,mats.stone);
  const pierSites=[
    [left+1,back+1],[X,back+1],[right-1,back+1],
    [left+1,front-1],[X,front-1],[right-1,front-1],
    [left+1,Z],[right-1,Z],
  ] as const;
  for(const [px,pz] of pierSites){
    const foundation=terrain.heightAt(px,pz),height=floorY-.12-foundation;
    if(!(height>.1 && height<3))
      throw new RangeError('Foundation pier must connect house and real 5m ground');
    box('cabin / terrain foundation pier',px,foundation+height/2,pz,.68,height,.68,mats.stone);
  }
  const wallTop=floorY+3.25;
  box('cabin / west wall',left+WALL/2,floorY+1.625,Z,WALL,3.25,DEPTH,mats.wall);
  box('cabin / north wall',X,floorY+1.625,back+WALL/2,WIDTH,3.25,WALL,mats.wall);
  box('cabin / south wall',X,floorY+1.625,front-WALL/2,WIDTH,3.25,WALL,mats.wall);
  const sideDepth=(DEPTH-2*DOOR_HALF)/2;
  box('cabin / door north pier',right-WALL/2,floorY+1.625,back+sideDepth/2,WALL,3.25,sideDepth,mats.wall);
  box('cabin / door south pier',right-WALL/2,floorY+1.625,front-sideDepth/2,WALL,3.25,sideDepth,mats.wall);
  box('cabin / doorway lintel',right-WALL/2,floorY+2.87,Z,WALL,.76,DOOR_HALF*2,mats.trim);
  // A physically open door faces east towards the headland arrival location.
  box('cabin / threshold',right+.25,floorY-.08,Z,.5,.16,2.45,mats.wood);
  // Porch has exactly the same foot height as the interior; the stair treads
  // meet it directly with a bounded <=0.26m final riser.
  box('cabin / door porch',right+.64,floorY-.13,Z,1.28,.26,2.7,mats.wood);
  for(let i=0;i<stairs;i++){
    const x=outsideX-(i+.5)*run;
    const top=stairTop(i);
    box('cabin / tread '+i,x,top-.09,Z,run,.18,2.3,mats.stair);
    const supportHeight=Math.max(.1,top-terrain.heightAt(x,Z));
    box('cabin / stair support '+i,x,top-supportHeight/2,Z,Math.min(run,.18),supportHeight,.17,mats.trim);
  }
  // Roof: true pitched triangles, not a box silhouette. Its interior leaves
  // sufficient headroom for the 1.68m walker eye height.
  const eave=wallTop+.16,peak=wallTop+2.3;
  const ridgeX=X;
  for(const side of [-1,1]){
    const edgeX=X+side*(WIDTH/2+1), zz=DEPTH/2+1;
    const vertices=[ridgeX,peak,Z-zz, edgeX,eave,Z-zz,
                    ridgeX,peak,Z+zz, edgeX,eave,Z+zz];
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setIndex([0,1,2,2,1,3]);geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,mats.roof);
    mesh.name=side<0?'cabin / west pitched roof':'cabin / east pitched roof';
    group.add(mesh);parts++;
  }
  // Weatherproof gables; a simple chimney, two framed windows and furnishing.
  for(const z of [back,front]){
    const geometry=new T.BufferGeometry();
    const v=[left,wallTop,z,right,wallTop,z,X,peak,z];
    geometry.setAttribute('position',new T.Float32BufferAttribute(v,3));
    geometry.setIndex([0,1,2]);geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,new T.MeshLambertMaterial({color:0x827665,side:T.DoubleSide}));
    mesh.name='cabin / pitched gable';group.add(mesh);parts++;
  }
  box('cabin / stone chimney',X-4,wallTop+1.4,Z-3.8,1.25,3.1,1.3,mats.stone);
  for(const z of [back-.027,front+.027]){
    box('cabin / glazed window',X-4,floorY+1.86,z,3.0,1.32,.09,mats.glass);
    box('cabin / window top',X-4,floorY+2.56,z,3.25,.13,.17,mats.trim);
    box('cabin / window sill',X-4,floorY+1.15,z,3.25,.15,.25,mats.trim);
  }
  // Furniture has explicit footprint collision below. The room is navigable:
  // the centerline from entrance to the opposite interior wall stays clear.
  box('cabin / table',X-2,floorY+.83,Z+3,2.1,.19,1.45,mats.wood);
  for(const xx of [X-2.84,X-1.16])for(const zz of [Z+2.45,Z+3.55])
    box('cabin / table leg',xx,floorY+.38,zz,.16,.74,.16,mats.trim);
  box('cabin / bunk base',X-5.3,floorY+.42,Z-3.4,2.7,.48,4.05,mats.wood);
  box('cabin / mattress',X-5.3,floorY+.78,Z-3.4,2.5,.25,3.8,mats.cloth);
  box('cabin / shelf',X+3,floorY+1.28,Z-5.15,3,.13,.7,mats.wood);

  const heightAt=(x:number,z:number):number|null=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    if(x>=left&&x<=right+.04&&z>=back&&z<=front)return floorY;
    if(x>right&&x<=outsideX&&Math.abs(z-Z)<=1.15){
      const i=Math.min(stairs-1,Math.max(0,Math.floor((outsideX-x)/run)));
      return stairTop(i);
    }
    return null;
  };
  const rect=(x:number,z:number,cx:number,cz:number,wx:number,wz:number)=>
    Math.abs(x-cx)<=wx/2+PERSON&&Math.abs(z-cz)<=wz/2+PERSON;
  const blockedAt=(x:number,z:number):boolean=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))return true;
    const west=rect(x,z,left+WALL/2,Z,WALL,DEPTH);
    const north=rect(x,z,X,back+WALL/2,WIDTH,WALL);
    const south=rect(x,z,X,front-WALL/2,WIDTH,WALL);
    const east=rect(x,z,right-WALL/2,back+sideDepth/2,WALL,sideDepth)||
      rect(x,z,right-WALL/2,front-sideDepth/2,WALL,sideDepth);
    const table=rect(x,z,X-2,Z+3,2.1,1.45);
    const bunk=rect(x,z,X-5.3,Z-3.4,2.7,4.05);
    return west||north||south||east||table||bunk;
  };
  return {group,floorY,heightAt,blockedAt,stairs,parts,supports:pierSites.length,entrance:{x:right+1.7,z:Z}};
}
