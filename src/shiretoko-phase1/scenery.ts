import { ShiretokoTerrain, type ChunkData } from './terrain.ts';
export const SCENERY = Object.freeze({near:{x0:-3600,x1:3600,z0:-4200,z1:-1200,step:20},far:{x0:-6000,x1:6000,z0:-10200,z1:-4200,step:80}});
/** Two light scenery grids. Only join rows are split; no skirts, lids or exposed cut walls. */
export function sceneryMesh(terrain:ShiretokoTerrain, band:'near'|'far'):ChunkData {
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
