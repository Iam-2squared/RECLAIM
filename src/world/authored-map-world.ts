import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldQuality } from './types.ts';
import { createAuthoredMapPhysics } from './authored-map-physics.ts';
import { AUTHORED_MAP_META } from './authored-map-meta.ts';
import { loadAuthoredMapData, type AuthoredMapData, type AuthoredVisualMesh } from './authored-map-data.ts';
import { createShiretokoEncounterLayout } from './shiretoko-encounter-layout.ts';

const SOURCE_ROTATION=new T.Matrix4().makeRotationX(-Math.PI/2);
const CELL_SIZE=96;
type Cell={x:number;z:number;group:T.Group;instances:number};
type SourceRange={name:string;vertexStart:number;vertexCount:number;indexStart:number;indexCount:number};
type StaticPart={source:AuthoredVisualMesh;buffer:T.BufferGeometry;material:T.MeshStandardMaterial;order:number};

/** Map geometry is immutable after construction; actors remain ordinary scene children. */
class StaticMapGroup extends T.Group {
  private frozen=false;
  freeze(){super.updateMatrixWorld(true);this.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});this.frozen=true;}
  override updateMatrixWorld(force?:boolean){if(!this.frozen)super.updateMatrixWorld(force);}
}
type TextureFactory=(name:string,definition:{url:string;repeat?:boolean})=>Promise<T.Texture>;

export function authoredVisualGeometry(source:AuthoredVisualMesh,linearColors:boolean):T.BufferGeometry {
  const result=new T.BufferGeometry();
  result.setAttribute('position',new T.Float32BufferAttribute(source.positions,3));
  if(source.normals?.length===source.positions.length)result.setAttribute('normal',new T.Float32BufferAttribute(source.normals,3));
  // BufferGeometry reads this array without modifying it; avoid an extra full index copy.
  result.setIndex(source.indices as number[]);
  if(!result.hasAttribute('normal'))result.computeVertexNormals();
  if(source.colors?.length===source.positions.length){
    const values=new Float32Array(source.colors),color=new T.Color();
    if(!linearColors)for(let i=0;i<values.length;i+=3){color.setRGB(values[i],values[i+1],values[i+2],T.SRGBColorSpace);values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
    result.setAttribute('color',new T.BufferAttribute(values,3));
  }
  if(source.uvs?.length)result.setAttribute('uv',new T.Float32BufferAttribute(source.uvs,2));
  if(source.normalUvs?.length)result.setAttribute('uv1',new T.Float32BufferAttribute(source.normalUvs,2));
  result.applyMatrix4(SOURCE_ROTATION);result.computeBoundingBox();result.computeBoundingSphere();
  return result;
}

/** Same static noise and colour layers as the supplied purple-storm viewer. */
function stormSky(data:AuthoredMapData):T.Mesh {
  const a=data.atmosphere;
  const vector=(values:readonly number[])=>new T.Vector3(values[0],values[1],values[2]);
  const material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:false,toneMapped:false,
    uniforms:{zenith:{value:vector(a.zenithColor)},horizon:{value:vector(a.horizonColor)},cloudDark:{value:vector(a.cloudDarkColor)},cloudLight:{value:vector(a.cloudLightColor)},magenta:{value:vector(a.magentaColor)},coverage:{value:a.cloudCoverage},tone:{value:new T.Vector3(a.exposure,a.saturation,a.contrast)},fogColor:{value:vector(a.fogColor)},fogRange:{value:new T.Vector2(data.boundary?.fogStart??570,data.boundary?.fogEnd??665)}},
    vertexShader:`varying vec3 skyDirection;void main(){skyDirection=position;vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=vec4(clip.xy,clip.w*.999999,clip.w);}`,
    fragmentShader:`precision highp float;varying vec3 skyDirection;uniform vec3 zenith,horizon,cloudDark,cloudLight,magenta,tone,fogColor;uniform float coverage;uniform vec2 fogRange;
float hashNoise(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise2(vec2 p){vec2 cell=floor(p),t=fract(p);t=t*t*(3.-2.*t);return mix(mix(hashNoise(cell),hashNoise(cell+vec2(1.,0.)),t.x),mix(hashNoise(cell+vec2(0.,1.)),hashNoise(cell+vec2(1.,1.)),t.x),t.y);}
float phaseFog(vec3 p){vec2 e=vec2(p.x/500.,(p.z-230.)/200.);float r=clamp(1.-dot(e,e),0.,1.);r=r*r*(3.-2.*r);return r*smoothstep(fogRange.x,fogRange.y,p.y)*(1.-smoothstep(800.,930.,p.y));}
float skyFog(vec3 eye,vec3 ray){vec3 signDirection=step(vec3(0.),ray)*2.-1.;vec3 inv=1./(signDirection*max(abs(ray),vec3(.00001)));vec3 a=(vec3(-500.,fogRange.x,30.)-eye)*inv,b=(vec3(500.,930.,430.)-eye)*inv;vec3 nearD=min(a,b),farD=max(a,b);float begin=max(0.,max(nearD.x,max(nearD.y,nearD.z))),end=min(farD.x,min(farD.y,farD.z));if(end<=begin)return 0.;float stepLength=(end-begin)/8.,density=0.;for(int i=0;i<8;i++)density+=phaseFog(eye+ray*(begin+(float(i)+.5)*stepLength));return min(.97,1.-exp(-density*stepLength*.012));}
void main(){vec3 world=normalize(skyDirection),d=vec3(world.x,-world.z,world.y);float height=smoothstep(.015,.86,max(d.z,0.));vec3 sky=mix(horizon,zenith,height);vec2 p=vec2(dot(d,vec3(.89,.45,.05))*3.7,d.z*6.2+dot(d.xy,vec2(-.2,.1))*.6);float n0=noise2(p*.55+vec2(4.5,12.4)),n1=noise2(p*1.10+vec2(2.1,5.7)),n2=noise2(p*2.20+vec2(17.8,8.2)),n3=noise2(p*4.40+vec2(31.6,27.1));float field=n0*.50+n1*.27+n2*.15+n3*.08,wide=n0*.64+n1*.27+n2*.09,threshold=.66-.28*clamp(coverage,0.,1.),mask=smoothstep(-.035,.14,d.z),veil=smoothstep(threshold-.15,threshold+.14,wide),body=smoothstep(threshold-.08,threshold+.13,field+.035*d.y);sky=mix(sky,mix(cloudLight,cloudDark,.38+.35*n2),veil*mask*.48);sky=mix(sky,mix(cloudLight,cloudDark,.60+.30*body),body*mask*.80);float glow=pow(max(dot(d,normalize(vec3(-.55,.72,.22))),0.),8.),rim=smoothstep(threshold-.12,threshold-.025,field)*(1.-smoothstep(threshold+.025,threshold+.12,field));sky=mix(sky,magenta,glow*(.075*(1.-body*.75)+.13*rim)*mask);sky=pow(max(pow(max(sky,vec3(0.)),vec3(2.2))*tone.x,vec3(0.)),vec3(1./2.2));vec3 eye=vec3(cameraPosition.x,-cameraPosition.z,cameraPosition.y);sky=mix(sky,fogColor,skyFog(eye,d));float l=dot(sky,vec3(.2126,.7152,.0722));sky=mix(vec3(l),sky,tone.y);gl_FragColor=vec4(clamp((sky-.5)*tone.z+.5,0.,1.),1.);}`});
  const sky=new T.Mesh(new T.SphereGeometry(1,32,16),material);sky.name='authored:purple-storm-sky';sky.frustumCulled=false;sky.renderOrder=-1000;
  sky.onBeforeRender=(_renderer,_scene,camera)=>{sky.position.copy(camera.position);sky.updateMatrixWorld();};
  return sky;
}

/** All visual geometry is the authored source. The loader owns no RAF/input. */
export class AuthoredMapWorld {
  readonly data:AuthoredMapData;
  readonly worldId=AUTHORED_MAP_META.worldId;
  readonly scene=new T.Scene();
  readonly physics;
  readonly encounterLayout;
  readonly area;
  readonly terrain;
  colliders;
  readonly spawn;
  readonly bounds;
  quality:WorldQuality;
  private readonly cells:Cell[]=[];
  private readonly staticMap=new StaticMapGroup();
  private readonly mapMeshes:T.Mesh[]=[];
  private readonly materialCache=new Map<string,T.MeshStandardMaterial>();
  private readonly normalVariants=new Map<string,T.Texture>();
  private readonly geometries=new Set<T.BufferGeometry>();
  private readonly materials=new Set<T.Material>();
  private readonly textures=new Set<T.Texture>();
  private readonly sky:T.Mesh;
  private disposed=false;
  private lastX=NaN;private lastZ=NaN;private loaded=0;private unloaded=0;private visibleCells=0;
  private visibilityQuality:WorldQuality|null=null;private gpuGeometryBytes=0;private authoredRenderMeshes=0;
  private readonly loadMs:number;
  private readonly vegetationCount:number;

  constructor(data:AuthoredMapData,quality:WorldQuality,textures:Map<string,T.Texture>){
    this.data=data;
    const start=performance.now();this.quality=quality;this.encounterLayout=createShiretokoEncounterLayout(data);this.physics=createAuthoredMapPhysics(data,[this.encounterLayout]);this.area=this.physics.area;this.terrain=this.physics;this.colliders=this.physics.colliders;this.spawn=this.physics.spawn;this.bounds=this.physics.bounds;
    this.scene.name='mission:shiretoko-authored';this.scene.background=new T.Color().setRGB(...data.atmosphere.horizonColor as [number,number,number],T.SRGBColorSpace);
    this.sky=stormSky(data);this.scene.add(this.sky,this.staticMap);this.mapMeshes.push(this.sky);this.geometries.add(this.sky.geometry);this.materials.add(this.sky.material as T.Material);
    for(const texture of textures.values())this.textures.add(texture);
    const a=data.atmosphere;
    const skyFill=new T.Color().setRGB(a.skyFillColor[0],a.skyFillColor[1],a.skyFillColor[2],T.SRGBColorSpace),groundFill=new T.Color().setRGB(a.groundFillColor[0],a.groundFillColor[1],a.groundFillColor[2],T.SRGBColorSpace);
    this.staticMap.add(new T.HemisphereLight(skyFill,groundFill,a.fillStrength*2.4));
    const sunColor=new T.Color().setRGB(a.sunColor[0],a.sunColor[1],a.sunColor[2],T.SRGBColorSpace),sun=new T.DirectionalLight(sunColor,a.keyStrength*2.2);sun.position.set(-420,1000,500);this.staticMap.add(sun);
    this.addAuthoredMeshes([...data.meshes,...(data.structures??[])],textures);
    for(const source of this.encounterLayout.meshes){
      const buffer=authoredVisualGeometry(source,!!data.colorsLinear),mesh=new T.Mesh(buffer,this.material(source,textures));
      mesh.name=source.name;mesh.userData.encounterSource=true;mesh.renderOrder=-300;
      this.geometries.add(buffer);this.staticMap.add(mesh);this.mapMeshes.push(mesh);
    }
    const prototypes=new Map((data.vegetation?.prototypes??[]).map(prototype=>[prototype.name,prototype]));
    const groups=new Map<string,{prototype:string;x:number;z:number;placements:NonNullable<AuthoredMapData['vegetation']>['instances'][number][]}>();
    for(const placement of data.vegetation?.instances??[]){
      const x=Math.floor(placement.position[0]/CELL_SIZE),z=Math.floor(-placement.position[1]/CELL_SIZE),key=`${placement.prototype}:${x}:${z}`;
      if(!groups.has(key))groups.set(key,{prototype:placement.prototype,x,z,placements:[]});groups.get(key)!.placements.push(placement);
    }
    const buffers=new Map<string,T.BufferGeometry>(),materials=new Map<string,T.Material>();
    const matrix=new T.Matrix4(),rotation=new T.Quaternion(),scale=new T.Vector3(),position=new T.Vector3();
    for(const group of groups.values()){
      const prototype=prototypes.get(group.prototype);if(!prototype)throw Error(`Unknown authored vegetation: ${group.prototype}`);
      if(!buffers.has(group.prototype)){const buffer=authoredVisualGeometry(prototype,!!data.colorsLinear);buffers.set(group.prototype,buffer);this.geometries.add(buffer);materials.set(group.prototype,this.material(prototype,textures));}
      const instances=new T.InstancedMesh(buffers.get(group.prototype)!,materials.get(group.prototype)!,group.placements.length);instances.name=`authored:${group.prototype}:${group.x}:${group.z}`;
      for(const [index,p] of group.placements.entries()){position.set(p.position[0],p.position[2],-p.position[1]);rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP,p.rotation);scale.set(p.scale[0],p.scale[2],p.scale[1]);matrix.compose(position,rotation,scale);instances.setMatrixAt(index,matrix);}
      instances.instanceMatrix.needsUpdate=true;instances.computeBoundingBox();instances.computeBoundingSphere();
      const cell=new T.Group();cell.name=instances.name;cell.visible=false;cell.add(instances);this.staticMap.add(cell);this.mapMeshes.push(instances);this.cells.push({x:(group.x+.5)*CELL_SIZE,z:(group.z+.5)*CELL_SIZE,group:cell,instances:group.placements.length});
    }
    this.vegetationCount=data.vegetation?.instances.length??0;
    this.addOpeningRadio();this.staticMap.freeze();
    for(const buffer of this.geometries){for(const attr of Object.values(buffer.attributes))this.gpuGeometryBytes+=attr.array.byteLength;this.gpuGeometryBytes+=buffer.index?.array.byteLength??0;}
    this.update(this.spawn.x,this.spawn.z);this.loadMs=performance.now()-start;
  }

  private addAuthoredMeshes(sources:readonly AuthoredVisualMesh[],textures:Map<string,T.Texture>){
    const groups=new Map<string,StaticPart[]>();
    for(const [order,source] of sources.entries()){
      const buffer=authoredVisualGeometry(source,!!this.data.colorsLinear),material=this.material(source,textures);
      // Keep wide terrain/trail meshes individually culled. Only nearby parts of
      // the same fixed building/yard can share a draw without expanding map visibility.
      const zone=source.houseLayer?'house':source.warehouseLayer?'warehouse':source.name.startsWith('Yard /')?'yard':`source-${order}`;
      const layout=Object.entries(buffer.attributes).map(([name,attribute])=>`${name}:${attribute.itemSize}:${attribute.normalized}`).sort().join(',');
      const key=`${zone}/${material.uuid}/${layout}`;if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push({source,buffer,material,order});
    }
    for(const parts of groups.values()){
      const buffers=parts.map(part=>part.buffer),buffer=parts.length>1?mergeGeometries(buffers,false):buffers[0];
      if(!buffer)throw Error('Authored static geometry layouts differ.');
      if(parts.length>1){buffer.computeBoundingBox();buffer.computeBoundingSphere();for(const old of buffers)old.dispose();}
      this.geometries.add(buffer);const object=new T.Mesh(buffer,parts[0].material),ranges:SourceRange[]=[];let vertexStart=0,indexStart=0;
      for(const part of parts){const vertexCount=part.buffer.getAttribute('position').count,indexCount=part.buffer.index!.count;ranges.push({name:part.source.name,vertexStart,vertexCount,indexStart,indexCount});vertexStart+=vertexCount;indexStart+=indexCount;}
      object.name=parts.length===1?parts[0].source.name:`authored:static-batch:${parts[0].source.name}`;
      object.userData.authoredSource=true;object.userData.authoredRanges=ranges;
      // Material sharing must not reorder the source surfaces against one another.
      object.renderOrder=-500+parts[0].order;this.staticMap.add(object);this.mapMeshes.push(object);this.authoredRenderMeshes++;
    }
  }

  private material(source:AuthoredVisualMesh,textures:Map<string,T.Texture>):T.MeshStandardMaterial {
    const maskTerrain=/Terrain_Surface|Coastal_Cliffs/.test(source.name),mask=this.encounterLayout.groundMask;
    const key=JSON.stringify([!!source.colors?.length,source.texture??null,source.normalTexture??null,!!source.normalUvs?.length,source.normalScale??.5,!!source.water,source.roughness??(source.water?.28:.84),source.doubleSided===false,maskTerrain]);
    const cached=this.materialCache.get(key);if(cached)return cached;
    const normal=source.normalTexture?textures.get(source.normalTexture):undefined;
    let normalMap=normal;
    if(normal&&source.normalUvs?.length){const variant=`${source.normalTexture}:1`;normalMap=this.normalVariants.get(variant);if(!normalMap){normalMap=normal.clone();normalMap.channel=1;normalMap.needsUpdate=true;this.normalVariants.set(variant,normalMap);this.textures.add(normalMap);}}
    const material=new T.MeshStandardMaterial({color:0xffffff,vertexColors:!!source.colors?.length,map:source.texture?textures.get(source.texture)??null:null,normalMap:normalMap??null,normalScale:new T.Vector2(source.normalScale??.5,source.normalScale??.5),metalness:source.water?.04:0,roughness:source.roughness??(source.water?.28:.84),side:source.doubleSided===false?T.FrontSide:T.DoubleSide});
    const b=this.data.boundary,a=this.data.atmosphere;
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vAuthoredPosition;').replace('#include <project_vertex>',`#include <project_vertex>\nvec4 authoredPoint=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nauthoredPoint=instanceMatrix*authoredPoint;\n#endif\nvAuthoredPosition=(modelMatrix*authoredPoint).xyz;`);
      // Cut exactly the regular polygon covered by the replacement earthworks;
      // original buffers/UVs remain intact and no hidden terrain can poke through.
      if(maskTerrain){const sector=Math.PI*2/mask.sides,inner=mask.radius*Math.cos(sector/2);shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>\nvec2 encounterOffset=vAuthoredPosition.xz-vec2(${mask.center.x.toFixed(5)},${mask.center.z.toFixed(5)});float encounterSquared=dot(encounterOffset,encounterOffset);if(encounterSquared<${(inner*inner).toFixed(12)})discard;if(encounterSquared<${(mask.radius*mask.radius).toFixed(12)}){float encounterAngle=mod(atan(encounterOffset.y,encounterOffset.x),${sector.toFixed(12)})-${(sector/2).toFixed(12)};float encounterEdge=${inner.toFixed(12)}/cos(encounterAngle);if(encounterSquared<encounterEdge*encounterEdge)discard;}`);}
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vAuthoredPosition;').replace('#include <fog_fragment>',`#include <fog_fragment>\nvec3 authoredFogColor=vec3(${a.fogColor.join(',')});float authoredDistance=distance(cameraPosition,vAuthoredPosition);float authoredFog=smoothstep(1100.,2000.,authoredDistance)*.20;${source.water?'authoredFog=0.;':''}vec3 authoredSource=vec3(vAuthoredPosition.x,-vAuthoredPosition.z,vAuthoredPosition.y);vec2 authoredEllipse=vec2(authoredSource.x/500.,(authoredSource.z-230.)/200.);float authoredRadial=clamp(1.-dot(authoredEllipse,authoredEllipse),0.,1.);authoredRadial=authoredRadial*authoredRadial*(3.-2.*authoredRadial);float authoredPhase=authoredRadial*smoothstep(${(b?.fogStart??570).toFixed(3)},${(b?.fogEnd??665).toFixed(3)},authoredSource.y)*(1.-smoothstep(800.,930.,authoredSource.y));gl_FragColor.rgb=mix(gl_FragColor.rgb,authoredFogColor,max(authoredFog,authoredPhase*.96));`);
    };
    material.customProgramCacheKey=()=>`authored-purple-${!!source.water}-${b?.fogStart??570}-${b?.fogEnd??665}-${maskTerrain?'encounter-ground':'original'}`;
    this.materials.add(material);this.materialCache.set(key,material);return material;
  }

  private addOpeningRadio(){
    const point=AUTHORED_MAP_META.radio,group=new T.Group();group.name='runtime:opening-radio';
    const wood=new T.MeshStandardMaterial({color:0x594434,roughness:.9}),body=new T.MeshStandardMaterial({color:0x343e36,roughness:.8}),screen=new T.MeshBasicMaterial({color:0xb4d18c});
    for(const material of [wood,body,screen])this.materials.add(material);
    const box=(material:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{const buffer=new T.BoxGeometry(w,h,d);this.geometries.add(buffer);const mesh=new T.Mesh(buffer,material);mesh.position.set(x,y,z);group.add(mesh);this.mapMeshes.push(mesh);};
    box(wood,point.x,point.y-.12,point.z,1.12,.08,.62);
    for(const dx of [-.46,.46])for(const dz of [-.22,.22])box(wood,point.x+dx,point.y-.5,point.z+dz,.07,.75,.07);
    box(body,point.x,point.y+.09,point.z,.68,.34,.28);box(screen,point.x+.13,point.y+.11,point.z+.146,.23,.13,.008);box(body,point.x-.2,point.y+.1,point.z+.15,.16,.2,.012);
    this.staticMap.add(group);
  }

  /** Long gun traces include cover beyond the walking collision neighbourhood. */
  combatColliders(x:number,z:number){return this.physics.collidersNear(x,z,144);}
  /** Vision ends at 40m; include one extra margin without scanning gun-range cover. */
  sightColliders(x:number,z:number){return this.physics.collidersNear(x,z,48);}
  update(x:number,z:number){
    if(this.disposed||!Number.isFinite(x)||!Number.isFinite(z)||x===this.lastX&&z===this.lastZ&&this.visibilityQuality===this.quality)return;
    this.lastX=x;this.lastZ=z;this.visibilityQuality=this.quality;this.colliders=this.physics.collidersNear(x,z);
    const distance=this.quality==='low'?205:330;let visible=0;
    const radiusSquared=(distance+CELL_SIZE*.72)**2;
    for(const cell of this.cells){const dx=cell.x-x,dz=cell.z-z,active=dx*dx+dz*dz<radiusSquared;if(active!==cell.group.visible){if(active)this.loaded++;else this.unloaded++;cell.group.visible=active;}if(active)visible++;}
    this.visibleCells=visible;
  }
  setQuality(quality:WorldQuality){if(this.disposed||quality===this.quality)return;this.quality=quality;this.update(this.lastX,this.lastZ);}
  stats(){
    let triangles=0,instances=0,renderObjects=0;
    for(const mesh of this.mapMeshes){if(!mesh.visible||mesh.parent?.visible===false)continue;const count=(mesh as T.InstancedMesh).isInstancedMesh?(mesh as T.InstancedMesh).count:1;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*count;renderObjects++;if((mesh as T.InstancedMesh).isInstancedMesh)instances+=count;}
    return{areaId:'shiretoko',source:'authored-map',atmosphere:this.data.atmosphere.preset,quality:this.quality,activeChunks:this.visibleCells,nearChunks:this.visibleCells,farChunks:0,loadedChunks:this.loaded,unloadedChunks:this.unloaded,trees:instances,rocks:0,grass:0,instances,totalAuthoredInstances:this.vegetationCount,authoredTerrainMeshes:this.data.meshes.length,authoredStructureMeshes:this.data.structures?.length??0,authoredRenderMeshes:this.authoredRenderMeshes,geometries:this.geometries.size,materials:this.materials.size,textures:this.textures.size,triangles:Math.round(triangles),renderObjects,approximateGpuBytes:this.gpuGeometryBytes,colliders:this.colliders.length,terrainCacheEntries:0,lastLoadMs:this.loadMs,totalLoadMs:this.loadMs,disposed:this.disposed};
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.staticMap.traverse(object=>{if((object as T.InstancedMesh).isInstancedMesh)(object as T.InstancedMesh).dispose();});for(const buffer of this.geometries)buffer.dispose();for(const material of this.materials)material.dispose();for(const texture of this.textures)texture.dispose();this.geometries.clear();this.materials.clear();this.materialCache.clear();this.normalVariants.clear();this.textures.clear();this.cells.length=0;this.mapMeshes.length=0;this.gpuGeometryBytes=0;this.visibleCells=0;this.authoredRenderMeshes=0;this.colliders=[];this.staticMap.clear();this.scene.clear();this.scene.background=null;}
}

export async function createAuthoredMapWorld(data:AuthoredMapData,quality:WorldQuality='balanced',options:{textureFactory?:TextureFactory}={}):Promise<AuthoredMapWorld>{
  const textures=new Map<string,T.Texture>();
  try{
    await Promise.all(Object.entries(data.textures??{}).map(async([name,definition])=>{
      if(!definition.url.startsWith('data:image/'))throw Error('Authored terrain texture must be embedded.');
      const texture=options.textureFactory?await options.textureFactory(name,definition):await new T.TextureLoader().loadAsync(definition.url);
      texture.colorSpace=/normal/i.test(name)?T.NoColorSpace:T.SRGBColorSpace;texture.flipY=true;texture.wrapS=texture.wrapT=definition.repeat?T.RepeatWrapping:T.ClampToEdgeWrapping;texture.anisotropy=4;texture.needsUpdate=true;textures.set(name,texture);
    }));
    return new AuthoredMapWorld(data,quality,textures);
  }catch(error){for(const texture of textures.values())texture.dispose();throw error;}
}

export async function loadAuthoredMapWorld(quality:WorldQuality='balanced'):Promise<AuthoredMapWorld>{return createAuthoredMapWorld(await loadAuthoredMapData(),quality);}
