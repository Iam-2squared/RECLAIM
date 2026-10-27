import type {SapporoPhysicsData} from './sapporo-map-physics.ts';

export interface SapporoMapPayload {glbGzipBase64:string;metadata:SapporoPhysicsData;photoDataUrl?:string}
export interface SapporoMapData {compressed:Uint8Array<ArrayBuffer>;metadata:SapporoPhysicsData}
let cached:Promise<SapporoMapData>|null=null;
function base64Bytes(value:string):Uint8Array<ArrayBuffer>{
 const native=(Uint8Array as unknown as {fromBase64?:(s:string)=>Uint8Array<ArrayBuffer>}).fromBase64;if(native)return native.call(Uint8Array,value);
 const bytes=new Uint8Array(value.length/4*3-(value.endsWith('==')?2:value.endsWith('=')?1:0));let offset=0;
 for(let start=0;start<value.length;start+=65536){const chunk=atob(value.slice(start,start+65536));for(let i=0;i<chunk.length;i++)bytes[offset++]=chunk.charCodeAt(i);}return bytes;
}
export async function decodeSapporoGlb(bytes:Uint8Array<ArrayBuffer>):Promise<ArrayBuffer>{
 if(bytes[0]===103&&bytes[1]===108&&bytes[2]===84&&bytes[3]===70)return bytes.buffer;
 if(bytes[0]!==31||bytes[1]!==139)throw Error('札幌マップの圧縮データが破損しています。');
 if(typeof DecompressionStream!=='function')throw Error('札幌の読み込みには最新版のChromeまたはEdgeが必要です。');
 const stream=new ReadableStream<BufferSource>({start(c){c.enqueue(bytes);c.close();}});return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export function loadSapporoMapData():Promise<SapporoMapData>{
 if(cached)return cached;
 cached=(async()=>{
  const embedded=typeof document==='undefined'?null:document.getElementById('reclaim-sapporo-map');
  if(embedded){const payload=JSON.parse(embedded.textContent??'{}') as SapporoMapPayload;if(typeof payload.glbGzipBase64!=='string'||!payload.metadata?.colliders?.length)throw Error('同梱された札幌マップを読み込めませんでした。');return{compressed:base64Bytes(payload.glbGzipBase64),metadata:payload.metadata};}
  const base=import.meta.env.BASE_URL;
  const [geometry,physics]=await Promise.all([fetch(`${base}sapporo-map/city.glb.gz`),fetch(`${base}sapporo-map/physics.json`)]);
  if(!geometry.ok||!physics.ok)throw Error(`札幌マップを読み込めませんでした (${geometry.status}/${physics.status})。`);
  const [buffer,metadata]=await Promise.all([geometry.arrayBuffer(),physics.json() as Promise<SapporoPhysicsData>]);
  if(!metadata.colliders?.length||!metadata.floors?.length)throw Error('札幌の道路と建物データがありません。');return{compressed:new Uint8Array(buffer),metadata};
 })().catch(error=>{cached=null;throw error;});return cached;
}
