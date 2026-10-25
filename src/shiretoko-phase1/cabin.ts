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
  // Cedar gable structural trusses are actual timber volumes attached to
  // BOTH original triangular north/south walls, not painted roof lines.
  // Full sloping rafters, a tie beam, a king post and two short secondary
  // uprights make the previously blank 18m gable legible from the trail.
  // All 12 members sit ABOVE the 3.25m wall height, away from the glazed
  // eye-level sightlines and open eastern stair entrance. One bounded,
  // colour-instanced draw group; no new colliders, floor or game save writes.
  const gableTimbers:{matrix:T.Matrix4;color:number}[]=[];
  const gableColours=[0x876a4d,0x9a7955,0x78573f,0xa18460,0x6d523b,0x8c6b4f];
  const upX=new T.Vector3(1,0,0);
  const gableTimber=(ax:number,ay:number,bx:number,by:number,z:number,
    width:number,color:number)=>{
    const a=new T.Vector3(ax,ay,z),b=new T.Vector3(bx,by,z);
    const vector=b.clone().sub(a),length=vector.length();
    if(!(length>.1))throw new RangeError('Cabin gable timber must span real wall');
    const rotation=new T.Quaternion().setFromUnitVectors(upX,vector.multiplyScalar(1/length));
    gableTimbers.push({matrix:new T.Matrix4().compose(a.add(b).multiplyScalar(.5),
      rotation,new T.Vector3(length,width,.17)),color});
  };
  for(const [side,z] of [[-1,back-.13],[1,front+.13]] as const){
    const offset=side<0?0:1;
    // Every endpoint follows the true triangular wall silhouette. The
    // shallow overlaps deliberately join rafters, tie and uprights in 3D.
    gableTimber(left,wallTop+.06,X,peak+.06,z,.19,gableColours[offset]);
    gableTimber(X,peak+.06,right,wallTop+.06,z,.19,gableColours[2+offset]);
    gableTimber(left,wallTop+.14,right,wallTop+.14,z,.19,gableColours[1+offset]);
    gableTimber(X,wallTop+.14,X,peak-.03,z,.14,gableColours[3+offset]);
    for(const direction of [-1,1] as const){
      const x=X+direction*WIDTH*.24;
      const roofY=wallTop+(peak-wallTop)*(1-Math.abs(x-X)/(WIDTH/2));
      gableTimber(x,wallTop+.13,x,roofY+.035,z,.13,
        gableColours[direction<0?4:5]);
    }
  }
  const gableFrames=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),gableTimbers.length);
  gableFrames.name='cabin / both roof-connected cedar gable structural trusses / instanced';
  for(let i=0;i<gableTimbers.length;i++){
    gableFrames.setMatrixAt(i,gableTimbers[i].matrix);
    gableFrames.setColorAt(i,new T.Color(gableTimbers[i].color));
  }
  gableFrames.instanceMatrix.needsUpdate=true;
  if(gableFrames.instanceColor)gableFrames.instanceColor.needsUpdate=true;
  gableFrames.computeBoundingSphere();
  group.add(gableFrames);parts++;

  // Five visible interior cedar roof frames sit immediately below the REAL
  // pitched ceiling, without adding a false flat roof or blocking the room.
  // Each sloping rafter meets its wall-supported tie; the long ridge purlin
  // follows the original ridge. Sixteen pieces share ONE colour-instanced
  // GPU draw group, with no new textures, physical floors or save state.
  const insideFrames:{matrix:T.Matrix4;color:number}[]=[];
  const roofInsideAt=(x:number)=>peak-(peak-eave)*Math.abs(x-X)/roofHalf;
  const beamAxis=new T.Vector3(1,0,0);
  const addInsideBeam=(a:T.Vector3,b:T.Vector3,height:number,depth:number,color:number)=>{
    const delta=b.clone().sub(a),length=delta.length();
    if(!(length>.2))throw new RangeError('Interior cedar beam has no span');
    const angle=new T.Quaternion().setFromUnitVectors(beamAxis,delta.multiplyScalar(1/length));
    insideFrames.push({matrix:new T.Matrix4().compose(
      a.clone().add(b).multiplyScalar(.5),angle,new T.Vector3(length,height,depth)),color});
  };
  for(let i=0;i<5;i++){
    const z=back+.95+(DEPTH-1.9)*i/4;
    for(const side of [-1,1] as const){
      const xa=X+side*.14,xb=X+side*(WIDTH/2-.20);
      addInsideBeam(
        new T.Vector3(xa,roofInsideAt(xa)-.10,z),
        new T.Vector3(xb,roofInsideAt(xb)-.10,z),
        .22,.20,i%2?0x947558:0x86684e);
    }
    addInsideBeam(
      new T.Vector3(left+.25,wallTop+.22,z),
      new T.Vector3(right-.25,wallTop+.22,z),
      .18,.18,i%2?0x76573f:0x866345);
  }
  addInsideBeam(new T.Vector3(X,peak-.11,back+.30),
    new T.Vector3(X,peak-.11,front-.30),.22,.20,0xa0825d);
  const roofFrames=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),insideFrames.length);
  roofFrames.name='cabin / interior roof-contact cedar rafters and ties / instanced';
  for(let i=0;i<insideFrames.length;i++){
    roofFrames.setMatrixAt(i,insideFrames[i].matrix);
    roofFrames.setColorAt(i,new T.Color(insideFrames[i].color));
  }
  roofFrames.instanceMatrix.needsUpdate=true;
  if(roofFrames.instanceColor)roofFrames.instanceColor.needsUpdate=true;
  roofFrames.computeBoundingSphere();group.add(roofFrames);parts++;

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


  // Twin entry lanterns make the real east doorway legible from the stair
  // approach. Frames physically join the existing opaque door-pier walls;
  // amber panes are true visible geometry, not an overlay or an actual game
  // light source. Both hang above the walker eye, outside the doorway and
  // stair guard corridor. Two instanced groups, no textures or save state.
  const lanternIronTransforms:T.Matrix4[]=[];
  const lanternGlassTransforms:T.Matrix4[]=[];
  const lanternRotation=new T.Quaternion();
  const lanternBox=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
    lanternIronTransforms.push(new T.Matrix4().compose(
      new T.Vector3(x,y,z),lanternRotation,new T.Vector3(w,h,d)));
  };
  for(const side of [-1,1] as const){
    const dz=Z+side*(DOOR_HALF+.65);
    const lx=right+.48,ly=floorY+2.14;
    // The bracket overlaps BOTH the existing east wall and the metal cap.
    lanternBox(right+.20,ly+.28,dz,.44,.075,.12);
    lanternBox(lx,ly+.31,dz,.46,.10,.46);
    lanternBox(lx,ly-.31,dz,.46,.10,.46);
    for(const dx of [-.19,.19])for(const offsetZ of [-.19,.19])
      lanternBox(lx+dx,ly,dz+offsetZ,.065,.52,.065);
    lanternGlassTransforms.push(new T.Matrix4().compose(
      new T.Vector3(lx,ly,dz),lanternRotation,new T.Vector3(.33,.49,.33)));
  }
  const lanternFrames=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    mats.iron,lanternIronTransforms.length);
  lanternFrames.name='cabin / two connected exterior lantern housings / instanced';
  for(let i=0;i<lanternIronTransforms.length;i++)
    lanternFrames.setMatrixAt(i,lanternIronTransforms[i]);
  lanternFrames.instanceMatrix.needsUpdate=true;
  lanternFrames.computeBoundingSphere();
  group.add(lanternFrames);parts++;
  const lanternGlass=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshBasicMaterial({color:0xffcb79,transparent:true,opacity:.87,depthWrite:false}),
    lanternGlassTransforms.length);
  lanternGlass.name='cabin / two warm entry lantern panes / instanced';
  for(let i=0;i<lanternGlassTransforms.length;i++)
    lanternGlass.setMatrixAt(i,lanternGlassTransforms[i]);
  lanternGlass.instanceMatrix.needsUpdate=true;
  lanternGlass.computeBoundingSphere();
  group.add(lanternGlass);parts++;

  // The existing two transparent north/south windows gain outward-folded
  // cedar shutters. They stay on opaque wall either side of each genuine
  // aperture; the centre sightline, sill collider and campaign remain intact.
  // Panels and twelve battens share ONE instanced box/material draw group.
  const shutterParts:{center:T.Vector3;size:T.Vector3;color:number}[]=[];
  for(const wallZ of [back,front]){
    const outward=wallZ===back?-1:1;
    const faceZ=wallZ+outward*.17;
    for(const side of [-1,1] as const){
      const cx=WINDOW_X+side*(WINDOW_W/2+.52);
      shutterParts.push({center:new T.Vector3(cx,floorY+1.86,faceZ),
        size:new T.Vector3(.76,1.22,.09),color:0x69543c});
      for(const offset of [-.40,.40]){
        shutterParts.push({center:new T.Vector3(cx,floorY+1.86+offset,faceZ+outward*.075),
          size:new T.Vector3(.72,.095,.10),color:0x957653});
      }
      shutterParts.push({center:new T.Vector3(cx,floorY+1.86,faceZ+outward*.075),
        size:new T.Vector3(.10,1.04,.10),color:0x856b4b});
    }
  }
  const shutters=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),shutterParts.length);
  shutters.name='cabin / folded cedar window shutters / instanced';
  for(let i=0;i<shutterParts.length;i++){
    const {center,size,color}=shutterParts[i];
    shutters.setMatrixAt(i,new T.Matrix4().compose(center,new T.Quaternion(),size));
    shutters.setColorAt(i,new T.Color(color));
  }
  shutters.instanceMatrix.needsUpdate=true;
  if(shutters.instanceColor)shutters.instanceColor.needsUpdate=true;
  shutters.computeBoundingSphere();
  group.add(shutters);parts++;

  // Furniture has explicit footprint collision below. The room is navigable:
  // the centerline from entrance to the opposite interior wall stays clear.
  box('cabin / table',X-2,floorY+.83,Z+3,2.1,.19,1.45,mats.wood);
  for(const xx of [X-2.84,X-1.16])for(const zz of [Z+2.45,Z+3.55])
    box('cabin / table leg',xx,floorY+.38,zz,.16,.74,.16,mats.trim);
  box('cabin / bunk base',X-5.3,floorY+.42,Z-3.4,2.7,.48,4.05,mats.wood);
  box('cabin / mattress',X-5.3,floorY+.78,Z-3.4,2.5,.25,3.8,mats.cloth);
  box('cabin / shelf',X+3,floorY+1.28,Z-5.15,3,.13,.7,mats.wood);

  // Two real timber chairs face the existing table, leaving the central
  // entry-to-west-wall walking axis and both windows open. Seats, grounded
  // legs, back uprights and back slats share ONE coloured GPU instance batch.
  // The physical chair rectangles below cover every visual part, so walkers
  // cannot pass through the new furniture. No extra textures or save state.
  const chairParts:{matrix:T.Matrix4;color:number}[]=[];
  const chairRotation=new T.Quaternion();
  const chairPart=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>{
    chairParts.push({matrix:new T.Matrix4().compose(
      new T.Vector3(x,y,z),chairRotation,new T.Vector3(w,h,d)),color});
  };
  for(const [index,cz] of [Z+1.78,Z+4.22].entries()){
    const cx=X-2,outward=index===0?-1:1;
    chairPart(cx,floorY+.52,cz,.80,.13,.72,0x947251);
    for(const dx of [-.29,.29])for(const dz of [-.25,.25])
      chairPart(cx+dx,floorY+.225,cz+dz,.11,.45,.11,0x654d38);
    const backZ=cz+outward*.29;
    for(const dx of [-.29,.29])
      chairPart(cx+dx,floorY+.98,backZ,.105,1.05,.11,0x6f533a);
    for(const dy of [1.12,1.37])
      chairPart(cx,floorY+dy,backZ,.67,.12,.11,0x9e7955);
  }
  const chairs=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),chairParts.length);
  chairs.name='cabin / two grounded table chairs / instanced';
  for(let i=0;i<chairParts.length;i++){
    chairs.setMatrixAt(i,chairParts[i].matrix);
    chairs.setColorAt(i,new T.Color(chairParts[i].color));
  }
  chairs.instanceMatrix.needsUpdate=true;
  if(chairs.instanceColor)chairs.instanceColor.needsUpdate=true;
  chairs.computeBoundingSphere();
  group.add(chairs);parts++;


  // Flat woven floor runner provides human-scale cabin interior detail
  // without modifying the 5m terrain, original physical timber floor,
  // collision or campaign save contract. Fourteen stripes/bindings share
  // ONE reusable geometry, material and instanced draw call. The upper face
  // is just 3mm above the known walkable floor; the thin weave is inlaid into
  // the planks, so the existing authoritative walking Y remains unchanged.
  // Keep the east-west door corridor (z=Z) and the table/chairs clear.
  const runnerX=X+2.0,runnerZ=Z+2.7;
  const runnerTones=[0x6e7766,0x828a70,0x9a8e73,0x65705e,0x7f876c,0x887c65];
  const runnerPieces:{matrix:T.Matrix4;color:number}[]=[];
  const runnerRotation=new T.Quaternion();
  for(let i=0;i<12;i++){
    runnerPieces.push({matrix:new T.Matrix4().compose(
      new T.Vector3(runnerX,floorY-.007,runnerZ+(i-5.5)*.22),
      runnerRotation,new T.Vector3(2.46,.020,.218)),
      color:runnerTones[i%runnerTones.length]});
  }
  for(const side of [-1,1] as const){
    runnerPieces.push({matrix:new T.Matrix4().compose(
      new T.Vector3(runnerX+side*1.25,floorY-.007,runnerZ),
      runnerRotation,new T.Vector3(.13,.020,2.64)),
      color:0x554d40});
  }
  const runner=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),runnerPieces.length);
  runner.name='cabin / grounded woven floor runner / instanced';
  for(let i=0;i<runnerPieces.length;i++){
    runner.setMatrixAt(i,runnerPieces[i].matrix);
    runner.setColorAt(i,new T.Color(runnerPieces[i].color));
  }
  runner.instanceMatrix.needsUpdate=true;
  if(runner.instanceColor)runner.instanceColor.needsUpdate=true;
  runner.computeBoundingSphere();
  group.add(runner);parts++;

  // Hand-placed colour variation on the original, physically supported shelf:
  // sixteen real book volumes share ONE GPU draw call and no new textures.
  // Their lower corners overlap the existing shelf top by millimetres instead
  // of floating above it. The north-wall footprint is outside the central
  // walking route and does not change furniture or save collision contracts.
  const shelfTop=floorY+1.28+.13/2;
  const bookColours=[0x64716b,0x8c634d,0x566c75,0x857b66,0x655e73];
  const books=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),16);
  books.name='cabin / grounded coloured shelf books / instanced';
  for(let i=0;i<books.count;i++){
    const width=.12+(i%3)*.025;
    const height=.34+((i*7)%5)*.07;
    const depth=.30+(i%2)*.07;
    const angle=.03*Math.sin(i*2.1);
    const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle);
    const center=new T.Vector3(X+1.69+i*.176,shelfTop+height/2,
      Z-5.15+((i%3)-1)*.07);
    books.setMatrixAt(i,new T.Matrix4().compose(center,rotation,
      new T.Vector3(width,height,depth)));
    books.setColorAt(i,new T.Color(bookColours[(i*3+Math.floor(i/4))%bookColours.length]));
  }
  books.instanceMatrix.needsUpdate=true;
  if(books.instanceColor)books.instanceColor.needsUpdate=true;
  books.computeBoundingSphere();
  group.add(books);parts++;

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
  // A genuine above-roof stove outlet finishes the previously concealed flue.
  // Stack bottom overlaps the indoor flue by 3cm THROUGH the true sloping
  // roof. The pitched steel flashing follows its exact western roof face;
  // a joined collar and rain cap finish the outlet. Four parts, one instance
  // draw batch, no glass/door/ground/saved-world changes or fake roof floor.
  const stackBase=stoveRoofY-.08,stackTop=stoveRoofY+1.43;
  const chimneyParts:{matrix:T.Matrix4;color:number}[]=[];
  const chimneyPart=(y:number,w:number,h:number,d:number,color:number,
    rotation=new T.Quaternion())=>chimneyParts.push({
      matrix:new T.Matrix4().compose(new T.Vector3(stoveX,y,stoveZ),
        rotation,new T.Vector3(w,h,d)),color,
    });
  chimneyPart((stackBase+stackTop)/2,.36,stackTop-stackBase,.36,0x495453);
  const roofSlopeRotation=new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0,0,1),roofPitch);
  chimneyPart(stoveRoofY+.025,.98,.07,.84,0x70837e,roofSlopeRotation);
  chimneyPart(stoveRoofY+.24,.54,.13,.54,0x65716c);
  chimneyPart(stackTop+.075,.75,.15,.75,0x394a49);
  const chimney=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),chimneyParts.length);
  chimney.name='cabin / pitched roof grounded chimney stack and flashing / instanced';
  for(let i=0;i<chimneyParts.length;i++){
    chimney.setMatrixAt(i,chimneyParts[i].matrix);
    chimney.setColorAt(i,new T.Color(chimneyParts[i].color));
  }
  chimney.instanceMatrix.needsUpdate=true;
  if(chimney.instanceColor)chimney.instanceColor.needsUpdate=true;
  chimney.computeBoundingSphere();group.add(chimney);parts++;

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


  // Rain-runoff carpentry completes BOTH pitched eaves without changing the
  // roof planes, cabin floor or existing doorway. Two open metal channels,
  // their real roof-contact brackets and two downpipes terminate on the
  // canonical 5m ground. Each piece shares one weathered instanced draw call.
  const gutterParts:{matrix:T.Matrix4;color:number}[]=[];
  const gutterRotation=new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0,1,0),Math.PI/2);
  const unrotated=new T.Quaternion();
  const gutterPart=(x:number,y:number,z:number,w:number,h:number,d:number,
    color:number,rotation=unrotated)=>{
    gutterParts.push({matrix:new T.Matrix4().compose(
      new T.Vector3(x,y,z),rotation,new T.Vector3(w,h,d)),color});
  };
  for(const side of [-1,1] as const){
    const channelX=X+side*roofHalf;
    // Three pieces form a recognizable U-shaped channel, not a flat line
    // pasted onto the wall. Both roof eave seams remain visible above it.
    gutterPart(channelX,eave-.12,Z,roofSpan-.30,.10,.22,0x526463,gutterRotation);
    for(const lip of [-1,1] as const)
      gutterPart(channelX+lip*.095,eave-.052,Z,
        roofSpan-.30,.105,.065,0x80908a,gutterRotation);
    // Roof-contact saddles carry the gutters at two points per side.
    for(const z of [Z-6.8,Z+6.8])
      gutterPart(channelX-side*.11,eave-.11,z,.34,.15,.22,0x435754);
    // One downpipe per side is intentionally at an opposite, outside-wall
    // corner. Neither intersects the 2.3m stair, doorway or glazed windows.
    const pipeX=X+side*(WIDTH/2+.28);
    const pipeZ=Z+(side<0?7.35:-7.35);
    const ground=terrain.heightAt(pipeX,pipeZ);
    const pipeTop=eave-.16,pipeBottom=ground+.025;
    const height=pipeTop-pipeBottom;
    if(!(Number.isFinite(height)&&height>1.0&&height<9))
      throw new RangeError('Cabin downpipe cannot join actual dry ground');
    gutterPart((pipeX+channelX)/2,eave-.22,pipeZ,
      Math.abs(pipeX-channelX)+.16,.13,.16,0x71817c);
    gutterPart(pipeX,pipeBottom+height/2,pipeZ,
      .16,height,.16,0x586e69);
  }
  const gutters=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),gutterParts.length);
  gutters.name='cabin / roof-contact gutters and grounded downspouts / instanced';
  for(let i=0;i<gutterParts.length;i++){
    gutters.setMatrixAt(i,gutterParts[i].matrix);
    gutters.setColorAt(i,new T.Color(gutterParts[i].color));
  }
  gutters.instanceMatrix.needsUpdate=true;
  if(gutters.instanceColor)gutters.instanceColor.needsUpdate=true;
  gutters.computeBoundingSphere();
  group.add(gutters);parts++;


  // The east-facing 2.3m entrance receives a genuine lean-to canopy.
  // Its pitched metal cover anchors into both opaque door-pier walls, while
  // two timber posts meet the ACTUAL 5m terrain and gain matching collisions.
  // All eight volumes share ONE colour-instanced GPU draw group, no textures,
  // new floor, campaign-save mutation, or change to the stair/door centerline.
  const canopyPieces:{matrix:T.Matrix4;color:number}[]=[];
  const addCanopy=(center:T.Vector3,extent:T.Vector3,color:number,
    rotation=new T.Quaternion())=>{
    canopyPieces.push({matrix:new T.Matrix4().compose(center,rotation,extent),color});
  };
  const awningRootX=right-.22,awningEdgeX=right+2.66;
  const awningRootY=floorY+3.18,awningEdgeY=floorY+2.72;
  const awningDeltaX=awningEdgeX-awningRootX;
  const awningDeltaY=awningEdgeY-awningRootY;
  const awningLength=Math.hypot(awningDeltaX,awningDeltaY);
  const awningAngle=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),
    Math.atan2(awningDeltaY,awningDeltaX));
  const awningRoofAt=(x:number)=>awningRootY+awningDeltaY*(x-awningRootX)/awningDeltaX;
  addCanopy(new T.Vector3((awningRootX+awningEdgeX)/2,
    (awningRootY+awningEdgeY)/2,Z),
    new T.Vector3(awningLength,.13,4.98),0x516562,awningAngle);
  // Front fascia and two cedar side rafters physically meet the sloped
  // cover, so the porch reads as timber carpentry rather than a floating slab.
  addCanopy(new T.Vector3(awningEdgeX,awningEdgeY-.09,Z),
    new T.Vector3(.17,.19,4.98),0x836b50);
  for(const side of [-1,1] as const)
    addCanopy(new T.Vector3((awningRootX+awningEdgeX)/2,
      (awningRootY+awningEdgeY)/2-.12,Z+side*2.27),
      new T.Vector3(awningLength,.17,.17),0x947656,awningAngle);
  const canopyPostX=right+2.35,canopyPostOffsetZ=2.23;
  const canopyPostTop=awningRoofAt(canopyPostX)-.045;
  for(const side of [-1,1] as const){
    const postZ=Z+side*canopyPostOffsetZ;
    const ground=terrain.heightAt(canopyPostX,postZ);
    if(!Number.isFinite(ground)||terrain.inWater(canopyPostX,postZ))
      throw new RangeError('Entrance canopy requires dry real terrain footing');
    const bottom=ground-.02,height=canopyPostTop-bottom;
    if(!(height>1.5&&height<8))
      throw new RangeError('Entrance canopy posts must reach the true roof and ground');
    addCanopy(new T.Vector3(canopyPostX,bottom+height/2,postZ),
      new T.Vector3(.19,height,.19),0x806247);
  }
  const beamFromTo=(a:T.Vector3,b:T.Vector3)=>{
    const vector=b.clone().sub(a),length=vector.length();
    const rotation=new T.Quaternion().setFromUnitVectors(
      new T.Vector3(1,0,0),vector.clone().normalize());
    addCanopy(a.clone().add(b).multiplyScalar(.5),
      new T.Vector3(length,.16,.17),0x927358,rotation);
  };
  for(const side of [-1,1] as const){
    const z=Z+side*canopyPostOffsetZ;
    // Each diagonal braces an already opaque eastern wall pier to its post.
    beamFromTo(new T.Vector3(right-.045,floorY+2.38,z),
      new T.Vector3(canopyPostX,canopyPostTop-.18,z));
  }
  const entranceCanopy=new T.InstancedMesh(new T.BoxGeometry(1,1,1),
    new T.MeshLambertMaterial({color:0xffffff}),canopyPieces.length);
  entranceCanopy.name='cabin / grounded pitched entrance canopy / instanced';
  for(let i=0;i<canopyPieces.length;i++){
    entranceCanopy.setMatrixAt(i,canopyPieces[i].matrix);
    entranceCanopy.setColorAt(i,new T.Color(canopyPieces[i].color));
  }
  entranceCanopy.instanceMatrix.needsUpdate=true;
  if(entranceCanopy.instanceColor)entranceCanopy.instanceColor.needsUpdate=true;
  entranceCanopy.computeBoundingSphere();
  group.add(entranceCanopy);parts++;

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
    const chairs=[Z+1.78,Z+4.22].some(cz=>rect(x,z,X-2,cz,.80,.72));
    const bunk=rect(x,z,X-5.3,Z-3.4,2.7,4.05);
    const stove=rect(x,z,stoveX,stoveZ,1.9,1.65);
    // Guardrails are solid at the stair edges; never obstruct the centerline.
    const rail=x>=right+.25&&x<=outsideX&&
      Math.abs(z-Z)>=DOOR_HALF-.09&&Math.abs(z-Z)<=DOOR_HALF+.45;
    const canopyPosts=[-1,1].some(side=>
      rect(x,z,canopyPostX,Z+side*canopyPostOffsetZ,.19,.19));
    return west||north||south||east||table||chairs||bunk||stove||rail||canopyPosts;
  };
  return {group,floorY,heightAt,blockedAt,stairs,parts,supports:pierSites.length,entrance:{x:right+1.7,z:Z}};
}
