import {farCoastReliefV5} from './coast-relief-v5.ts';
/** Original, condensed Shiretoko terrain. Metres, Y up, inland = negative Z.
 * No dependencies on the existing world, campaign, HOME or save system. */
export const TERRAIN = Object.freeze({ extent: 1200, cell: 5, chunk: 300, seed: 431071, sea: 0 });
export type Point = { x: number; z: number };
export type Waypoint = Point & { y: number };
export const ROUTE: readonly Waypoint[] = [
  { x: -170, z: 850, y: 108 }, { x: -155, z: 780, y: 108 },
  { x: -90, z: 700, y: 104 }, { x: -50, z: 610, y: 100 },
  { x: -120, z: 520, y: 96 }, { x: -130, z: 410, y: 92 },
  { x: 0, z: 310, y: 94 }, { x: 100, z: 200, y: 100 },
  { x: 60, z: 100, y: 112 }, { x: 70, z: 0, y: 124 },
  { x: -30, z: -100, y: 140 }, { x: -130, z: -180, y: 148 },
  { x: -140, z: -310, y: 155 }, { x: -130, z: -440, y: 169 },
  { x: -40, z: -540, y: 200 }, { x: 80, z: -640, y: 238 },
  { x: 140, z: -760, y: 288 }, { x: 170, z: -850, y: 335 },
];
export const LOCATIONS = [
  { id: 'cape', name: '崖上の敷地', en: 'THE HEADLAND', x: -170, z: 850 },
  { id: 'wetland', name: '知床の湿原', en: 'THE WETLAND', x: -130, z: 410 },
  { id: 'lake', name: '湖と高原', en: 'LAKE & PLATEAU', x: -140, z: -310 },
  { id: 'mountain', name: '内陸の山岳', en: 'THE HIGHLANDS', x: 170, z: -850 },
] as const;
export type Basin = Point & { id: string; rx: number; rz: number; level: number; depth: number; phase: number };
export const BASINS: readonly Basin[] = [
  { id: 'west-pool', x: -248, z: 302, rx: 76, rz: 48, level: 90, depth: 3.5, phase: 1.3 },
  { id: 'east-pool', x: 187, z: 434, rx: 91, rz: 61, level: 92, depth: 4, phase: 2.1 },
  { id: 'marsh-pool', x: -10, z: 490, rx: 61, rz: 36, level: 90.5, depth: 2.5, phase: 4.2 },
  { id: 'upper-pool', x: 259, z: 70, rx: 62, rz: 51, level: 113, depth: 5, phase: 2.8 },
  { id: 'highland-lake', x: 136, z: -325, rx: 180, rz: 132, level: 149, depth: 21, phase: 0.7 },
];
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function hash(x: number, z: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ TERRAIN.seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
function fbm(x: number, z: number): number {
  return noise(x, z) * .54 + noise(x * 2.03 + 12, z * 2.03 - 18) * .27 + noise(x * 4.17 - 41, z * 4.17) * .13 + noise(x * 8.23, z * 8.23 + 37) * .06;
}
const WIDTH = [[-10080, -1200], [-9600, -380], [-9000, 0], [-8100, 1350], [-6800, 2270], [-5500, 2710], [-4000, 1900], [-1900, 1100], [-1200, 800], [-900, 690], [-600, 605], [-300, 520], [0, 455], [300, 374], [550, 292], [750, 202], [900, 133], [1000, 68], [1080, 0], [1200, -170]];
const LEVEL = [[-10080, 0], [-9000, 25], [-8000, 135], [-6500, 295], [-5000, 310], [-4000, 270], [-1200, 267], [-850, 220], [-600, 180], [-350, 163], [-150, 146], [0, 122], [200, 98], [450, 94], [650, 101], [850, 108], [1200, 106]];
function interpolate(points: number[][], z: number): number {
  for (let i = 1; i < points.length; i++) if (z <= points[i][0]) return mix(points[i - 1][1], points[i][1], smooth(points[i - 1][0], points[i][0], z));
  return points[points.length - 1][1];
}
export function coastDistance(x: number, z: number): number {
  const center = -110 + 112 * Math.sin((850 - z) * .0012) - 60 * smooth(500, 1000, z);
  let width = interpolate(WIDTH, z);
  const side = x > center ? 1 : -1;
  // Distant20m shore vertices cannot resolve the old17m ripple. Remove only
  // that geometric frequency and attenuate the60m detail beyond the frozen
  // join. The270m cove scale remains; main and near coasts are bit unchanged.
  const shoreFilter=smooth(-4240,-4560,z);
  // Non-periodic, differently sized coves and rock noses. The two coasts do NOT
  // share an extruded outline or a sinusoidal sequence of identical scallops.
  width += (noise(z * .0037, side * 31) - .5) * 61 + (noise(z * .017, side * 43) - .5) * 21*(1-shoreFilter*.8);
  const sectors = side > 0 ? [[910, 39, 24], [740, 72, 46], [610, 31, -30], [390, 86, 29], [190, 61, -43], [-140, 104, 26], [-580, 79, -27], [-930, 135, 45]] : [[940, 38, -19], [790, 56, 32], [615, 88, -45], [410, 51, 46], [210, 41, -23], [-75, 107, 34], [-470, 75, -46], [-900, 148, 31]];
  for (const [at, size, offset] of sectors) width += offset * Math.exp(-(((z - at) / size) ** 2));
  // Real plateau shoulders beneath the authored water basins. A lake cannot
  // remain a high horizontal sheet above a collapsing coastal slope.
  const shoulders=side>0?[[435,150,150],[70,180,80],[-325,180,90]]:[[302,140,75]];
  for(const [at,size,offset]of shoulders)width+=offset*Math.exp(-(((z-at)/size)**2));
  width += (noise(z * .059, side * 19) - .5) * 7*(1-shoreFilter);
  return width - Math.abs(x - center);
}
export function basinDistance(b: Basin, x: number, z: number): number {
  const u = (x - b.x) / b.rx, v = (z - b.z) / b.rz, angle = Math.atan2(v, u);
  let edge = 1 + .19 * Math.sin(angle * 3 + b.phase) + .09 * Math.sin(angle * 5 - b.phase) + .04 * Math.sin(angle * 9 + 2);
  if (b.id === 'highland-lake') {
    // Mountain-fed northern inlet, a south-facing spit and two differently
    // sized coves. Geometry and the clipped water mesh use this SAME basin.
    edge += .23 * Math.exp(-(((angle + 1.16) / .27) ** 2));
    edge -= .19 * Math.exp(-(((angle - .63) / .19) ** 2));
    edge += .12 * Math.exp(-(((angle - .12) / .31) ** 2));
  }
  return Math.hypot(u, v) / edge;
}
export const CHANNELS = [{ id:'east-marsh-link', width:6.5, points:[
  {x:187,z:434,y:92},{x:160,z:445,y:91.84},{x:145,z:464,y:91.67},
  {x:127,z:470,y:91.48},{x:110,z:491,y:91.27},{x:90,z:499,y:91.12},
  {x:72,z:487,y:90.98},{x:53,z:491,y:90.85},{x:34,z:509,y:90.71},
  {x:14,z:507,y:90.59},{x:-10,z:490,y:90.5},
] }] as const;
export function channelSample(x:number,z:number) {
  let nearest:{distance:number;level:number;width:number}|null=null;
  for(const c of CHANNELS) for(let i=1;i<c.points.length;i++) {
    const a=c.points[i-1],b=c.points[i], dx=b.x-a.x,dz=b.z-a.z;
    const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz));
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(!nearest || distance<nearest.distance) nearest={distance,level:mix(a.y,b.y,t),width:c.width};
  }
  return nearest;
}
export function wetnessAt(x:number,z:number,y:number):number {
  let wet=0;
  for(const b of BASINS) wet=Math.max(wet,(1-smooth(.92,1.8,basinDistance(b,x,z)))*(1-smooth(b.level,b.level+9,y)));
  const c=channelSample(x,z);
  if(c)wet=Math.max(wet,(1-smooth(c.width,c.width+25,c.distance))*(1-smooth(c.level,c.level+7,y)));
  const marsh=smooth(80,200,z)*(1-smooth(590,690,z))*(1-smooth(96,111,y));
  const drainage=Math.sin((x+(noise(x*.009,z*.009)-.5)*26)*.036+z*.011);
  wet=Math.max(wet,marsh*(1-smooth(-.75,.22,drainage))*.82);
  return wet*smooth(-70,10,y);
}
export function routeSample(x: number, z: number) {
  let distance = Infinity, y = 0, segment = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    const a = ROUTE[i - 1], b = ROUTE[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < distance) { distance = d; y = mix(a.y, b.y, t); segment = i - 1; }
  }
  return { distance, y, segment };
}
// Connected ridge networks, with branching spurs. No stacked cones or repeated mountain primitives.
const RIDGES = [
  [[-240, -420, 60], [-300, -610, 148], [-265, -720, 194], [-135, -870, 385], [-115, -985, 349], [-70, -1080, 455], [80, -1360, 340], [100, -1950, 440], [260, -2900, 330]],
  [[-70, -1080, 455], [45, -1115, 339], [140, -1090, 368], [340, -930, 280], [435, -830, 174], [490, -760, 118]],
  [[-135, -870, 385], [-370, -940, 240], [-500, -1120, 215], [-680, -1350, 50]],
  [[140, -1090, 368], [280, -1360, 475], [480, -1570, 388], [650, -1870, 265]],
  [[80, -1360, 340], [160, -1710, 590], [-160, -2300, 480], [350, -3000, 680], [260, -3900, 550], [650, -5000, 790], [-100, -6200, 680], [-580, -7500, 430], [-200, -8540, 65]],
  [[160, -1710, 590], [-350, -1850, 410], [-700, -2320, 240], [-880, -2830, 50]],
  [[350, -3000, 680], [970, -3380, 460], [1270, -3870, 200], [1470, -4210, 40]],
  [[260, -3900, 550], [-630, -4370, 640], [-1220, -5180, 500], [-1840, -5650, 100]],
  [[650, -5000, 790], [1490, -5530, 640], [1810, -6280, 280]],
  [[-100, -6200, 680], [-1130, -6790, 590], [-1500, -7480, 110]],
  [[-260, -650, 175], [-430, -540, 83], [-490, -370, 20]],
  [[340, -930, 280], [430, -1100, 195], [620, -1220, 70]],
  [[-265, -720, 194], [-395, -695, 115], [-480, -565, 27]],
  [[340, -930, 280], [305, -740, 137], [245, -565, 29]],
];
const VALLEYS = [
  {width:65, points:[[-130,-1105,8],[-305,-956,33],[-382,-805,42],[-435,-650,24],[-460,-490,0]]},
  {width:73, points:[[85,-1180,11],[210,-1080,27],[285,-935,42],[340,-790,30],[390,-590,0]]},
  {width:55, points:[[-63,-1030,5],[-10,-900,22],[40,-770,31],[95,-620,18],[180,-480,0]]},
  {width:175, points:[[70,-2230,18],[360,-2460,57],[575,-2760,71],[760,-3030,25],[1040,-3500,0]]},
  {width:230, points:[[-200,-4100,16],[-510,-4630,70],[-870,-5060,53],[-1240,-5590,0]]},
];
function valleyCut(x:number,z:number):number {
  let cut=0;
  for(const valley of VALLEYS)for(let i=1;i<valley.points.length;i++){
    const a=valley.points[i-1],b=valley.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
    const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    cut=Math.max(cut,mix(a[2],b[2],t)*Math.exp(-((distance/valley.width)**2)*2));
  }
  return cut;
}
function ridgeHeight(x: number, z: number): number {
  const wx = x + (noise(x * .004, z * .004) - .5) * 42, wz = z + (noise(x * .004 + 50, z * .004) - .5) * 38;
  let ridge = 0;
  for (const line of RIDGES) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((wx - a[0]) * dx + (wz - a[1]) * dz) / (dx * dx + dz * dz));
    const distance = Math.hypot(wx - a[0] - dx * t, wz - a[1] - dz * t);
    const width = 250 + mix(a[2], b[2], t) * .41 + smooth(-1450, -4500, z) * 240;
    const shoulder = Math.max(0, 1 - distance / width);
    const side = (wx-a[0])*dz-(wz-a[1])*dx;
    // Asymmetric broad shoulders and a small rounded crest, not conical peaks.
    // The 80m scenery must not alias a razor-edge ridge into a regular sawtooth.
    // Only distant crests become almost fully rounded; near ridges retain crags.
    const crest = mix(shoulder, smooth(0,1,shoulder), mix(.48,.96,smooth(-1600,-4200,z)));
    const h = mix(a[2], b[2], mix(t,smooth(0,1,t),.22)) * Math.pow(crest, side>0?1.28:1.67);
    // Rounded junctions between structural ridges; no noisy multiplier on the crest.
    const join = Math.max(0, 1 - Math.abs(ridge - h) / 16);
    ridge = Math.max(ridge, h) + join * join * 4;
  }
  const incision = Math.abs(noise(wx * .007, wz * .011) * 2 - 1);
  return Math.max(0,ridge * (.94 + .055 * incision)-valleyCut(x,z)) + smooth(-400, -900, z) * (fbm(x * .012, z * .012) - .5) * 14;
}
const STACKS = [
  {x:-310,z:1050,r:22,h:43}, {x:-345,z:985,r:17,h:65}, {x:-403,z:804,r:16,h:37},
  {x:49,z:910,r:14,h:39}, {x:96,z:777,r:21,h:54}, {x:186,z:601,r:18,h:31},
  {x:-514,z:442,r:22,h:46}, {x:374,z:227,r:13,h:45}, {x:-620,z:56,r:20,h:55},
];
export function rawHeight(x: number, z: number): number {
  const coast = coastDistance(x, z), plateau = interpolate(LEVEL, z);
  if(coast < -240) return -34-Math.max(0,-coast)*.055+(fbm(x*.025,z*.025)-.5)*5;
  const mountain = z < -270 ? ridgeHeight(x, z) * (1 - smooth(-500, -270, z)) : 0;
  const undulation = (fbm(x * .009, z * .009) - .5) * (z > -140 ? 14 : 29);
  let land = plateau + undulation + mountain;
  const wetland = smooth(-30, 180, z) * (1 - smooth(580, 700, z));
  // Peat ridges have an authored drainage direction. Sub-metre hummocks are
  // sampled by the same 5m collision mesh, not a second visual displacement.
  const peatWarp=(noise(x*.009,z*.009)-.5)*26;
  const swale=Math.sin((x+peatWarp)*.036+z*.011);
  land += wetland * ((noise(x*.029+z*.007,z*.011)-.5)*3.1 + swale*1.05 + (noise(x*.125,z*.105)-.5)*1.1);
  for(const [bx,bz,dx,dz,height] of [[-75,443,.72,.69,1.8],[-189,374,.41,.91,1.2],[42,358,.82,-.57,1.5],[230,523,.6,.8,1.3]]){
    const along=(x-bx)*dx+(z-bz)*dz,across=-(x-bx)*dz+(z-bz)*dx;
    land+=wetland*height*Math.exp(-((along/48)**2)-((across/9)**2));
  }
  for (const b of BASINS) {
    const d = basinDistance(b, x, z);
    const mountainShore = b.id === 'highland-lake' ? smooth(-310, -465, z) : 0;
    const shore = b.id === 'highland-lake' ? mix(1.80,1.28,mountainShore) : 1.46;
    const influence = 1 - smooth(.74, shore, d);
    const bed = b.level - b.depth * (1 - smooth(0, 1.1, d)) + smooth(.80, shore, d) * (2.4 + mountainShore * 6);
    land = mix(land, bed, influence);
    // Peat shelf on the wetland side, stonier steeper banks under the mountains.
    land -= (1-mountainShore) * Math.exp(-(((d-1.24)/.23)**2)) * 1.2;
    if(b.id==='highland-lake'){
      const shoreBand=Math.exp(-(((d-1.29)/.27)**2));
      land += shoreBand*((noise(x*.068,z*.051)-.5)*1.3 + mountainShore*(noise(x*.024,z*.037)-.5)*4.2);
    }
    // Raise ONLY missing low bank sections. Otherwise a level 113/149m water
    // sheet can spill down an adjacent lower plateau even with perfect mesh
    // clipping. Existing high mountain/rock banks remain entirely unchanged.
    const bank=smooth(.88,1.13,d)*(1-smooth(1.46,1.95,d));
    const minimumBank=b.level+1.4+(noise(x*.019,z*.023)-.5)*.8;
    land=mix(land,Math.max(land,minimumBank),bank);
  }
  const channel = channelSample(x,z);
  if (channel) land = mix(land, Math.min(land,channel.level - 1.2 + .12 * noise(x*.1,z*.1)), 1-smooth(channel.width*.52,channel.width+8,channel.distance));
  if(z>-470 && z<-180 && x>-170 && x<15) {
    const access=smooth(-170,-110,x)*(1-smooth(-30,15,x))*smooth(-470,-410,z)*(1-smooth(-230,-180,z));
    land=mix(land,Math.min(land,155-(x+140)*.024),access);
  }
  const route = routeSample(x, z);
  const corridor = Math.min(185, 30 + Math.abs(land-route.y)*1.1);
  land = mix(land, route.y, 1 - smooth(9, corridor, route.distance));
  // Narrow, gentle path microrelief breaks the former perfectly smooth strip;
  // its <12cm amplitude cannot hide a step or change the route's safety margin.
  land += (noise(x*.115,z*.105)-.5)*.22*(1-smooth(0,18,route.distance));
  const site = Math.hypot((x + 170) / 1.2, z - 850);
  land = mix(land, 108, 1 - smooth(28, 53, site));
  // Structural rock masses: reef/talus, a lower broken bed, the large headwall
  // and a recessed upper bench. Heights and retreats differ by coastal sector.
  const sector = noise(z * .004, x > -90 ? 18 : -18);
  const coastalSide=x > -110?1:-1;
  const dip = (noise(z*.009,coastalSide*61)-.5)*16+clamp(coast,-30,100)*(.04+sector*.04);
  const joint = noise(z*.037+coast*.009,coastalSide*89);
  const fracture = smooth(.61,.84,joint)*(4+sector*11);
  const faceDistance=coast-fracture;
  const apron = smooth(-108 - sector*31, -11, coast);
  const lower = smooth(-12+dip, 3+dip+sector*17, faceDistance);
  const capeHeadwall=Math.exp(-(((z-850)/70)**2));
  const wallStart = 32+dip+(1-capeHeadwall)*(sector*16-7), wallEnd = wallStart + 12 + sector*6 + (1-capeHeadwall)*(8+sector*17);
  const wall = smooth(wallStart,wallEnd,faceDistance);
  const bench = smooth(11+dip, 27+dip+sector*8, faceDistance);
  const upper = smooth(wallEnd+3, 91 + sector*19, coast);
  const seabed = -34 - Math.max(0, -coast) * .055 + (fbm(x * .025, z * .025) - .5) * 5;
  const collapses=coastalSide<0?[[620,88,.98],[55,112,1],[-640,137,.96]]:[[650,100,.98],[-705,140,.97]];
  let structuralCollapse=0;for(const [at,size,strength]of collapses)structuralCollapse=Math.max(structuralCollapse,strength*Math.exp(-(((z-at)/size)**2)));
  const siteProtection=1-Math.exp(-(((z-850)/85)**2));
  const failure = Math.max(smooth(.45,.79,noise(z*.008,coastalSide*71))*.72,structuralCollapse)*siteProtection;
  const lowerWeight=.08+sector*.10, benchWeight=(1-capeHeadwall)*(.10+sector*.12), upperWeight=.10;
  const intact=lowerWeight*lower+benchWeight*bench+(1-lowerWeight-benchWeight-upperWeight)*wall+upperWeight*upper;
  const fallen=smooth(-38-sector*22,127+sector*29,coast);
  let height = seabed*(1-apron) + (3+sector*4)*apron + (land-(3+sector*4))*mix(intact,fallen,failure);
  // Large scars retreat the upper edge as well as replacing the headwall by a
  // wide debris fan. These sectors are separated from the site and lake rims.
  height-=structuralCollapse*siteProtection*(land*.11+3)*smooth(6,40,coast)*(1-smooth(105,190,coast));
  const exposure = smooth(-25,5,coast)*(1-smooth(65,115,coast));
  // Diagonal strata are subordinate to the large rock masses. Their displacement
  // is geometric; no display-only cliff or floating collision-free stones.
  height += exposure * ((noise(z*.047+x*.017,x*.039)-.5)*7 + Math.sin((height+x*.14+z*.067)*.22)*1.3);
  for (const stack of STACKS) {
    const angle=Math.atan2(z-stack.z,x-stack.x);
    const sx=(x-stack.x)/stack.r,sz=(z-stack.z)/(stack.r*.75);
    const r = mix(Math.hypot(sx,sz),Math.max(Math.abs(sx+sz*.18)*.91,Math.abs(sz-sx*.12)),.78)/(1+.15*Math.sin(angle*3+stack.h)+.1*Math.sin(angle*5));
    if (r < 2.3) {
      const foot = 1-smooth(.65,2.3,r), core = 1-smooth(stack.h>40?.57:.35,.94,r);
      const strata = (noise(x*.13,z*.13)-.5)*4+1.4*Math.sin((x*.22+z*.14)+stack.h);
      height = Math.max(height,-29+(stack.h*.28+29)*foot+(stack.h*.72+strata)*core);
    }
  }
  // v4 resolves the shore at 20m inside the 80m scenery. The old transition
  // still left a 270m headwall mostly intact between z=-4200 and -5800.
  // Distribute that rise into the existing broad talus/shore shelf immediately
  // behind the joined row. The first 40m (including ±5m normal probes) stays
  // identical. Main/near remain unchanged; far coast frequencies are filtered
  // above as well. No display-only displacement or denser fog is involved.
  const distantCoast=smooth(-4240,-4560,z);
  if(distantCoast>0){
    const slopeWidth=300+noise(z*.0011,coastalSide*137)*100;
    const lowCoastalSlope=mix(seabed,land,smooth(-110,slopeWidth,coast));
    height=mix(height,lowCoastalSlope,distantCoast);
  }
  return mix(height,108,1-smooth(28,53,site));
}
export type ChunkData = { positions: Float32Array; normals: Float32Array; occlusion: Float32Array; wetness: Float32Array; exposure:Float32Array; indices: Uint32Array; cx: number; cz: number };
export class ShiretokoTerrain {
  readonly count = TERRAIN.extent * 2 / TERRAIN.cell + 1;
  readonly heights: Float32Array;
  constructor() {
    this.heights = new Float32Array(this.count ** 2);
    for (let z = 0; z < this.count; z++) for (let x = 0; x < this.count; x++) this.heights[z * this.count + x] = rawHeight(x * TERRAIN.cell - TERRAIN.extent, z * TERRAIN.cell - TERRAIN.extent);
    this.carveDrainage();
  }
  private carveDrainage(): void {
    // Deterministic D8 rainfall accumulation cuts branching gullies into mountain flanks.
    // Coast, wetlands, the authored path and the outer 20m border remain untouched.
    const order: number[] = [], flow = new Float32Array(this.heights.length).fill(1), cut = new Float32Array(this.heights.length);
    for (let z = 2; z < 140; z++) for (let x = 2; x < this.count - 2; x++) if (this.grid(x,z) > 225) order.push(z * this.count + x);
    order.sort((a,b) => this.heights[b] - this.heights[a]);
    for (const i of order) {
      const x = i % this.count, z = Math.floor(i / this.count); let next = -1, slope = 0;
      for (let dz=-1;dz<=1;dz++) for (let dx=-1;dx<=1;dx++) {
        if (!dx && !dz) continue;
        const n = i + dz*this.count + dx, grade=(this.heights[i]-this.heights[n])/Math.hypot(dx,dz);
        if (grade > slope) { slope=grade; next=n; }
      }
      if (next >= 0) flow[next] += flow[i];
      const px=x*5-1200,pz=z*5-1200;
      const weight=smooth(-1180,-1090,pz)*(1-smooth(-570,-490,pz))*smooth(35,100,coastDistance(px,pz))*smooth(38,75,routeSample(px,pz).distance);
      cut[i] = Math.min(17,Math.pow(Math.log2(flow[i]+1),1.45)*.63)*smooth(225,350,this.heights[i])*weight;
    }
    for (const i of order) {
      let amount=cut[i]*.32;
      for (const offset of [-1,1,-this.count,this.count]) amount += cut[i+offset]*.12;
      for(const offset of [-this.count-1,-this.count+1,this.count-1,this.count+1])amount+=cut[i+offset]*.05;
      const z=Math.floor(i/this.count)*5-1200;
      if (z > -1180) this.heights[i] -= amount;
    }
  }
  grid(x: number, z: number): number {
    return this.heights[clamp(z, 0, this.count - 1) * this.count + clamp(x, 0, this.count - 1)];
  }
  heightAt(x: number, z: number): number {
    const gx = clamp((x + TERRAIN.extent) / TERRAIN.cell, 0, this.count - 1.000001), gz = clamp((z + TERRAIN.extent) / TERRAIN.cell, 0, this.count - 1.000001);
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const a = this.grid(ix, iz), b = this.grid(ix + 1, iz), c = this.grid(ix, iz + 1), d = this.grid(ix + 1, iz + 1);
    // Identical b–c diagonal to chunk(); collision does not use an approximate second surface.
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  inWater(x: number, z: number): boolean {
    const y = this.heightAt(x, z);
    const channel = channelSample(x,z);
    return y < 1 || BASINS.some(b => basinDistance(b, x, z) < 1.46 && y < b.level + .5) || Boolean(channel && channel.distance < channel.width+8 && y < channel.level+.5);
  }
  slopeAt(x: number, z: number): number {
    return Math.hypot(this.heightAt(x + .35, z) - this.heightAt(x - .35, z), this.heightAt(x, z + .35) - this.heightAt(x, z - .35)) / .7;
  }
  /** Shared by the walking mesh and both scenery LODs, including all seam attributes. */
  surfaceAt(x: number, z: number): number {
    return Math.abs(x)<=TERRAIN.extent && Math.abs(z)<=TERRAIN.extent ? this.heightAt(x,z) : farCoastReliefV5(x,z,rawHeight,coastDistance);
  }
  vertexAt(x: number, z: number) {
    const at=(a:number,b:number)=>this.surfaceAt(a,b), y=at(x,z);
    const nx=at(x-5,z)-at(x+5,z), nz=at(x,z-5)-at(x,z+5), length=Math.hypot(nx,10,nz);
    const nearby=(at(x+15,z)+at(x-15,z)+at(x,z+15)+at(x,z-15))/4;
    let occlusion=clamp(1-Math.max(0,nearby-y)*.022,.54,1), sunlight=1;
    const shadowWeight=smooth(0,90,1200-Math.max(Math.abs(x),Math.abs(z)));
    if (y>0 && shadowWeight>0) for (const distance of [12,28,60,110,200,340,530]) {
      const sx=x-distance*.898, sz=z+distance*.442;
      // The shadow smoothly expires at the boundary. AO and normals remain identical across it.
      if(Math.abs(sx)>=1200 || Math.abs(sz)>=1200) continue;
      sunlight=Math.min(sunlight,1-smooth(0,9,this.heightAt(sx,sz)-y-distance*.954));
    }
    occlusion*=1-(1-sunlight)*.54*shadowWeight;
    const slope=1-10/length,shore=coastDistance(x,z);
    const exposure=Math.max(smooth(.08,.47,slope),smooth(-20,5,shore)*(1-smooth(65,115,shore))*.93,smooth(310,550,y)*.74);
    return {y,normal:[nx/length,10/length,nz/length],occlusion,wetness:wetnessAt(x,z,y),exposure};
  }
  chunk(cx: number, cz: number, step = TERRAIN.cell, size = TERRAIN.chunk): ChunkData {
    if (size % step || step < TERRAIN.cell || step % TERRAIN.cell) throw new Error('Unaligned terrain grid');
    const segments = size / step, side = segments + 1, positions = new Float32Array(side ** 2 * 3), normals = new Float32Array(positions.length), occlusion = new Float32Array(side ** 2), wetness = new Float32Array(side ** 2), exposure = new Float32Array(side ** 2), indices = new Uint32Array(segments ** 2 * 6);
    for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
      const px = cx * size + x * step, pz = cz * size + z * step, index = z * side + x;
      const v = this.vertexAt(px,pz);
      positions.set([px,v.y,pz], index*3); normals.set(v.normal,index*3);
      occlusion[index] = v.occlusion; wetness[index] = v.wetness; exposure[index]=v.exposure;
    }
    let index = 0;
    for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
      const a = z * side + x, b = a + 1, c = a + side, d = c + 1;
      indices.set([a, c, b, b, c, d], index); index += 6;
    }
    return { positions, normals, occlusion, wetness, exposure, indices, cx, cz };
  }
}
