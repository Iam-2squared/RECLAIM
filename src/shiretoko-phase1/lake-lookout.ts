import * as T from 'three';
import { BASINS, basinDistance, ShiretokoTerrain } from './terrain.ts';

/**
 * Optional 2.4 km Shiretoko lake outlook. This 3D mesh, rather than an
 * invisible horizontal plane, is also the walker's authoritative top surface.
 * No campaign coordinates, persistent storage or external assets are used.
 */
type Point = Readonly<{ x: number; y: number; z: number }>;
type TopTriangle = Readonly<{ a: Point; b: Point; c: Point }>;
export type LakeLookoutReview = Readonly<{
  group: T.Group;
  heightAt: (x: number, z: number) => number | null;
  blockedAt: (x: number, z: number) => boolean;
  entrance: Readonly<{ x: number; z: number }>;
  viewpoint: Point;
  panels: number;
  supports: number;
}>;

const HALF_X = 4, HALF_Z = 5, LIFT = .29;
const crossXZ = (a: Point, b: Point, c: Point) =>
  (b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);

/** Find dry, shallow-sloped land on the west side of the actual lake mesh. */
export function lakeLookoutSite(terrain: ShiretokoTerrain): Readonly<{ x: number; z: number }> {
  const lake = BASINS.find(b => b.id === 'highland-lake');
  if (!lake) throw new Error('Shiretoko highland lake missing');
  // The lake is irregular: never assume the ellipse radius is the shoreline.
  // Scan the exact source basin boundary, then walk back onto dry land.
  let waterX: number | null = null;
  for (let x = lake.x - lake.rx * 1.7; x <= lake.x; x += 1) {
    if (basinDistance(lake, x, lake.z) <= .99) {
      waterX = x;
      break;
    }
  }
  if (waterX === null) throw new RangeError('No lake shore can be located');
  for (let retreat = 0; retreat <= 55; retreat++) {
    const x = waterX - 15 - retreat * 1.4, z = lake.z;
    const corners = [
      [x-HALF_X,z-HALF_Z],[x-HALF_X,z+HALF_Z],
      [x+HALF_X,z-HALF_Z],[x+HALF_X,z+HALF_Z],[x,z],
    ] as const;
    if (corners.some(([cx,cz])=>terrain.inWater(cx,cz) ||
      basinDistance(lake,cx,cz)<1.06 ||
      !Number.isFinite(terrain.heightAt(cx,cz)) ||
      terrain.slopeAt(cx,cz)>.52)) continue;
    const heights=corners.map(([cx,cz])=>terrain.heightAt(cx,cz));
    if (Math.max(...heights)-Math.min(...heights)>1.5) continue;
    // The four corners define TWO planar render triangles, but the shared
    // 5m ground has its own diagonal. At the middle of either side, their
    // interpolated heights can differ. A dry/low-slope site can therefore
    // still bury a real support in the ground. Require all six actual pier
    // contact points to clear the terrain before accepting this candidate.
    const sideMidpoints=[x-HALF_X,x+HALF_X] as const;
    if (sideMidpoints.some((px,side)=>{
      const backY=heights[side===0?0:2];
      const frontY=heights[side===0?1:3];
      const ground=terrain.heightAt(px,z);
      return terrain.inWater(px,z) ||
        terrain.slopeAt(px,z)>.52 ||
        (backY+frontY)/2+LIFT-ground<.08;
    })) continue;
    return Object.freeze({x,z});
  }
  throw new RangeError('No safe dry lake look-out site within the shore review budget');
}

export function createLakeLookoutReview(terrain: ShiretokoTerrain): LakeLookoutReview {
  const site=lakeLookoutSite(terrain);
  const left=site.x-HALF_X,right=site.x+HALF_X;
  const back=site.z-HALF_Z,front=site.z+HALF_Z;
  const top=(x:number,z:number)=>terrain.heightAt(x,z)+LIFT;
  const a={x:left,y:top(left,back),z:back};
  const b={x:right,y:top(right,back),z:back};
  const c={x:left,y:top(left,front),z:front};
  const d={x:right,y:top(right,front),z:front};
  // The two ordered tuples MUST agree with indices [0,2,1] and [1,2,3]:
  // only anticlockwise top faces produce normal +Y and correct barycentric contact.
  const triangles:TopTriangle[]=[{a,b:c,c:b},{a:b,b:c,c:d}];
  if(triangles.some(t=>crossXZ(t.a,t.b,t.c)<=0))
    throw new RangeError('Lake lookout must have upward-facing walk triangles');
  const group=new T.Group();
  group.name='development review / walkable highland-lake overlook';
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute([
    a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,d.x,d.y,d.z,
  ],3));
  geometry.setIndex([0,2,1,1,2,3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const deck=new T.Mesh(geometry,new T.MeshLambertMaterial({
    color:0x8a6c4b,side:T.DoubleSide,
  }));
  deck.name='lake-lookout / real indexed wooden walk top';
  group.add(deck);

  const surface=(x:number,z:number):number|null=>{
    if(!Number.isFinite(x)||!Number.isFinite(z)||
      x<left||x>right||z<back||z>front)return null;
    for(const t of triangles){
      const denom=crossXZ(t.a,t.b,t.c);
      const u=crossXZ({x,y:0,z},t.b,t.c)/denom;
      const v=crossXZ(t.a,{x,y:0,z},t.c)/denom;
      const w=1-u-v;
      if(Math.min(u,v,w)>=-1e-7)return u*t.a.y+v*t.b.y+w*t.c.y;
    }
    return null;
  };
  // Each ground-contact pier has its bottom exactly on the same 5m surface.
  // Six supports are one InstancedMesh, never six individual GPU draw calls.
  const supports:[number,number][]=[
    [left,back],[left,site.z],[left,front],
    [right,back],[right,site.z],[right,front],
  ];
  const railColor=new T.MeshLambertMaterial({color:0x624b39});
  const piers=new T.InstancedMesh(new T.BoxGeometry(.18,1,.18),
    railColor,supports.length);
  piers.name='lake-lookout / instanced grounded support piers';
  const matrix=new T.Matrix4();
  supports.forEach(([x,z],index)=>{
    const ground=terrain.heightAt(x,z), deckTop=surface(x,z);
    if(deckTop===null||deckTop-ground<.08)throw new RangeError('Lookout pier cannot reach its actual deck');
    const length=deckTop-ground;
    matrix.compose(new T.Vector3(x,ground+length/2,z),
      new T.Quaternion(),new T.Vector3(1,length,1));
    piers.setMatrixAt(index,matrix);
  });
  piers.instanceMatrix.needsUpdate=true;piers.computeBoundingSphere();group.add(piers);

  // A rail on the lake-facing eastern edge and the two lateral edges leaves
  // the west approach open. Visual rails and 2D collision use these same edges.
  const rails=new T.InstancedMesh(new T.BoxGeometry(1,.14,.13),railColor,3);
  rails.name='lake-lookout / instanced three-sided guard rails';
  // A single straight rail per edge must meet the actual deck surface at
  // BOTH ends. The large indexed deck triangles slope independently in X
  // and Z, so a horizontal rail at the midpoint clips or floats at its posts.
  // Rotating the original three instanced bars adds no draw calls or floors.
  const railRuns=[
    {from:[right,back],to:[right,front]},
    {from:[left,back],to:[right,back]},
    {from:[left,front],to:[right,front]},
  ] as const;
  railRuns.forEach((run,index)=>{
    const fromY=surface(...run.from),toY=surface(...run.to);
    if(fromY===null||toY===null)throw new Error('lookout handrail needs both deck endpoints');
    const from=new T.Vector3(run.from[0],fromY+.95,run.from[1]);
    const to=new T.Vector3(run.to[0],toY+.95,run.to[1]);
    const vector=to.clone().sub(from),length=vector.length();
    const rotation=new T.Quaternion().setFromUnitVectors(
      new T.Vector3(1,0,0),vector.normalize());
    matrix.compose(from.clone().lerp(to,.5),rotation,new T.Vector3(length,1,1));
    rails.setMatrixAt(index,matrix);
  });
  rails.instanceMatrix.needsUpdate=true;rails.computeBoundingSphere();group.add(rails);
  const posts=new T.InstancedMesh(new T.BoxGeometry(.14,.95,.14),railColor,6);
  posts.name='lake-lookout / instanced rail posts';
  supports.forEach(([x,z],i)=>{
    const y=surface(x,z);
    if(y===null)throw new Error('railing post needs deck top');
    matrix.makeTranslation(x,y+.475,z);
    posts.setMatrixAt(i,matrix);
  });
  posts.instanceMatrix.needsUpdate=true;posts.computeBoundingSphere();group.add(posts);

  // Two understated benches, facing the water; the central walking strip
  // remains empty. All parts use a bounded common timber material.
  const benchMaterial=new T.MeshLambertMaterial({color:0x9c7a56});
  const benchGeometry=new T.BoxGeometry(1.65,.17,.49);
  const benches=new T.InstancedMesh(benchGeometry,benchMaterial,2);
  benches.name='lake-lookout / instanced rest benches';
  [back+1,front-1].forEach((z,i)=>{
    const x=site.x-1.5,y=surface(x,z);
    if(y===null)throw new Error('bench cannot float outside deck');
    matrix.makeTranslation(x,y+.48,z);
    benches.setMatrixAt(i,matrix);
  });
  benches.instanceMatrix.needsUpdate=true;benches.computeBoundingSphere();group.add(benches);

  // The two benches used to render as horizontal seats suspended 0.395m
  // above the real sloped deck. Eight solid wooden legs now connect their
  // undersides to the SAME two indexed walking triangles. Only one new
  // instanced draw group is needed; bench collisions and walkable deck stay.
  const benchLegs=new T.InstancedMesh(new T.BoxGeometry(.16,1,.16),
    benchMaterial,8);
  benchLegs.name='lake-lookout / instanced grounded bench legs';
  let benchLegIndex=0;
  [back+1,front-1].forEach(z=>{
    const cx=site.x-1.5,seatY=surface(cx,z);
    if(seatY===null)throw new RangeError('Bench seat has no real deck');
    const underside=seatY+.48-benchGeometry.parameters.height/2;
    for(const dx of [-.50,.50])for(const dz of [-.12,.12]){
      const x=cx+dx,legZ=z+dz,foot=surface(x,legZ);
      if(foot===null)throw new RangeError('Bench leg outside indexed deck');
      const rise=underside-foot;
      if(!(rise>.02 && rise<1))throw new RangeError('Bench leg cannot contact actual deck and seat');
      matrix.compose(new T.Vector3(x,foot+rise/2,legZ),
        new T.Quaternion(),new T.Vector3(1,rise,1));
      benchLegs.setMatrixAt(benchLegIndex++,matrix);
    }
  });
  benchLegs.instanceMatrix.needsUpdate=true;
  benchLegs.computeBoundingSphere();
  group.add(benchLegs);

  // Seventeen dark joins contour the two ACTUAL pitched deck triangles.
  // Each narrow strip is divided at the shared diagonal to prevent clipping
  // or floating. All joinery is ONE draw call and changes no walking surface.
  const seamVertices:number[]=[],seamIndices:number[]=[];
  const seamCount=17,grooveWidth=.044,grooveClearance=.014;
  const diagonalX=(z:number)=>right-(z-back)/(front-back)*(right-left);
  const grooveVertex=(x:number,z:number)=>{
    const deckY=surface(x,z);
    if(deckY===null)throw new RangeError('Plank seam must follow displayed deck triangles');
    seamVertices.push(x,deckY+grooveClearance,z);
  };
  const grooveQuad=(x0:number,z0:number,x1:number,z1:number,
    x2:number,z2:number,x3:number,z3:number)=>{
    const start=seamVertices.length/3;
    grooveVertex(x0,z0);grooveVertex(x1,z1);
    grooveVertex(x2,z2);grooveVertex(x3,z3);
    seamIndices.push(start,start+2,start+1,start,start+3,start+2);
  };
  for(let seam=1;seam<=seamCount;seam++){
    const z=back+(front-back)*seam/(seamCount+1);
    const near=z-grooveWidth/2,far=z+grooveWidth/2;
    grooveQuad(left,near,diagonalX(near),near,diagonalX(far),far,left,far);
    grooveQuad(diagonalX(near),near,right,near,right,far,diagonalX(far),far);
  }
  const seamGeometry=new T.BufferGeometry();
  seamGeometry.setAttribute('position',new T.Float32BufferAttribute(seamVertices,3));
  seamGeometry.setIndex(seamIndices);
  seamGeometry.computeVertexNormals();seamGeometry.computeBoundingSphere();
  const plankSeams=new T.Mesh(seamGeometry,new T.MeshLambertMaterial({
    color:0x463727,side:T.DoubleSide,
  }));
  plankSeams.name='lake-lookout / terrain-conforming real plank grooves';
  group.add(plankSeams);

  const blockedAt=(x:number,z:number):boolean=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))return true;
    // These solids match the three visible rails, not the traversable entrance.
    if(x<left-.25||x>right+.25||z<back-.25||z>front+.25)return false;
    const edge=x>=right-.20&&x<=right+.25&&z>=back-.25&&z<=front+.25;
    const sides=(Math.abs(z-back)<.21||Math.abs(z-front)<.21)&&
      x>=left-.25&&x<=right+.25;
    const bench=Math.abs(x-(site.x-1.5))<=.84&&
      (Math.abs(z-(back+1))<=.33||Math.abs(z-(front-1))<=.33);
    return edge||sides||bench;
  };
  const centerY=surface(site.x,site.z);
  if(centerY===null)throw new Error('lookout platform has no centre contact');
  return Object.freeze({group,heightAt:surface,blockedAt,
    entrance:Object.freeze({x:left+.8,z:site.z}),
    viewpoint:Object.freeze({x:site.x,y:centerY,z:site.z}),
    panels:1,supports:supports.length});
}
