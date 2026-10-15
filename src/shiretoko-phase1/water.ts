import { BASINS, TERRAIN, ShiretokoTerrain, basinDistance, type Basin } from './terrain.ts';

type WetVertex={x:number;z:number;height:number;mask:number};
/** A water polygon is clipped against the ACTUAL 5m rendered triangles. This
 * removes the former, unrelated analytic ellipse in the fragment shader. */
export function basinWaterMesh(terrain:ShiretokoTerrain,basin:Basin){
  const positions:number[]=[],indices:number[]=[];
  const cell=TERRAIN.cell,extent=TERRAIN.extent;
  const startX=Math.max(-extent,Math.floor((basin.x-basin.rx*1.8)/cell)*cell);
  const endX=Math.min(extent,Math.ceil((basin.x+basin.rx*1.8)/cell)*cell);
  const startZ=Math.max(-extent,Math.floor((basin.z-basin.rz*1.8)/cell)*cell);
  const endZ=Math.min(extent,Math.ceil((basin.z+basin.rz*1.8)/cell)*cell);
  const vertex=(x:number,z:number):WetVertex=>{
    const height=terrain.heightAt(x,z);
    return{x,z,height,mask:Math.max(height-basin.level,(basinDistance(basin,x,z)-1.46)*25)};
  };
  const clip=(triangle:WetVertex[])=>{
    const polygon:WetVertex[]=[];
    for(let i=0;i<3;i++){
      const a=triangle[i],b=triangle[(i+1)%3],insideA=a.mask<0,insideB=b.mask<0;
      if(insideA)polygon.push(a);
      if(insideA!==insideB){const t=a.mask/(a.mask-b.mask);polygon.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,height:a.height+(b.height-a.height)*t,mask:0});}
    }
    if(polygon.length<3)return;
    const first=positions.length/3;
    for(const p of polygon)positions.push(p.x,basin.level,p.z);
    for(let i=1;i<polygon.length-1;i++)indices.push(first,first+i,first+i+1);
  };
  for(let z=startZ;z<endZ;z+=cell)for(let x=startX;x<endX;x+=cell){
    const a=vertex(x,z),b=vertex(x+cell,z),c=vertex(x,z+cell),d=vertex(x+cell,z+cell);
    clip([a,c,b]);clip([b,c,d]);
  }
  return{positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}

export const basinWaterCounts=(terrain:ShiretokoTerrain)=>BASINS.map(b=>{
  const mesh=basinWaterMesh(terrain,b);
  let maxDepthMetres=0;
  for(let i=0;i<mesh.positions.length;i+=3)maxDepthMetres=Math.max(maxDepthMetres,b.level-terrain.heightAt(mesh.positions[i],mesh.positions[i+2]));
  return{id:b.id,vertices:mesh.positions.length/3,triangles:mesh.indices.length/3,designedDepthMetres:b.depth,maxDepthMetres};
});
