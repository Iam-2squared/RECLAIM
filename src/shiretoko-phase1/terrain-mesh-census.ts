/**
 * Geometry-level census of the ACTUAL Shiretoko indexed terrain meshes.
 * Sampling uses the same canonical surface height as rendering/contact.
 * This is not an image comparison or a fog/FOV workaround.
 */
export type TerrainMesh = Readonly<{name:string;positions:Float32Array;indices:Uint32Array;normals?:Float32Array}>;
export type AuditFault = Readonly<{kind:'index'|'nonfinite'|'ground'|'normal'|'winding'|'degenerate'|'duplicate-edge'|'missing-edge'|'height-seam';detail:string}>;
export type AuditReport = Readonly<{vertices:number;triangles:number;issues:readonly AuditFault[];pass:boolean}>;
export type SeamReport = Readonly<{leftSegments:number;rightSegments:number;issues:readonly AuditFault[];pass:boolean}>;
export const TERRAIN_AUDIT_BUDGET=Object.freeze({maxVertices:1_000_000,maxTriangles:1_000_000,maxFaults:120});
const finite=(n:number)=>Number.isFinite(n);
const point=(m:TerrainMesh,i:number)=>({x:m.positions[3*i],y:m.positions[3*i+1],z:m.positions[3*i+2]});
function collector(){
 const issues:AuditFault[]=[];
 return {issues,add:(kind:AuditFault['kind'],detail:string)=>{if(issues.length<TERRAIN_AUDIT_BUDGET.maxFaults)issues.push({kind,detail});}};
}
/** Checks finite surfaces, contact agreement, normal length, faces and XZ winding. */
export function auditTerrainMeshes(meshes:readonly TerrainMesh[],heightAt:(x:number,z:number)=>number,tolerance=.005):AuditReport {
 if(typeof heightAt!=='function'||!finite(tolerance)||tolerance<=0)throw new RangeError('invalid mesh audit options');
 const {issues,add}=collector();
 let vertices=0,triangles=0;
 for(const m of meshes){
  if(m.positions.length%3!==0||m.indices.length%3!==0)throw new RangeError('unaligned mesh '+m.name);
  const vertexCount=m.positions.length/3,triCount=m.indices.length/3;
  vertices+=vertexCount;triangles+=triCount;
  if(vertices>TERRAIN_AUDIT_BUDGET.maxVertices||triangles>TERRAIN_AUDIT_BUDGET.maxTriangles)throw new RangeError('terrain audit budget exceeded');
  if(m.normals&&m.normals.length!==m.positions.length)add('normal',m.name+' has invalid normal array size');
  for(let i=0;i<vertexCount;i++){
   const p=point(m,i);
   if(!finite(p.x)||!finite(p.y)||!finite(p.z)){add('nonfinite',m.name+' vertex '+i);continue;}
   const h=heightAt(p.x,p.z);
   if(!finite(h)||Math.abs(h-p.y)>tolerance)add('ground',m.name+' vertex '+i+' y='+p.y+' contact='+h);
   if(m.normals&&m.normals.length===m.positions.length){
    const a=3*i,n=Math.hypot(m.normals[a],m.normals[a+1],m.normals[a+2]);
    if(!finite(n)||Math.abs(n-1)>.04)add('normal',m.name+' vertex '+i+' normal length='+n);
   }
  }
  for(let i=0;i<m.indices.length;i+=3){
   const ia=m.indices[i],ib=m.indices[i+1],ic=m.indices[i+2];
   if(ia>=vertexCount||ib>=vertexCount||ic>=vertexCount){add('index',m.name+' triangle '+i/3);continue;}
   const a=point(m,ia),b=point(m,ib),c=point(m,ic);
   const signed=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
   if(!finite(signed)||Math.abs(signed)<1e-6)add('degenerate',m.name+' triangle '+i/3);
   else if(signed<0)add('winding',m.name+' triangle '+i/3);
  }
 }
 return {vertices,triangles,issues:Object.freeze(issues),pass:issues.length===0};
}
/**
 * Real indexed triangle edges on each side of a stitched XZ seam.
 * The exact interval partition (not merely matching boundary heights)
 * must agree: coarse triangles ending at a fine vertex produce a T junction.
 */
export function auditTerrainSeam(left:readonly TerrainMesh[],right:readonly TerrainMesh[],
 seam:Readonly<{z:number;xMin:number;xMax:number}>,tolerance=.005):SeamReport {
 if(!finite(seam.z)||!finite(seam.xMin)||!finite(seam.xMax)||seam.xMax<=seam.xMin||
    !finite(tolerance)||tolerance<=0)throw new RangeError('invalid terrain seam');
 const {issues,add}=collector();
 type Edge={start:number;end:number;y0:number;y1:number};
 const collect=(meshes:readonly TerrainMesh[],side:string)=>{
  const segments=new Map<string,Edge>();let seenFaces=0;
  for(const mesh of meshes){
   const n=mesh.positions.length/3;
   if(mesh.indices.length%3!==0||mesh.positions.length%3!==0)throw new RangeError('unaligned seam mesh');
   for(let i=0;i<mesh.indices.length;i+=3){
    if(++seenFaces>TERRAIN_AUDIT_BUDGET.maxTriangles)throw new RangeError('seam audit budget exceeded');
    const ids=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]];
    if(ids.some(id=>id>=n)){add('index',side+' invalid triangle '+i/3);continue;}
    for(let k=0;k<3;k++){
     const a=point(mesh,ids[k]),b=point(mesh,ids[(k+1)%3]);
     if(![a.x,a.y,a.z,b.x,b.y,b.z].every(finite)){add('nonfinite',side+' invalid seam vertex');continue;}
     if(Math.abs(a.z-seam.z)>1e-4||Math.abs(b.z-seam.z)>1e-4||Math.abs(a.x-b.x)<1e-5)continue;
     const start=Math.min(a.x,b.x),end=Math.max(a.x,b.x);
     if(start<seam.xMin-1e-5||end>seam.xMax+1e-5)continue;
     const edge={start,end,y0:a.x<b.x?a.y:b.y,y1:a.x<b.x?b.y:a.y};
     const key=start.toFixed(4)+':'+end.toFixed(4);
     if(segments.has(key))add('duplicate-edge',side+' '+key);
     else segments.set(key,edge);
    }
   }
  }
  return segments;
 };
 const a=collect(left,'left'),b=collect(right,'right');
 for(const [key,e] of a){
  const f=b.get(key);if(!f){add('missing-edge','right lacks '+key);continue;}
  if(Math.abs(e.y0-f.y0)>tolerance||Math.abs(e.y1-f.y1)>tolerance)
   add('height-seam','heights disagree at '+key);
 }
 for(const key of b.keys())if(!a.has(key))add('missing-edge','left lacks '+key);
 if(a.size===0||b.size===0)add('missing-edge','empty actual seam');
 return {leftSegments:a.size,rightSegments:b.size,issues:Object.freeze(issues),pass:issues.length===0};
}
