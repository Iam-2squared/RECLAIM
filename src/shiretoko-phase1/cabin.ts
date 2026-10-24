import * as T from 'three';
import {ShiretokoTerrain,coastDistance,routeSample} from './terrain.ts';
import {CABIN_SITE} from './cabin-site.ts';

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
const {x:X,z:Z,width:WIDTH,depth:DEPTH}=CABIN_SITE;
const WALL=.34;
const DOOR_HALF=1.15, PERSON=.23;
export function createCliffCabinReview(terrain: ShiretokoTerrain): CabinReview {
  const left=X-WIDTH/2,right=X+WIDTH/2,back=Z-DEPTH/2,front=Z+DEPTH/2;
  // Foundation sites participate in the same true 5m terrain survey used
  // to set the walkable floor. Sampling only outer corners allowed a high
  // interior pier to intersect the floor underside by 1mm (CI regression).
  const pierSites=[
    [left+1,back+1],[X,back+1],[right-1,back+1],
    [left+1,front-1],[X,front-1],[right-1,front-1],
    [left+1,Z],[right-1,Z],
  ] as const;
  const samples=[[left,back],[left,front],[right,back],[right,front],[X,Z],
    [right+9,Z],[right+5,Z],...pierSites] as const;
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
    iron:new T.MeshLambertMaterial({color:0x343b3b}),
    ember:new T.MeshLambertMaterial({color:0xa45a37}),
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
  for(const [px,pz] of pierSites){
    const foundation=terrain.heightAt(px,pz),height=floorY-.12-foundation;
    if(!(height>.1 && height<3))
      throw new RangeError('Foundation pier must connect house and real 5m ground');
    box('cabin / terrain foundation pier',px,foundation+height/2,pz,.68,height,.68,mats.stone);
  }
  const wallTop=floorY+3.25;
  box('cabin / west wall',left+WALL/2,floorY+1.625,Z,WALL,3.25,DEPTH,mats.wall);
  // The two glazed windows are apertures in the actual opaque walls, not
  // translucent decals in front of solid plaster. Keep a full 1.20m sill
  // below each opening: the waist-high window never becomes a second door.
  const WINDOW_X=X-4, WINDOW_W=3, WINDOW_BASE=1.2, WINDOW_TOP=2.52;
  const westSpan=WINDOW_X-WINDOW_W/2-left;
  const eastSpan=right-(WINDOW_X+WINDOW_W/2);
  for(const [side,wallZ] of [['north',back+WALL/2],['south',front-WALL/2]] as const){
    box('cabin / '+side+' wall west of window',left+westSpan/2,floorY+1.625,wallZ,
      westSpan,3.25,WALL,mats.wall);
    box('cabin / '+side+' wall east of window',right-eastSpan/2,floorY+1.625,wallZ,
      eastSpan,3.25,WALL,mats.wall);
    box('cabin / '+side+' wall below window',WINDOW_X,floorY+WINDOW_BASE/2,wallZ,
      WINDOW_W,WINDOW_BASE,WALL,mats.wall);
    box('cabin / '+side+' wall above window',WINDOW_X,floorY+(WINDOW_TOP+3.25)/2,wallZ,
      WINDOW_W,3.25-WINDOW_TOP,WALL,mats.wall);
  }
  const sideDepth=(DEPTH-2*DOOR_HALF)/2;
  box('cabin / door north pier',right-WALL/2,floorY+1.625,back+sideDepth/2,WALL,3.25,sideDepth,mats.wall);
  box('cabin / door south pier',right-WALL/2,floorY+1.625,front-sideDepth/2,WALL,3.25,sideDepth,mats.wall);
  box('cabin / doorway lintel',right-WALL/2,floorY+2.87,Z,WALL,.76,DOOR_HALF*2,mats.trim);
  // A physically open door faces east towards the headland arrival location.
  box('cabin / threshold',right+.25,floorY-.08,Z,.5,.16,2.45,mats.wood);
  // Porch has exactly the same foot height as the interior; the stair treads
  // meet it directly with a bounded <=0.26m final riser.
  box('cabin / door porch',right+.64,floorY-.13,Z,1.28,.26,2.7,mats.wood);
  const stairCenters:{x:number;top:number}[]=[];
  for(let i=0;i<stairs;i++){
    const x=outsideX-(i+.5)*run;
    const top=stairTop(i);
    stairCenters.push({x,top});
    box('cabin / tread '+i,x,top-.09,Z,run,.18,2.3,mats.stair);
    const supportHeight=Math.max(.1,top-terrain.heightAt(x,Z));
    box('cabin / stair support '+i,x,top-supportHeight/2,Z,Math.min(run,.18),supportHeight,.17,mats.trim);
  }
  // Weathered timber handrails outside the 2.3m stair walking width.
  // Eight equal-size posts use one real InstancedMesh (one draw call), rather
  // than one independent mesh/draw call per post on software WebGL.
  const first=stairCenters[0],last=stairCenters[stairs-1];
  const centerX=(first.x+last.x)/2,centerTop=(first.top+last.top)/2;
  const slope=Math.atan2(last.top-first.top,last.x-first.x);
  const length=Math.hypot(last.x-first.x,last.top-first.top)+run;
  const posts=new T.InstancedMesh(new T.BoxGeometry(.16,1.06,.16),mats.trim,stairs*2);
  posts.name='cabin / stair rail posts / instanced';
  posts.frustumCulled=false;
  const transform=new T.Matrix4();
  let post=0;
  for(const side of [-1,1] as const) {
    const railZ=Z+side*(DOOR_HALF+.22);
    const stringer=box('cabin / stair stringer '+side,centerX,centerTop-.18,railZ,
      length,.22,.18,mats.trim);
    stringer.rotation.z=slope;
    const handrail=box('cabin / timber handrail '+side,centerX,centerTop+.87,railZ,
      length,.16,.16,mats.wood);
    handrail.rotation.z=slope;
    for(const step of stairCenters){
      transform.makeTranslation(step.x,step.top+.35,railZ);
      posts.setMatrixAt(post++,transform);
    }
  }
  posts.instanceMatrix.needsUpdate=true;
  group.add(posts);parts+=post;
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
  // Shallow metal standing seams rest on BOTH real roof triangles, with
  // the ridge cap and drip edges in one instanced draw group. No new textures,
  // extra physical floors or changes to the existing walkable cabin.
  const roofHalf=WIDTH/2+1,roofSpan=DEPTH+2;
  const roofPitch=Math.atan2(peak-eave,roofHalf);
  const ribMatrices:T.Matrix4[]=[],ribColours:number[]=[];
  const seamColours=[0x70898a,0x5b777a,0x80908a,0x617779];
  const roofRibLength=Math.hypot(roofHalf,peak-eave);
  for(const side of [-1,1] as const){
    const angle=-side*roofPitch;
    const angleQ=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle);
    // The lower half of the rib intersects the slope; none can float.
    for(let i=0;i<15;i++){
      const z=Z-roofSpan/2+.3+(roofSpan-.6)*i/14;
      const centre=new T.Vector3(
        X+side*roofHalf/2-Math.sin(angle)*.039,
        (peak+eave)/2+Math.cos(angle)*.039,z);
      ribMatrices.push(new T.Matrix4().compose(
        centre,angleQ,new T.Vector3(roofRibLength,.08,.12)));
      ribColours.push(seamColours[(i+side+3)%seamColours.length]);
    }
  }
  const alongRidge=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
  ribMatrices.push(new T.Matrix4().compose(
    new T.Vector3(X,peak+.055,Z),alongRidge,new T.Vector3(roofSpan,.11,.28)));
  ribColours.push(0x87908b);
  for(const side of [-1,1] as const){
    ribMatrices.push(new T.Matrix4().compose(
      new T.Vector3(X+side*roofHalf,eave+.037,Z),
      alongRidge,new T.Vector3(roofSpan,.08,.15)));
    ribColours.push(0x647a7a);
  }
  const roofSeams=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),ribMatrices.length);
  roofSeams.name='cabin / standing seam metal roof / instanced';
  for(let i=0;i<ribMatrices.length;i++){
    roofSeams.setMatrixAt(i,ribMatrices[i]);
    roofSeams.setColorAt(i,new T.Color(ribColours[i]));
  }
  roofSeams.instanceMatrix.needsUpdate=true;
  if(roofSeams.instanceColor)roofSeams.instanceColor.needsUpdate=true;
  roofSeams.computeBoundingSphere();
  group.add(roofSeams);parts++;

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
    box('cabin / glazed window',WINDOW_X,floorY+1.86,z,WINDOW_W,1.32,.09,mats.glass);
    box('cabin / window top',WINDOW_X,floorY+2.56,z,3.25,.13,.17,mats.trim);
    box('cabin / window sill',WINDOW_X,floorY+1.15,z,3.25,.15,.25,mats.trim);
    for(const side of [-1,1])box('cabin / window jamb',WINDOW_X+side*WINDOW_W/2,
      floorY+1.86,z,.13,1.45,.17,mats.trim);
  }
  // One low-cost carpentry batch frames the *existing* east doorway and
  // the two genuine glazed openings. All members touch real existing frames:
  // no closed door leaf, invisible wall, new texture or changed walker height.
  const joineryParts:{center:T.Vector3;size:T.Vector3}[]=[];
  for(const side of [-1,1] as const)
    joineryParts.push({center:new T.Vector3(right+.035,floorY+1.27,Z+side*DOOR_HALF),
      size:new T.Vector3(.14,2.54,.15)});
  for(const z of [back-.027,front+.027]) {
    for(const dx of [-WINDOW_W/3,WINDOW_W/3])
      joineryParts.push({center:new T.Vector3(WINDOW_X+dx,floorY+1.86,z),
        size:new T.Vector3(.115,1.27,.115)});
    joineryParts.push({center:new T.Vector3(WINDOW_X,floorY+2.25,z),
      size:new T.Vector3(WINDOW_W,.095,.115)});
  }
  const joinery=new T.InstancedMesh(new T.BoxGeometry(1,1,1),mats.trim,joineryParts.length);
  joinery.name='cabin / visible door and window joinery / instanced';
  for(let i=0;i<joineryParts.length;i++){
    const {center,size}=joineryParts[i];
    joinery.setMatrixAt(i,new T.Matrix4().compose(center,new T.Quaternion(),size));
  }
  joinery.instanceMatrix.needsUpdate=true;
  joinery.computeBoundingSphere();
  group.add(joinery);parts++;

  // Furniture has explicit footprint collision below. The room is navigable:
  // the centerline from entrance to the opposite interior wall stays clear.
  box('cabin / table',X-2,floorY+.83,Z+3,2.1,.19,1.45,mats.wood);
  for(const xx of [X-2.84,X-1.16])for(const zz of [Z+2.45,Z+3.55])
    box('cabin / table leg',xx,floorY+.38,zz,.16,.74,.16,mats.trim);
  box('cabin / bunk base',X-5.3,floorY+.42,Z-3.4,2.7,.48,4.05,mats.wood);
  box('cabin / mattress',X-5.3,floorY+.78,Z-3.4,2.5,.25,3.8,mats.cloth);
  box('cabin / shelf',X+3,floorY+1.28,Z-5.15,3,.13,.7,mats.wood);

  // The headland shelter gains a small real iron stove beside the north wall.
  // Its hearth is a true grounded solid: the same footprint is returned by
  // blockedAt, while the westward interior path and east door remain open.
  // The flue terminates just below the ACTUAL pitched roof surface, rather
  // than visually passing through or floating above the roof.
  const stoveX=X-2.5,stoveZ=Z-4.8;
  box('cabin / stone stove hearth',stoveX,floorY+.05,stoveZ,1.9,.10,1.65,mats.stone);
  box('cabin / iron stove body',stoveX,floorY+.66,stoveZ,1.1,1.1,1,mats.iron);
  box('cabin / iron stove top',stoveX,floorY+1.25,stoveZ,1.24,.12,1.14,mats.iron);
  box('cabin / stove firebox door',stoveX+.57,floorY+.66,stoveZ,.055,.70,.73,mats.trim);
  box('cabin / firebox glass',stoveX+.602,floorY+.66,stoveZ,.025,.37,.42,mats.ember);
  const stoveRoofY=peak-(peak-eave)*Math.abs(stoveX-X)/(WIDTH/2+1);
  const flueBottom=floorY+1.31,flueTop=stoveRoofY-.05;
  if(flueTop<=flueBottom)throw new RangeError('Stove flue cannot reach pitched roof');
  box('cabin / roof-contact stove flue',stoveX,(flueBottom+flueTop)/2,stoveZ,
    .25,flueTop-flueBottom,.25,mats.iron);

  // The exterior uses one shared, instance-coloured cedar clapboard batch,
  // instead of dozens of individual draw calls. Each strip is placed only
  // over an EXISTING opaque wall box, so the north/south actual openings
  // remain open. East doorway, 2D physical walls and save logic are unchanged.
  const exteriorSections=group.children.filter((object):object is T.Mesh<T.BoxGeometry,T.Material>=>
    object instanceof T.Mesh && object.material===mats.wall);
  const sidingMatrices:T.Matrix4[]=[];
  const rotateAlongZ=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
  const rotateAlongX=new T.Quaternion();
  for(const section of exteriorSections){
    const {width,height,depth}=(section.geometry as T.BoxGeometry).parameters;
    const horizontal=width>depth;
    const length=horizontal?width:depth;
    const rows=Math.max(1,Math.floor(height/.44));
    const pitch=height/rows;
    // The east entrance is a genuine void between the two door-pier boxes.
    const outward=section.name.startsWith('cabin / south wall') ||
      section.name.startsWith('cabin / door ') ? 1 : -1;
    for(let i=0;i<rows;i++){
      const position=section.position.clone();
      position.y+=-height/2+(i+.5)*pitch;
      if(horizontal)position.z+=outward*(WALL/2+.043);
      else position.x+=outward*(WALL/2+.043);
      sidingMatrices.push(new T.Matrix4().compose(position,
        horizontal?rotateAlongX:rotateAlongZ,new T.Vector3(length,1,1)));
    }
  }
  const siding=new T.InstancedMesh(new T.BoxGeometry(1,.34,.055),
    new T.MeshLambertMaterial({color:0xffffff}),sidingMatrices.length);
  siding.name='cabin / cedar cladding / instanced';
  const cedarColours=[0x836e59,0x927d65,0x786754,0x9b8268,0x88725b];
  for(let i=0;i<sidingMatrices.length;i++){
    siding.setMatrixAt(i,sidingMatrices[i]);
    siding.setColorAt(i,new T.Color(cedarColours[(i*3+Math.floor(i/7))%cedarColours.length]));
  }
  siding.instanceMatrix.needsUpdate=true;
  if(siding.instanceColor)siding.instanceColor.needsUpdate=true;
  siding.computeBoundingSphere();
  group.add(siding);parts++;

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
    const stove=rect(x,z,stoveX,stoveZ,1.9,1.65);
    // Guardrails are solid at the stair edges; never obstruct the centerline.
    const rail=x>=right+.25&&x<=outsideX&&
      Math.abs(z-Z)>=DOOR_HALF-.09&&Math.abs(z-Z)<=DOOR_HALF+.45;
    return west||north||south||east||table||bunk||stove||rail;
  };
  return {group,floorY,heightAt,blockedAt,stairs,parts,supports:pierSites.length,entrance:{x:right+1.7,z:Z}};
}
