import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'../日本各地/札幌/札幌_3D');
const output=resolve(root,'public/sapporo-map');
const raw=await readFile(resolve(source,'札幌_街全体.glb'));
const sourceManifest=await readFile(resolve(source,'city_manifest.json'));
const city=JSON.parse(sourceManifest);
const jsonLength=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+jsonLength));
const binary=raw.subarray(28+jsonLength);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});
await mkdir(resolve(root,'release/sapporo-integration'),{recursive:true});

function accessor(index){
 const a=json.accessors[index],view=json.bufferViews[a.bufferView],bytes=binary.subarray((view.byteOffset??0)+(a.byteOffset??0),(view.byteOffset??0)+(a.byteOffset??0)+view.byteLength);
 const component=a.componentType===5126?Float32Array:a.componentType===5125?Uint32Array:Uint16Array;
 return {a,values:new component(bytes.buffer,bytes.byteOffset,a.count*(a.type==='VEC3'?3:a.type==='VEC2'?2:1))};
}
const floors=[],water=[];
for(const node of json.nodes){
 if(node.mesh===undefined)continue;
 const isWater=/Water(?:Deep)?$/.test(node.name),isFloor=/Ground_Ground|Asphalt|Sidewalk|Path|civic_paving|ss_paving/.test(node.name)&&!/roof|ceiling|canopy/i.test(node.name);
 if(!isWater&&!isFloor)continue;
 for(const primitive of json.meshes[node.mesh].primitives){
  const p=accessor(primitive.attributes.POSITION).values,indices=accessor(primitive.indices).values;
  for(let i=0;i<indices.length;i+=3){
   const ai=indices[i]*3,bi=indices[i+1]*3,ci=indices[i+2]*3;
   const t=[p[ai],p[ai+1],p[ai+2],p[bi],p[bi+1],p[bi+2],p[ci],p[ci+1],p[ci+2]];
   const area=(t[3]-t[0])*(t[8]-t[2])-(t[6]-t[0])*(t[5]-t[2]);
   if(Math.abs(area)<1e-5||Math.max(t[1],t[4],t[7])>3||Math.min(t[1],t[4],t[7])<-.5)continue;
   (isWater?water:floors).push(t.map(n=>Math.round(n*1e5)/1e5));
  }
 }
}
const colliders=city.collision_boxes.map((b,i)=>({type:'aabb',minX:b.center[0]-b.size[0]/2,maxX:b.center[0]+b.size[0]/2,minY:b.center[1]-b.size[1]/2,maxY:b.center[1]+b.size[1]/2,minZ:b.center[2]-b.size[2]/2,maxZ:b.center[2]+b.size[2]/2,tag:`sapporo:source:${i}`}));
const tv=city.anchors.tv.position;
colliders.push({type:'aabb',minX:tv[0]-14.5,maxX:tv[0]+14.5,minZ:tv[2]-12.5,maxZ:tv[2]+12.5,minY:0,maxY:13.9,tag:'sapporo:tv-podium'});
for(const x of [-15,15])for(const z of [-15,15])colliders.push({type:'aabb',minX:tv[0]+x-1.45,maxX:tv[0]+x+1.45,minZ:tv[2]+z-1.45,maxZ:tv[2]+z+1.45,minY:0,maxY:2.1,tag:'sapporo:tv-footing'});
colliders.push({type:'cylinder',x:city.anchors.fountain.position[0],z:city.anchors.fountain.position[2],radius:10,minY:0,maxY:2,tag:'sapporo:fountain-basin'});
const metadata={version:city.version,sourceGlbSha256:hash(raw),coordinateSystem:city.coordinate_system,bounds:city.bounds,sourceGeometry:city.geometry,colliders,floors,water};
await writeFile(resolve(output,'physics.json'),JSON.stringify(metadata));

await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const compressed=[],views=[],bufferOffsets=[];let packedLength=0,roundTrip=true;
for(const [i,view]of json.bufferViews.entries()){
 const a=json.accessors.find(a=>a.bufferView===i);
 if(!a)throw Error(`Unreferenced Sapporo bufferView ${i}`);
 const stride=view.byteLength/a.count,mode=view.target===34963?'INDICES':'ATTRIBUTES';
 const original=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
 const bytes=MeshoptEncoder.encodeGltfBuffer(original,a.count,stride,mode);
 const decoded=new Uint8Array(original.length);MeshoptDecoder.decodeGltfBuffer(decoded,a.count,stride,bytes,mode);
 if(!Buffer.from(decoded).equals(original))throw Error(`Lossless map verification failed at view ${i}`);
 const padding=(4-bytes.length%4)%4;
 views.push({...view,buffer:1,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:packedLength,byteLength:bytes.length,byteStride:stride,count:a.count,mode}}});
 bufferOffsets.push(packedLength);compressed.push(Buffer.from(bytes),Buffer.alloc(padding));packedLength+=bytes.length+padding;
}
const packedBinary=Buffer.concat(compressed),outJson={...json,buffers:[{byteLength:packedBinary.length},{byteLength:json.buffers[0].byteLength,extensions:{EXT_meshopt_compression:{fallback:true}}}],bufferViews:views,extensionsUsed:[...(json.extensionsUsed??[]),'EXT_meshopt_compression'],extensionsRequired:[...(json.extensionsRequired??[]),'EXT_meshopt_compression']};
const j=Buffer.from(JSON.stringify(outJson)),jp=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+jp.length+packedBinary.length,8);header.writeUInt32LE(jp.length,12);header.write('JSON',16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(packedBinary.length);binHeader.write('BIN\0',4);
const packedGlb=Buffer.concat([header,jp,binHeader,packedBinary]);
const gzip=gzipSync(packedGlb,{level:9});await writeFile(resolve(output,'city.glb.gz'),gzip);
const record={version:city.version,source:'日本各地/札幌/札幌_3D/札幌_街全体.blend + 札幌_街全体.glb',sourceModelModified:false,sourceGlbBytes:raw.length,sourceGlbSha256:hash(raw),sourceManifestSha256:hash(sourceManifest),runtimeFile:'city.glb.gz',runtimeBytes:gzip.length,runtimeSha256:hash(gzip),decodedGlbBytes:packedGlb.length,decodedGlbSha256:hash(packedGlb),compression:'lossless EXT_meshopt_compression + gzip; every decoded buffer verified byte-for-byte',meshoptViews:views.length,physicsFile:'physics.json',physicsSha256:hash(Buffer.from(JSON.stringify(metadata))),floorTriangles:floors.length,waterTriangles:water.length,colliders:colliders.length,geometry:city.geometry,anchors:city.anchors,photoFile:'deployment.webp'};
await writeFile(resolve(output,'manifest.json'),JSON.stringify(record,null,2)+'\n');
await writeFile(resolve(root,'release/sapporo-integration/map-assets.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({rawBytes:raw.length,meshoptBytes:packedGlb.length,gzipBytes:gzip.length,roundTrip,views:views.length,floorTriangles:floors.length,waterTriangles:water.length,colliders:colliders.length}));
