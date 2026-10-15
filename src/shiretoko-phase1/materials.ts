import * as T from 'three';
import { noise, ShiretokoTerrain } from './terrain.ts';

const atmospheric = `
vec3 atmosphere(vec3 color, vec3 p) {
  float distanceToEye = length(cameraPosition - p);
  float fog = 1. - exp(-distanceToEye * .000082);
  vec3 haze = mix(vec3(.075,.12,.16), vec3(.17,.225,.26), clamp((p.y+40.)/950.,0.,1.));
  return mix(color,haze,clamp(fog,0.,.97));
}`;
const vertex = `
attribute float aOcclusion;
varying vec3 vP; varying vec3 vN; varying float vOcc;
void main(){vP=(modelMatrix*vec4(position,1.)).xyz;vN=normalize(mat3(modelMatrix)*normal);vOcc=aOcclusion;gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);}`;

/** Original tile, made from our deterministic lattice noise, not a downloaded asset. */
export function detailTexture(): T.DataTexture {
  const size = 512, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Periodic sampling avoids seams on all three projections.
    const px = Math.cos(x / size * Math.PI * 2), py = Math.sin(x / size * Math.PI * 2);
    const zx = Math.cos(y / size * Math.PI * 2), zy = Math.sin(y / size * Math.PI * 2);
    const n = (frequency: number) => noise((px + zx * .67) * frequency + 50, (py + zy * .67) * frequency - 30);
    const grain = n(120), medium = n(30), broad = n(5);
    const strata = Math.sin(y / size * Math.PI * 2 * 28 + n(12) * 4) * .5 + .5;
    const crack = Math.pow(1 - Math.abs(n(42) * 2 - 1), 18);
    const i = (y * size + x) * 4;
    data[i] = (grain * .42 + medium * .38 + broad * .2) * 255;
    data[i + 1] = Math.max(.05, grain * .3 + medium * .35 + strata * .2 + broad * .15 - crack * .2) * 255;
    data[i + 2] = broad * 255; data[i + 3] = 255;
  }
  const texture = new T.DataTexture(data, size, size, T.RGBAFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}
export function heightTexture(terrain: ShiretokoTerrain): T.DataTexture {
  const data = new Uint8Array(terrain.heights.length * 4);
  for (let i = 0; i < terrain.heights.length; i++) {
    const value = Math.round(T.MathUtils.clamp((terrain.heights[i] + 100) / 1200, 0, 1) * 65535);
    data.set([value >>> 8, value & 255, 0, 255], i * 4);
  }
  const texture = new T.DataTexture(data, terrain.count, terrain.count, T.RGBAFormat);
  texture.minFilter = texture.magFilter = T.LinearFilter; texture.needsUpdate = true; return texture;
}
export function terrainMaterial(detail: T.Texture): T.ShaderMaterial {
  return new T.ShaderMaterial({
    uniforms: { uDetail: { value: detail }, uElevation: { value: 0 }, uSun: { value: new T.Vector3(-.65, .69, .32).normalize() } },
    vertexShader: vertex,
    fragmentShader: `
    uniform sampler2D uDetail; uniform float uElevation; uniform vec3 uSun;
    varying vec3 vP; varying vec3 vN; varying float vOcc;
    ${atmospheric}
    vec3 elevation(float h) {
      vec3 c=mix(vec3(.11,.25,.25),vec3(.38,.48,.25),smoothstep(0.,170.,h));
      c=mix(c,vec3(.65,.51,.29),smoothstep(170.,380.,h));
      return mix(c,vec3(.88,.89,.82),smoothstep(380.,720.,h));
    }
    void main(){
      vec3 n=normalize(vN); vec3 w=pow(abs(n),vec3(4.));w/=max(.001,w.x+w.y+w.z);
      vec3 tri=texture2D(uDetail,vP.zy*.055).rgb*w.x+texture2D(uDetail,vP.xz*.055).rgb*w.y+texture2D(uDetail,vP.xy*.055).rgb*w.z;
      vec3 ground=texture2D(uDetail,vP.xz*.18).rgb;
      float macro=texture2D(uDetail,vP.xz*.0009).b;
      float surfacePatch=texture2D(uDetail,vP.xz*.0041).r;
      float slope=1.-n.y;
      float rock=max(smoothstep(.07,.44,slope),smoothstep(290.,490.,vP.y)*.86);
      rock=max(rock,smoothstep(.59,.72,surfacePatch)*.35);
      vec3 moss=mix(vec3(.21,.255,.11),vec3(.35,.325,.185),macro*.78+ground.r*.18);
      moss*=.77+ground.r*.44;
      vec3 stone=mix(vec3(.21,.235,.235),vec3(.43,.425,.38),tri.g);
      stone*=.78+tri.g*.52;
      vec3 albedo=mix(moss,stone,rock);
      float wet=(1.-smoothstep(87.,105.,vP.y))*(1.-rock)*.16;
      albedo=mix(albedo,vec3(.15,.19,.115),wet);
      float snow=smoothstep(430.+macro*115.,615.+macro*80.,vP.y)*(1.-smoothstep(.32,.71,slope));
      snow*=smoothstep(.26,.54,tri.r+macro*.17);
      albedo=mix(albedo,vec3(.77,.805,.79)*( .87+ground.r*.2),snow);
      // Fine derivative shading supplements the 5m geometric surface; it never changes collision.
      float micro=dot(tri,vec3(.2,.7,.1));
      vec3 dx=dFdx(vP),dy=dFdy(vP);
      vec3 bump=normalize(n-cross(n,normalize(dy)) * dFdx(micro)*.5-cross(normalize(dx),n)*dFdy(micro)*.5);
      float direct=max(0.,dot(bump,uSun));
      float ambient=.34+.22*max(0.,n.y);
      vec3 lighting=vec3(.75,.84,.94)*ambient+vec3(1.1,1.03,.87)*direct*.82;
      float terrainShadow=1.-(1.-smoothstep(-760.,-430.,vP.z))*smoothstep(.1,.58,-n.x)*.18;
      vec3 color=albedo*.43*lighting*vOcc*terrainShadow;
      color=mix(color,elevation(vP.y)*(.48+direct*.6),uElevation);
      gl_FragColor=vec4(atmosphere(color,vP),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}
export function waterMaterial(detail: T.Texture, height: T.Texture, level: number, basin?: { x: number; z: number; rx: number; rz: number; phase: number }): T.ShaderMaterial {
  return new T.ShaderMaterial({
    uniforms: { uDetail: { value: detail }, uHeight: { value: height }, uTime: { value: 0 }, uLevel: { value: level }, uBasin: { value: new T.Vector4(basin?.x ?? 0, basin?.z ?? 0, basin?.rx ?? 0, basin?.rz ?? 0) }, uPhase: { value: basin?.phase ?? 0 } },
    vertexShader: `varying vec3 vP;void main(){vP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);}`,
    fragmentShader: `
    uniform sampler2D uDetail; uniform sampler2D uHeight; uniform float uTime; uniform float uLevel; uniform vec4 uBasin; uniform float uPhase;
    varying vec3 vP;
    ${atmospheric}
    void main(){
      if(uBasin.z>0.){
        vec2 uv=(vP.xz-uBasin.xy)/uBasin.zw;
        float a=atan(uv.y,uv.x);
        float edge=1.+.13*sin(a*3.+uPhase)+.068*sin(a*7.-uPhase)+.035*sin(a*11.+2.);
        if(length(uv)/edge>1.2)discard;
      }
      vec2 flow=vec2(uTime*.0018,-uTime*.0009);
      float grain=texture2D(uDetail,vP.xz*.034+flow).r;
      float n2=texture2D(uDetail,vP.xz*.009-flow*.8).g;
      float wave=texture2D(uDetail,vP.xz*vec2(.006,.027)+flow*.2).g;
      vec3 normal=normalize(vec3((grain-.5)*.13,1.,(n2-.5)*.16));
      vec3 view=normalize(cameraPosition-vP);
      float fresnel=pow(1.-max(0.,dot(view,normal)),3.5);
      vec3 deep=uBasin.z>0.?vec3(.008,.023,.027):vec3(.005,.017,.028);
      vec3 color=mix(deep,vec3(.09,.15,.21),.12+fresnel*.7);
      color+=(grain-.5)*.007+wave*.005;
      vec2 uv=(vP.xz+1200.)/2400.*(480./481.)+.5/481.;
      vec2 encoded=texture2D(uHeight,clamp(uv,0.,1.)).rg;
      float floorY=(encoded.r*255.*256.+encoded.g*255.)/65535.*1200.-100.;
      float foam=uBasin.z>0.?0.:(1.-smoothstep(0.,11.,uLevel-floorY))*(.3+wave*.45+grain*.25);
      if(abs(vP.x)<1199.&&abs(vP.z)<1199.)color=mix(color,vec3(.34,.4,.41),foam*.83);
      vec3 reflection=reflect(-normalize(vec3(-.65,.69,.32)),normal);
      float glint=pow(max(0.,dot(reflection,view)),130.);
      color+=vec3(.7,.65,.5)*glint*.6;
      gl_FragColor=vec4(atmosphere(color,vP),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}
export function createSky(): T.Mesh {
  return new T.Mesh(new T.SphereGeometry(11000, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
    varying vec3 vP;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){
      vec3 d=normalize(vP); float h=max(0.,d.y);
      vec3 color=mix(vec3(.22,.31,.38),vec3(.035,.085,.16),pow(h,.55));
      vec2 uv=d.xz/(.18+max(.01,d.y))*1.9;
      float n=noise(uv)*.55+noise(uv*2.1)*.28+noise(uv*4.5)*.17;
      float cloud=smoothstep(.5,.75,n)*smoothstep(.01,.18,h)*(1.-smoothstep(.5,.95,h));
      color=mix(color,vec3(.42,.47,.49),cloud*.6);
      float sun=pow(max(0.,dot(d,normalize(vec3(-.65,.69,.32)))),22.);
      color+=vec3(.26,.21,.13)*sun;
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
}
