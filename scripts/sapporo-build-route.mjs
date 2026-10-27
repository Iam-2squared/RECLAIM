import{readFile,writeFile}from'node:fs/promises';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{SapporoMapPhysics}from'../src/world/sapporo-map-physics.ts';
import{SAPPORO_MAP_META}from'../src/world/sapporo-map-meta.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),meta=structuredClone(SAPPORO_MAP_META),physics=new SapporoMapPhysics(JSON.parse(await readFile(resolve(root,'public/sapporo-map/physics.json'),'utf8')));
const size=4,cache=new Map();
function segmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
function node(ix,iz){
 const id=`${ix},${iz}`;if(cache.has(id))return cache.get(id);
 const x=ix*size,z=iz*size,y=physics.heightAt(x,z),safe=x>=-700&&x<=650&&z>=-930&&z<=1100&&!physics.inWater(x,z,y)&&!physics.blockedAt(x,z,y,1,1.85);
 let road=Infinity;for(const r of meta.roads)for(let i=1;i<r.points.length;i++)road=Math.min(road,segmentDistance({x,z},r.points[i-1],r.points[i])-r.width/2);
 const value={id,ix,iz,x,y,z,safe,cost:road<=-1?1:road<=2?1.35:road<8?3:7};cache.set(id,value);return value;
}
function nearest(p){let best=null;for(let radius=0;radius<8;radius++){for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const n=node(Math.round(p.x/size)+dx,Math.round(p.z/size)+dz);if(n.safe&&(!best||Math.hypot(n.x-p.x,n.z-p.z)<Math.hypot(best.x-p.x,best.z-p.z)))best=n;}if(best)return best;}throw Error('No clear checkpoint node: '+JSON.stringify(p));}
class Heap{list=[];push(v){const a=this.list;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}pop(){const a=this.list,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].f<a[child].f)child++;if(a[child].f>=last.f)break;a[i]=a[child];i=child;}a[i]=last;}return top;}}
function path(from,to){
 const a=nearest(from),b=nearest(to),open=new Heap(),scores=new Map([[a.id,0]]),parents=new Map(),closed=new Set();open.push({node:a,f:Math.hypot(a.x-b.x,a.z-b.z)});
 while(open.list.length){const current=open.pop().node;if(closed.has(current.id))continue;if(current.id===b.id){const result=[b];while(parents.has(result[0].id))result.unshift(parents.get(result[0].id));return[from,...result.map(({x,y,z})=>({x,y,z})),to];}closed.add(current.id);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(!dx&&!dz)continue;const next=node(current.ix+dx,current.iz+dz);if(!next.safe||closed.has(next.id)||Math.abs(next.y-current.y)>.42)continue;if(dx&&dz&&(!node(current.ix+dx,current.iz).safe||!node(current.ix,current.iz+dz).safe))continue;const score=scores.get(current.id)+Math.hypot(dx,dz)*size*(current.cost+next.cost)/2;if(score<(scores.get(next.id)??Infinity)){scores.set(next.id,score);parents.set(next.id,current);open.push({node:next,f:score+Math.hypot(next.x-b.x,next.z-b.z)});}}
 }
 throw Error('No walkable Sapporo checkpoint route '+from.id+' to '+to.id);
}
for(const cp of meta.checkpoints)cp.y=physics.heightAt(cp.x,cp.z);
meta.spawn.y=meta.checkpoints[0].y;
for(const arena of Object.values(meta.bossArenas))arena.center.y=physics.heightAt(arena.center.x,arena.center.z);
meta.route=[];const legs=[];
for(let i=1;i<meta.checkpoints.length;i++){
 const raw=path(meta.checkpoints[i-1],meta.checkpoints[i]),dedup=raw.filter((p,j)=>!j||Math.hypot(p.x-raw[j-1].x,p.z-raw[j-1].z)>.01),out=[];
 for(let j=0;j<dedup.length;j++){const p=dedup[j];if(j>0&&j<dedup.length-1){const a=out[out.length-1],b=dedup[j+1],cross=(p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x);if(Math.abs(cross)<.0001&&Math.abs(p.y-a.y)<.02&&Math.abs(b.y-p.y)<.02)continue;}out.push(p);}
 let distance=0;for(let j=1;j<out.length;j++)distance+=Math.hypot(out[j].x-out[j-1].x,out[j].z-out[j-1].z);legs.push({from:meta.checkpoints[i-1].id,to:meta.checkpoints[i].id,points:out.length,distance});meta.route.push(...out.slice(i===1?0:1));
}
let samples=0;for(let i=1;i<meta.route.length;i++){const a=meta.route[i-1],b=meta.route[i],length=Math.hypot(b.x-a.x,b.z-a.z);for(let d=0;d<=length;d+=.4){const t=length?d/length:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=physics.heightAt(x,z);if(physics.blockedAt(x,z,y,.55,1.8)||physics.inWater(x,z,y))throw Error(`Blocked blue line at ${x},${z}`);samples++;}}
await writeFile(resolve(root,'src/world/sapporo-map-meta.ts'),'/** Coordinates traced from the current authored Sapporo Blender/GLB; metres, Y-up. */\nexport const SAPPORO_MAP_META = '+JSON.stringify(meta,null,2)+' as const;\nexport type SapporoPoint={x:number;y:number;z:number};\nexport type SapporoRoad={id:string;width:number;points:readonly SapporoPoint[]};\n');
const report={generated:true,sourceModelModified:false,method:'Source road traces preferred by A*, source collision/water/height respected; 0.4m line samples checked',routePoints:meta.route.length,checkpoints:meta.checkpoints,legs,samples,totalDistance:legs.reduce((sum,leg)=>sum+leg.distance,0)};await writeFile(resolve(root,'release/sapporo-integration/route-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
