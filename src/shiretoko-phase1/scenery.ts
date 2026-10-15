import { ShiretokoTerrain, coastDistance, type ChunkData } from './terrain.ts';
export const SCENERY = Object.freeze({near:{x0:-3600,x1:3600,z0:-4200,z1:-1200,step:20},far:{x0:-6000,x1:6000,z0:-10200,z1:-4200,step:80}});
export const COAST_LOD = Object.freeze({cell:80,coastalCell:20,seaward:-180,inland:440});
/** Subdivide the physical shore, not the whole distant mountain/seabed grid. */
export function farCellDivisions(x:number,z:number):1|4 {
 const samples=[[x,z],[x+80,z],[x,z+80],[x+80,z+80],[x+40,z+40]].map(([px,pz])=>coastDistance(px,pz));
 return Math.min(...samples)<COAST_LOD.inland && Math.max(...samples)>COAST_LOD.seaward?4:1;
}

function farMesh(terrain:ShiretokoTerrain):ChunkData {
 const b=SCENERY.far,cols=(b.x1-b.x0)/80,rows=(b.z1-b.z0)/80;
 const divisions=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>farCellDivisions(b.x0+c*80,b.z0+r*80)));
 const positions:number[]=[],normals:number[]=[],occlusion:number[]=[],wetness:number[]=[],exposure:number[]=[],indices:number[]=[];
 const vertices=new Map<string,number>();
 const add=(x:number,z:number)=>{
  const key=`${x},${z}`,previous=vertices.get(key);if(previous!==undefined)return previous;
  const i=positions.length/3,v=terrain.vertexAt(x,z);vertices.set(key,i);
  positions.push(x,v.y,z);normals.push(...v.normal);occlusion.push(v.occlusion);wetness.push(v.wetness);exposure.push(v.exposure);return i;
 };
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const n=divisions[row][col],step=80/n,x0=b.x0+col*80,z0=b.z0+row*80;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const x=x0+i*step,z=z0+j*step,ring:number[]=[];
   const edge=(px:number,pz:number,dx:number,dz:number,neighbor:number)=>{
    const splits=Math.max(1,neighbor/n);for(let k=0;k<splits;k++)ring.push(add(px+dx*k/splits,pz+dz*k/splits));
   };
   // Same clockwise XZ winding as the 5m surface. A coarse cell touching a
   // 20m cell uses every fine edge vertex and a centre fan: no T junction/skirt.
   edge(x,z,0,step,i===0?(divisions[row][col-1]??n):n);
   const join=row===rows-1&&x>=-3600&&x<3600;
   edge(x,z+step,step,0,j===n-1?(join?4:divisions[row+1]?.[col]??n):n);
   edge(x+step,z+step,0,-step,i===n-1?(divisions[row][col+1]??n):n);
   edge(x+step,z,-step,0,j===0?(divisions[row-1]?.[col]??n):n);
   if(ring.length===4)indices.push(ring[0],ring[1],ring[3],ring[3],ring[1],ring[2]);
   else {const centre=add(x+step/2,z+step/2);for(let k=0;k<ring.length;k++)indices.push(centre,ring[k],ring[(k+1)%ring.length]);}
  }
 }
 return {positions:new Float32Array(positions),normals:new Float32Array(normals),occlusion:new Float32Array(occlusion),wetness:new Float32Array(wetness),exposure:new Float32Array(exposure),indices:new Uint32Array(indices),cx:0,cz:0};
}

/** Shared physical surface and attributes at all 5/20/80m joins. */
export function sceneryMesh(terrain:ShiretokoTerrain, band:'near'|'far'):ChunkData {
 if(band==='far')return farMesh(terrain);
 const b=SCENERY[band],cols=(b.x1-b.x0)/b.step,rows=(b.z1-b.z0)/b.step;
 if(!Number.isInteger(cols)||!Number.isInteger(rows))throw new Error('Scenery bounds must align with their LOD grid');
 const positions:number[]=[],normals:number[]=[],occlusion:number[]=[],wetness:number[]=[],exposure:number[]=[],indices:number[]=[];
 const add=(x:number,z:number)=>{
  const i=positions.length/3,v=terrain.vertexAt(x,z);
  positions.push(x,v.y,z);normals.push(...v.normal);occlusion.push(v.occlusion);wetness.push(v.wetness);exposure.push(v.exposure);return i;
 };
 for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++)add(b.x0+col*b.step,b.z0+row*b.step);
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const a=row*(cols+1)+col,c=a+cols+1,d=c+1,right=a+1,x=b.x0+col*b.step;
  indices.push(a,c,right);
  const stitch=band==='near'?5:20;
  const joinWidth=band==='near'?1200:3600;
  if(row===rows-1 && x>=-joinWidth && x<joinWidth){
   let last=c;
   for(let offset=stitch;offset<b.step;offset+=stitch){const next=add(x+offset,b.z1);indices.push(right,last,next);last=next;}
   indices.push(right,last,d);
  }else indices.push(right,c,d);
 }
 return {positions:new Float32Array(positions),normals:new Float32Array(normals),occlusion:new Float32Array(occlusion),wetness:new Float32Array(wetness),exposure:new Float32Array(exposure),indices:new Uint32Array(indices),cx:0,cz:0};
}
