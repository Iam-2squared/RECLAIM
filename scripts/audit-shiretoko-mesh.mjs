/** Independent indexed-heightfield topology audit, also used by v4 regression tests. */
export function auditMesh(mesh,bounds){
 const p=mesh.positions,edges=new Map(),faces=new Set();let minArea=Infinity,maxArea=0,area=0,invalid=0,wrongWinding=0,duplicateFaces=0;
 const vertexCount=p.length/3,fields=['positions','normals','occlusion','wetness','exposure'];
 for(const field of fields)for(const value of mesh[field])if(!Number.isFinite(value))invalid++;
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=Array.from(mesh.indices.slice(i,i+3));if(ids.some(v=>v>=vertexCount))invalid++;
  const [a,b,c]=ids.map(v=>v*3),cross=(p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2]);
  if(!(cross>0))wrongWinding++;const size=cross/2;minArea=Math.min(minArea,size);maxArea=Math.max(maxArea,size);area+=size;
  const face=ids.slice().sort((a,b)=>a-b).join(',');if(faces.has(face))duplicateFaces++;faces.add(face);
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`,edge=edges.get(key)??{a,b,count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);}
 }
 let interiorOpenEdges=0,nonManifold=0,badOrientation=0,boundaryEdges=0;
 for(const e of edges.values()){
  if(e.count>2)nonManifold++;
  if(e.count===2&&e.direction!==0)badOrientation++;
  if(e.count===1){
   const a=e.a*3,b=e.b*3,outer=(p[a]===p[b]&&(p[a]===bounds.x0||p[a]===bounds.x1))||(p[a+2]===p[b+2]&&(p[a+2]===bounds.z0||p[a+2]===bounds.z1));
   if(outer)boundaryEdges++;else interiorOpenEdges++;
  }
 }
 return{vertices:vertexCount,triangles:mesh.indices.length/3,edges:edges.size,projectedArea:area,expectedArea:(bounds.x1-bounds.x0)*(bounds.z1-bounds.z0),minArea,maxArea,invalid,wrongWinding,duplicateFaces,interiorOpenEdges,nonManifold,badOrientation,boundaryEdges,eulerCharacteristic:vertexCount-edges.size+faces.size};
}

/** Barycentric sampling of the actual far triangles, not the analytic source. */
export function meshSampler(mesh,bounds){
 const p=mesh.positions,bins=new Map();
 for(let i=0;i<mesh.indices.length;i+=3){const ids=Array.from(mesh.indices.slice(i,i+3)).map(v=>v*3),x=ids.reduce((sum,j)=>sum+p[j],0)/3,z=ids.reduce((sum,j)=>sum+p[j+2],0)/3,key=`${Math.floor((x-bounds.x0)/80)},${Math.floor((z-bounds.z0)/80)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(ids);}
 return(x,z)=>{
  const key=`${Math.floor((x-bounds.x0)/80)},${Math.floor((z-bounds.z0)/80)}`;
  for(const [a,b,c]of bins.get(key)??[]){
   const den=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);
   const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/den,v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/den;
   if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return p[a+1]*u+p[b+1]*v+p[c+1]*(1-u-v);
  }
  throw new Error(`No physical triangle at ${x},${z}`);
 };
}
