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

let cached:Promise<AuthoredMapData>|null=null;

async function gunzipBase64(encoded:string):Promise<string> {
  if(typeof DecompressionStream!=='function')throw Error('新しい知床マップにはChromeまたはEdgeの新しいバージョンが必要です。');
  const binary=atob(encoded),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** Decode the exact payload used by the supplied viewer; never execute its HTML. */
export async function decodeAuthoredMapHtml(html:string):Promise<AuthoredMapData> {
  const encoded=html.match(/\bconst\s+terrainGzipBase64\s*=\s*["']([A-Za-z0-9+/=]+)["']/)?.[1];
  if(!encoded)throw Error('新しい知床マップの地形データが見つかりません。');
  const data=JSON.parse(await gunzipBase64(encoded)) as AuthoredMapData;
  if(!Array.isArray(data.meshes)||!data.meshes.length||!Array.isArray(data.structures)||!data.structures.length||data.atmosphere?.preset!=='purple_storm')throw Error('最新の知床マップを読み込めませんでした。');
  return data;
}

/** Lazy, shared decode: the standalone file already embeds this viewer once. */
export function loadAuthoredMapData():Promise<AuthoredMapData> {
  if(cached)return cached;
  cached=(async()=>{
    const node=typeof document==='undefined'?null:document.getElementById('reclaim-authored-map');
    let html:string;
    if(node){
      const payload=JSON.parse(node.textContent??'{}') as {htmlGzipBase64?:unknown};
      if(typeof payload.htmlGzipBase64!=='string')throw Error('同梱された知床マップが破損しています。');
      html=await gunzipBase64(payload.htmlGzipBase64);
    }else{
      const response=await fetch(`${import.meta.env.BASE_URL}home-map/shiretoko.html`);
      if(!response.ok)throw Error(`知床マップを読み込めませんでした (${response.status})。`);
      html=await response.text();
    }
    return decodeAuthoredMapHtml(html);
  })().catch(error=>{cached=null;throw error;});
  return cached;
}
