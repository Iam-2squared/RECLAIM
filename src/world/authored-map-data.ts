import type { AuthoredMapPhysicsData } from './authored-map-physics.ts';

export interface AuthoredVisualMesh {
  name:string;positions:readonly number[];indices:readonly number[];
  normals?:readonly number[];colors?:readonly number[];uvs?:readonly number[];normalUvs?:readonly number[];
  texture?:string;normalTexture?:string;normalScale?:number;roughness?:number;
  water?:boolean;doubleSided?:boolean;houseLayer?:string;warehouseLayer?:string;
}
export interface AuthoredAtmosphere {
  preset:string;zenithColor:readonly number[];horizonColor:readonly number[];
  cloudDarkColor:readonly number[];cloudLightColor:readonly number[];magentaColor:readonly number[];
  fogColor:readonly number[];sunColor:readonly number[];skyFillColor:readonly number[];groundFillColor:readonly number[];
  keyStrength:number;fillStrength:number;exposure:number;saturation:number;contrast:number;
  cloudCoverage:number;sunDirection?:readonly number[];
}
export type AuthoredMapData = AuthoredMapPhysicsData & {
  meshes:readonly AuthoredVisualMesh[];structures?:readonly AuthoredVisualMesh[];
  textures?:Record<string,{url:string;repeat?:boolean}>;
  colorsLinear?:boolean;atmosphere:AuthoredAtmosphere;
  vegetation?:{prototypes:readonly AuthoredVisualMesh[];instances:readonly {prototype:string;position:readonly number[];scale:readonly number[];rotation:number}[]};
  boundary?:{hardLimit:number;safetyMargin?:number;warningStart?:number;fogStart?:number;fogEnd?:number;color?:readonly number[]};
};

const cached:{desktop:Promise<AuthoredMapData>|null;mobile:Promise<AuthoredMapData>|null}={desktop:null,mobile:null};

/** Native decode avoids a second, equally large binary string. The bounded
 * fallback keeps older browsers from holding the entire atob result at once. */
export function authoredBase64Bytes(encoded:string):Uint8Array<ArrayBuffer> {
  const native=(Uint8Array as unknown as {fromBase64?:(value:string)=>Uint8Array<ArrayBuffer>}).fromBase64;
  if(native)return native.call(Uint8Array,encoded);
  const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0,bytes=new Uint8Array(encoded.length/4*3-padding);
  let offset=0;
  for(let start=0;start<encoded.length;start+=65536){const binary=atob(encoded.slice(start,start+65536));for(let index=0;index<binary.length;index++)bytes[offset++]=binary.charCodeAt(index);}
  return bytes;
}

function inflateAuthoredBase64(encoded:string):Response {
  if(typeof DecompressionStream!=='function')throw Error('新しい知床マップにはChromeまたはEdgeの新しいバージョンが必要です。');
  const bytes=authoredBase64Bytes(encoded);
  // A Blob copies its input. Feed the decoded buffer directly to decompression.
  const stream=new ReadableStream<BufferSource>({start(controller){controller.enqueue(bytes);controller.close();}});
  return new Response(stream.pipeThrough(new DecompressionStream('gzip')));
}

function validateAuthoredMapData(data:AuthoredMapData):AuthoredMapData {
  if(!Array.isArray(data.meshes)||!data.meshes.length||!Array.isArray(data.structures)||!data.structures.length||data.atmosphere?.preset!=='purple_storm')throw Error('最新の知床マップを読み込めませんでした。');
  return data;
}

/** Direct mobile transport avoids retaining the 54 MB standalone viewer and
 * its base64 texture/terrain strings. The packaged geometry is unchanged. */
export async function decodeAuthoredMapGzip(response:Response):Promise<AuthoredMapData> {
  const bytes=new Uint8Array(await response.arrayBuffer());
  const stream=new ReadableStream<BufferSource>({start(controller){controller.enqueue(bytes);controller.close();}});
  // Some static servers transparently decode .gz files; accept that response
  // as JSON too instead of attempting to decompress an already-decoded body.
  const compressed=bytes[0]===0x1f&&bytes[1]===0x8b;
  if(compressed&&typeof DecompressionStream!=='function')throw Error('知床マップの展開には新しいバージョンのブラウザが必要です。');
  const decoded=new Response(compressed?stream.pipeThrough(new DecompressionStream('gzip')):stream);
  return validateAuthoredMapData(await decoded.json() as AuthoredMapData);
}

/** Decode the exact payload used by the supplied viewer; never execute its HTML. */
export function decodeAuthoredMapHtml(html:string):Promise<AuthoredMapData> {
  const encoded=html.match(/\bconst\s+terrainGzipBase64\s*=\s*["']([A-Za-z0-9+/=]+)["']/)?.[1];
  if(!encoded)return Promise.reject(Error('新しい知床マップの地形データが見つかりません。'));
  // Return the response promise directly so the full viewer HTML is not retained
  // in a suspended async frame while its large JSON payload is being decoded.
  try{return inflateAuthoredBase64(encoded).json().then((data:AuthoredMapData)=>validateAuthoredMapData(data));}catch(error){return Promise.reject(error);}
}

/** Lazy, shared decode: the standalone file already embeds this viewer once. */
export function loadAuthoredMapData(options:{mobile?:boolean}={}):Promise<AuthoredMapData> {
  const key=options.mobile?'mobile':'desktop';
  if(cached[key])return cached[key]!;
  cached[key]=(async()=>{
    const node=typeof document==='undefined'?null:document.getElementById('reclaim-authored-map');
    let html:string;
    if(node){
      const payload=JSON.parse(node.textContent??'{}') as {htmlGzipBase64?:unknown};
      if(typeof payload.htmlGzipBase64!=='string')throw Error('同梱された知床マップが破損しています。');
      html=await inflateAuthoredBase64(payload.htmlGzipBase64).text();
    }else if(options.mobile){
      const response=await fetch(`${import.meta.env?.BASE_URL??'/'}home-map/shiretoko-mobile.json.gz`);
      if(!response.ok)throw Error(`知床マップを読み込めませんでした (${response.status})。`);
      return decodeAuthoredMapGzip(response);
    }else{
      const response=await fetch(`${import.meta.env?.BASE_URL??'/'}home-map/shiretoko.html`);
      if(!response.ok)throw Error(`知床マップを読み込めませんでした (${response.status})。`);
      html=await response.text();
    }
    return decodeAuthoredMapHtml(html);
  })().catch(error=>{cached[key]=null;throw error;});
  return cached[key]!;
}
