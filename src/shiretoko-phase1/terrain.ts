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
  // Broad promontories and recessed bays, with short fractures kept subordinate.
  width += 29 * Math.sin(z * .013 + side * 1.8) + 16 * Math.sin(z * .032 + side * 3.2);
  width += (noise(z * .022, side * 30) - .5) * 14 + 3 * Math.sin(z * .08 + side);
  width += 36 * Math.exp(-(((z - (side > 0 ? 730 : 420)) / 75) ** 2));
  width -= (side > 0 ? 46 : 30) * Math.exp(-(((z - (side > 0 ? 140 : 620)) / 90) ** 2));
  return width - Math.abs(x - center);
}
export function basinDistance(b: Basin, x: number, z: number): number {
  const u = (x - b.x) / b.rx, v = (z - b.z) / b.rz, angle = Math.atan2(v, u);
  const edge = 1 + .19 * Math.sin(angle * 3 + b.phase) + .09 * Math.sin(angle * 5 - b.phase) + .04 * Math.sin(angle * 9 + 2);
  return Math.hypot(u, v) / edge;
}
export const CHANNELS = [{ id:'east-marsh-link', width:6.5, points:[
  {x:187,z:434,y:92},{x:148,z:458,y:91.7},{x:119,z:481,y:91.3},
  {x:78,z:487,y:91.0},{x:39,z:505,y:90.7},{x:-10,z:490,y:90.5},
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
  [[-240, -420, 60], [-260, -650, 175], [-135, -870, 385], [-70, -1080, 455], [80, -1360, 340], [100, -1950, 440], [260, -2900, 330]],
  [[-70, -1080, 455], [140, -1090, 368], [340, -930, 280], [490, -760, 118]],
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
];
function ridgeHeight(x: number, z: number): number {
  const wx = x + (noise(x * .004, z * .004) - .5) * 42, wz = z + (noise(x * .004 + 50, z * .004) - .5) * 38;
  let ridge = 0;
  for (const line of RIDGES) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((wx - a[0]) * dx + (wz - a[1]) * dz) / (dx * dx + dz * dz));
    const distance = Math.hypot(wx - a[0] - dx * t, wz - a[1] - dz * t);
    const width = 265 + mix(a[2], b[2], t) * .42 + smooth(-1450, -4500, z) * 240;
    const shoulder = Math.max(0, 1 - distance / width);
    const h = mix(a[2], b[2], t) * Math.pow(shoulder, 1.35);
    // Rounded junctions between structural ridges; no noisy multiplier on the crest.
    const join = Math.max(0, 1 - Math.abs(ridge - h) / 16);
    ridge = Math.max(ridge, h) + join * join * 4;
  }
  const incision = Math.abs(noise(wx * .007, wz * .011) * 2 - 1);
  return ridge * (.94 + .055 * incision) + smooth(-400, -900, z) * (fbm(x * .012, z * .012) - .5) * 17;
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
  // Low elongated moraine bars, shallow drainage swales and peat hummocks, all in geometry.
  land += wetland * ((noise(x * .035, z * .018) - .5) * 2.8 + Math.sin(x * .026 + z * .013 + noise(x*.006,z*.006)*4) * 1.5);
  for (const b of BASINS) {
    const d = basinDistance(b, x, z);
    const mountainShore = b.id === 'highland-lake' ? smooth(-310, -465, z) : 0;
    const shore = b.id === 'highland-lake' ? mix(1.80,1.25,mountainShore) : 1.46;
    const influence = 1 - smooth(.74, shore, d);
    const bed = b.level - b.depth * (1 - smooth(0, 1.1, d)) + smooth(.80, shore, d) * (2.4 + mountainShore * 6);
    land = mix(land, bed, influence);
    // Peat shelf on the wetland side, stonier steeper banks under the mountains.
    land -= (1-mountainShore) * Math.exp(-(((d-1.24)/.23)**2)) * 1.2;
  }
  const channel = channelSample(x,z);
  if (channel) land = mix(land, Math.min(land,channel.level - 1.2 + .12 * noise(x*.1,z*.1)), 1-smooth(channel.width*.52,channel.width+8,channel.distance));
  if(z>-470 && z<-180 && x>-170 && x<15) {
    const access=smooth(-170,-110,x)*(1-smooth(-30,15,x))*smooth(-470,-410,z)*(1-smooth(-230,-180,z));
    land=mix(land,Math.min(land,155-(x+140)*.024),access);
  }
  const route = routeSample(x, z);
  const corridor = Math.min(130, 30 + Math.abs(land-route.y)*.8);
  land = mix(land, route.y, 1 - smooth(9, corridor, route.distance));
  const site = Math.hypot((x + 170) / 1.2, z - 850);
  land = mix(land, 108, 1 - smooth(28, 53, site));
  // A submerged reef foot, talus apron, broken lower ledge, short headwall and upper shoulder.
  // Profile and layer dip vary along the coast, rather than repeating a narrow vertical column.
  const sector = noise(z * .004, x > -90 ? 18 : -18);
  const dip = 5 * Math.sin(z * .027) + (noise(z*.019, x*.002)-.5)*8;
  const apron = smooth(-92 - sector*32, -5, coast);
  const lower = smooth(-8, 19 + sector*18, coast);
  const capeHeadwall=Math.exp(-(((z-850)/70)**2));
  const wallStart = 24 + dip, wallEnd = wallStart + 12 + sector*8 + (1-capeHeadwall)*(20+sector*25);
  const wall = smooth(wallStart,wallEnd,coast);
  const upper = smooth(wallEnd-2, 84 + sector*20, coast);
  const seabed = -34 - Math.max(0, -coast) * .055 + (fbm(x * .025, z * .025) - .5) * 5;
  const failure = smooth(.42,.78,noise(z*.012,x>0?71:-71)) * (1-Math.exp(-(((z-850)/85)**2)));
  const ledgeWeight=.12+sector*.15;
  const intact=ledgeWeight*lower+(.87-ledgeWeight)*wall+.13*upper;
  const fallen=smooth(-14-sector*20,100+sector*70,coast);
  let height = seabed*(1-apron) + 5*apron + (land-5)*mix(intact,fallen,failure*.83);
  const exposure = smooth(-25,5,coast)*(1-smooth(65,115,coast));
  height += exposure * ((noise(z*.043+x*.008,x*.025)-.5)*5 + Math.sin((height+x*.12+z*.04)*.28)*1.8);
  for (const stack of STACKS) {
    const angle=Math.atan2(z-stack.z,x-stack.x);
    const r = Math.hypot((x-stack.x)/stack.r,(z-stack.z)/(stack.r*.75))/(1+.19*Math.sin(angle*3+stack.h)+.13*Math.sin(angle*5));
    if (r < 2.3) {
      const foot = 1-smooth(.65,2.3,r), core = 1-smooth(.38,.88,r);
      const strata = 1.4*Math.sin((x*.22+z*.14)+stack.h);
      height = Math.max(height,-29+(stack.h*.28+29)*foot+(stack.h*.72+strata)*core);
    }
  }
  return mix(height,108,1-smooth(28,53,site));
}
export type ChunkData = { positions: Float32Array; normals: Float32Array; occlusion: Float32Array; wetness: Float32Array; indices: Uint32Array; cx: number; cz: number };
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
      cut[i] = Math.min(24,Math.pow(Math.log2(flow[i]+1),1.45)*.8)*smooth(225,350,this.heights[i])*weight;
    }
    for (const i of order) {
      let amount=cut[i]*.48;
      for (const offset of [-1,1,-this.count,this.count]) amount += cut[i+offset]*.13;
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
    return Math.abs(x)<=TERRAIN.extent && Math.abs(z)<=TERRAIN.extent ? this.heightAt(x,z) : rawHeight(x,z);
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
    return {y,normal:[nx/length,10/length,nz/length],occlusion,wetness:wetnessAt(x,z,y)};
  }
  chunk(cx: number, cz: number, step = TERRAIN.cell, size = TERRAIN.chunk): ChunkData {
    if (size % step || step < TERRAIN.cell || step % TERRAIN.cell) throw new Error('Unaligned terrain grid');
    const segments = size / step, side = segments + 1, positions = new Float32Array(side ** 2 * 3), normals = new Float32Array(positions.length), occlusion = new Float32Array(side ** 2), wetness = new Float32Array(side ** 2), indices = new Uint32Array(segments ** 2 * 6);
    for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
      const px = cx * size + x * step, pz = cz * size + z * step, index = z * side + x;
      const v = this.vertexAt(px,pz);
      positions.set([px,v.y,pz], index*3); normals.set(v.normal,index*3);
      occlusion[index] = v.occlusion; wetness[index] = v.wetness;
    }
    let index = 0;
    for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
      const a = z * side + x, b = a + 1, c = a + side, d = c + 1;
      indices.set([a, c, b, b, c, d], index); index += 6;
    }
    return { positions, normals, occlusion, wetness, indices, cx, cz };
  }
}
