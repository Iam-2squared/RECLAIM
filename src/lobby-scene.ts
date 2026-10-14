import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTES, type PaletteId, type GunId, type HomePreview } from './home-state';

const mat = (color: T.ColorRepresentation) => new T.MeshLambertMaterial({ color, flatShading: true });
/** Merge inert pieces by material once. No geometry/material allocation in the animation loop. */
class Parts {
  pieces = new Map<T.Material, T.BufferGeometry[]>();
  constructor(readonly root: T.Group) {}
  put(m: T.Material, geometry: T.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)));
    if (!this.pieces.has(m)) this.pieces.set(m, []);
    this.pieces.get(m)!.push(geometry);
  }
  box(m: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, rz = 0, ry = 0) {
    this.put(m, new T.BoxGeometry(1, 1, 1), x, y, z, w, h, d, 0, ry, rz);
  }
  oval(m: T.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    this.put(m, new T.SphereGeometry(1, 10, 7), x, y, z, w, h, d);
  }
  tube(m: T.Material, a: number[], b: number[], r1: number, r2 = r1, depth = 1) {
    const from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
    const g = new T.CylinderGeometry(r2, r1, delta.length(), 8, 1);
    g.scale(1, 1, depth);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    this.put(m, g, ...from.add(to).multiplyScalar(.5).toArray() as [number, number, number]);
  }
  finish() {
    this.pieces.forEach((geometries, material) => {
      const merged = mergeGeometries(geometries);
      if (!merged) throw new Error('Cannot merge lobby geometry');
      this.root.add(new T.Mesh(merged, material));
      geometries.forEach(g => g.dispose());
    });
    this.pieces.clear();
  }
}
function makeGun(id: GunId) {
  const group = new T.Group(), p = new Parts(group);
  const steel = mat(0x303735), edge = mat(0x59615b), wood = mat(id === 'rifle' ? 0x79553c : 0x51533e);
  const length = id === 'sniper' ? 1.31 : id === 'rifle' ? 1.10 : .98;
  // Local +X is the barrel. The same grip position is shared by all three poses.
  p.box(steel, .08, 0, 0, .55, .15, .13);
  p.box(wood, -.44, -.015, 0, .42, .16, .12, -.10);
  p.box(edge, -.66, -.02, 0, .04, .20, .15);
  p.box(wood, .43, .006, 0, id === 'rifle' ? .51 : .34, .12, .14);
  p.tube(steel, [.57, .025, 0], [length, .025, 0], .027, .024);
  p.tube(edge, [length, .025, 0], [length + .06, .025, 0], .037);
  p.box(steel, -.09, -.145, 0, .09, .20, .10, -.22);
  if (id !== 'rifle') p.box(steel, .10, -.19, 0, .14, .26, .10, .13);
  else p.box(edge, .10, -.10, 0, .18, .045, .11);
  if (id === 'sniper') {
    p.box(steel, .01, .15, 0, .22, .11, .04);
    p.tube(steel, [-.24, .23, 0], [.35, .23, 0], .061);
    p.tube(edge, [.29, .23, 0], [.40, .23, 0], .080);
  } else {
    p.box(edge, .58, .12, 0, .035, .12, .035);
    p.box(edge, -.15, .12, 0, .07, .07, .04);
  }
  p.finish();
  group.position.set(-.02, 1.59, .52); group.rotation.z = .10; group.rotation.y = -.035;
  return group;
}
function makeSurvivor(palette: PaletteId) {
  const group = new T.Group(), body = new T.Group(); group.add(body);
  const p = new Parts(body), color = PALETTES.find(c => c.id === palette)!;
  const fabric = mat(color.color), armor = mat(color.armor), pants = mat(0x42493f), leather = mat(0x282c28), strap = mat(0x8e8064), skin = mat(0xb79a7c), metal = mat(0x8b8b74);
  // Tapered shoulders, a narrow waist, articulated limbs and a human face under a cloth hood.
  p.tube(fabric, [0, 1.36, 0], [0, 2.18, 0], .29, .39, .62);
  p.oval(armor, 0, 1.88, .17, .30, .35, .15);
  p.box(armor, 0, 1.87, .28, .45, .41, .045);
  for (const side of [-1, 1]) {
    p.box(strap, side * .24, 1.99, .17, .055, .51, .055, side * .10);
    p.box(strap, side * .23, 1.99, -.16, .055, .52, .055, -side * .10);
    p.box(fabric, side * .17, 1.56, .30, .13, .20, .13);
    p.box(strap, side * .17, 1.65, .37, .13, .025, .014);
    // Split jacket hem leaves the thighs and belt visible.
    p.tube(fabric, [side * .22, 1.12, -.035], [side * .17, 1.53, -.035], .18, .16, .90);
    const hip = [side * .175, 1.25, 0], knee = [side * .23, .73, side < 0 ? .08 : -.01], ankle = [side * .26, .22, side < 0 ? .04 : -.07];
    p.tube(pants, hip, knee, .158, .13, .93);
    p.oval(armor, knee[0], .72, knee[2] + .1, .14, .16, .075);
    p.tube(pants, knee, ankle, .13, .105, .94);
    p.box(leather, side * .26, .095, ankle[2] + .08, .25, .16, .43);
    p.oval(leather, side * .26, .20, ankle[2], .135, .18, .17);
    p.box(armor, side * .26, .035, ankle[2] + .08, .27, .055, .46);
    p.box(strap, side * .26, .23, ankle[2] + .145, .18, .035, .025);
  }
  p.box(leather, 0, 1.37, .03, .65, .095, .37);
  p.box(metal, 0, 1.37, .232, .095, .065, .035);
  p.box(strap, .39, 1.39, -.025, .15, .24, .23);
  p.tube(fabric, [-.31, 2.16, 0], [-.48, 1.77, .07], .16, .13);
  p.oval(fabric, -.48, 1.77, .07, .135, .14, .135);
  p.tube(fabric, [-.48, 1.77, .07], [-.13, 1.46, .48], .125, .09);
  p.oval(leather, -.11, 1.47, .50, .10, .105, .095);
  p.tube(fabric, [.31, 2.16, 0], [.51, 1.79, .15], .16, .13);
  p.oval(fabric, .51, 1.79, .15, .13, .14, .13);
  p.tube(fabric, [.51, 1.79, .15], [.36, 1.61, .52], .13, .085);
  p.oval(leather, .36, 1.61, .54, .10, .09, .10);
  p.oval(armor, -.36, 2.13, 0, .16, .12, .18);
  p.oval(armor, .36, 2.13, 0, .16, .12, .18);
  p.tube(skin, [0, 2.16, 0], [0, 2.43, 0], .10);
  p.oval(fabric, 0, 2.55, -.045, .255, .295, .23);
  p.oval(skin, 0, 2.55, .13, .17, .225, .135);
  // A fabric mask and narrow goggles keep the face legible without robotic geometry.
  p.oval(pants, 0, 2.41, .18, .205, .125, .13);
  p.box(leather, 0, 2.59, .255, .295, .077, .035);
  p.box(metal, -.078, 2.59, .276, .099, .033, .012);
  p.box(metal, .078, 2.59, .276, .099, .033, .012);
  p.oval(fabric, 0, 2.29, -.04, .26, .14, .21);
  p.box(strap, -.33, 2.02, .12, .09, .075, .025);
  // Canvas pack and a sheathed katana outside the left thigh. No blade crosses the torso.
  p.oval(pants, 0, 1.92, -.28, .29, .37, .18);
  p.box(fabric, 0, 1.92, -.395, .39, .44, .10);
  p.box(strap, 0, 1.94, -.46, .39, .04, .035);
  p.tube(leather, [-.59, .24, -.17], [-.43, 1.41, -.10], .043, .045);
  p.tube(strap, [-.43, 1.42, -.10], [-.39, 1.73, -.08], .043);
  p.box(metal, -.43, 1.43, -.10, .16, .032, .11, -.13);
  for (let i = 0; i < 5; i++) p.box(leather, -.40 - i * .006, 1.49 + i * .042, -.038, .065, .018, .02, -.13);
  p.finish();
  const guns = { assault: makeGun('assault'), sniper: makeGun('sniper'), rifle: makeGun('rifle') };
  Object.values(guns).forEach(g => body.add(g));
  function equip(id: GunId) { Object.entries(guns).forEach(([key, gun]) => { gun.visible = key === id; }); }
  function appearance(id: PaletteId) { const c = PALETTES.find(v => v.id === id)!; fabric.color.set(c.color); armor.color.set(c.armor); }
  equip('assault');
  return { group, body, equip, appearance };
}
function surfaceTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!; c.fillStyle = '#797c72'; c.fillRect(0, 0, 256, 256);
  let seed = 82; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 6000; i++) { c.fillStyle = rand() > .5 ? '#555d5140' : '#c5c7b324'; c.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2); }
  c.strokeStyle = '#4a504750'; c.lineWidth = .8;
  for (let i = 0; i < 4; i++) { c.beginPath(); let x = rand() * 256, y = rand() * 256; c.moveTo(x, y); for (let j = 0; j < 5; j++) { x += rand() * 35 - 12; y += rand() * 30; c.lineTo(x, y); } c.stroke(); }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(12, 12); return texture;
}
function shadowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d')!, gradient = c.createRadialGradient(32, 32, 3, 32, 32, 32);
  gradient.addColorStop(0, '#111712b0'); gradient.addColorStop(.45, '#11171265'); gradient.addColorStop(1, '#11171200');
  c.fillStyle = gradient; c.fillRect(0, 0, 64, 64); return new T.CanvasTexture(canvas);
}
export function createLobby() {
  const scene = new T.Scene(); scene.background = new T.Color(0x8a928c); scene.fog = new T.Fog(0x8a928c, 18, 49);
  scene.add(new T.HemisphereLight(0xe4ebeb, 0x454238, 2.1));
  const key = new T.DirectionalLight(0xffedcb, 2.8); key.position.set(-3, 7, 9); scene.add(key);
  const rim = new T.DirectionalLight(0xc3d5dc, 2.4); rim.position.set(4, 5, -6); scene.add(rim);
  const floorMat = new T.MeshLambertMaterial({ color: 0xb0b1a3, map: surfaceTexture() });
  const floor = new T.Mesh(new T.PlaneGeometry(110, 110), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -.018; scene.add(floor);
  const root = new T.Group(); scene.add(root); const p = new Parts(root);
  const concrete = mat(0x737c74), broken = mat(0x555e55), steel = mat(0x3d4947), wood = mat(0x696149), canvas = mat(0x747660), rust = mat(0x6a5040), pale = mat(0xaaa88b);
  // A roof fragment and weathered supports frame an open northern shelter.
  for (const x of [-7.6, -3.7, 4.6, 8.8]) {
    p.box(concrete, x, 3.1, -5.1, .46, 6.2, .52);
    p.box(broken, x, .32, -5.1, .72, .64, .78);
    p.box(steel, x, 6.05, -1.4, .17, .32, 11.6);
  }
  p.box(concrete, .3, 6.2, -5.1, 17.6, .48, .65);
  p.box(steel, .3, 6.15, 1.6, 17.6, .24, .23);
  for (let x = -8; x < 9; x += .65) p.box(broken, x, 6.45, -3.4, .61, .10, 4.4, 0, -.025);
  // Partial walls leave the sky and distant firs visible; no animated weather.
  p.box(concrete, 8.6, 1.3, -2.6, .45, 2.6, 10);
  p.box(concrete, -7.7, 1.0, -5.5, 4.3, 2, .55);
  p.box(broken, -5.7, 1.65, -5.5, .75, 1.2, .6, -.23);
  for (let i = 0; i < 8; i++) p.box(wood, 7.3, 2.0 + i * .33, -5.25, 2.5, .26, .13, i % 3 === 0 ? .025 : 0);
  p.box(canvas, -6.35, 2.8, -5.0, 2.5, 2.6, .045, .05);
  p.box(steel, -6.35, 4.15, -5.02, 3, .07, .09);
  // A field workbench, stacked supply crates and tied canvas, kept away from the silhouettes.
  p.box(wood, 5.8, 1.13, -3.6, 2.6, .15, .9);
  for (const x of [4.7, 6.9]) p.box(steel, x, .54, -3.6, .09, 1.1, .65);
  p.box(pale, 5.45, 1.22, -3.5, .65, .025, .48, 0, .15);
  p.box(steel, 6.15, 1.37, -3.65, .43, .33, .24);
  p.tube(steel, [6.25, 1.5, -3.65], [6.25, 2.05, -3.65], .015);
  for (const [x, y, z, w] of [[-5, .4, -2, 1.1], [-4.25, .32, -2.3, .8], [-4.75, 1.05, -2.1, .72], [5.5, .35, .5, 1.1]]) {
    p.box(wood, x, y, z, w, y > 1 ? .55 : .64, .75);
    for (const s of [-1, 1]) p.box(rust, x + s * w * .34, y, z + .39, .055, y > 1 ? .55 : .65, .025);
  }
  for (let i = 0; i < 14; i++) p.box(i % 3 === 0 ? rust : concrete, -7 + i * .94, .055 + (i % 3) * .04, -5.9 + (i % 4) * .25, .13 + (i % 3) * .12, .13, .26, i * .14, i * .43);
  p.box(pale, -3.3, .006, 3.3, 1.1, .012, .045); p.box(pale, 3.7, .006, 3.3, 1.1, .012, .045);
  // Original distant conifers are scene geometry, not third-party image assets.
  const trees = mat(0x64736b);
  for (let i = 0; i < 22; i++) {
    const x = -24 + i * 2.3, z = -17 - (i % 4) * 3.1, h = 2.7 + (i * 7 % 11) * .30;
    p.put(trees, new T.ConeGeometry(1, 1, 5), x, h * .55, z, h * .36, h, h * .36);
    p.box(wood, x, .5, z, .12, 1, .12);
  }
  p.finish();
  const survivors = [makeSurvivor('olive'), makeSurvivor('slate'), makeSurvivor('clay'), makeSurvivor('olive')];
  const shadowMat = new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
  const shadows = survivors.map((s, i) => {
    scene.add(s.group); s.group.rotation.y = i === 0 ? -.10 : i === 1 ? .10 : -.08;
    if (i === 2) s.equip('rifle'); if (i === 3) s.equip('sniper');
    const shadow = new T.Mesh(new T.PlaneGeometry(1.6, 1.3), shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; scene.add(shadow); return shadow;
  });
  function preview(settings: HomePreview) { survivors[0].appearance(settings.appearance.palette); survivors[0].equip(settings[settings.held]); }
  function formation(squad: boolean, portrait: boolean) {
    const positions = portrait ? [[.38, 1.65], [-1.52, -.75], [-.30, -1.15], [1.42, -.75]] : [[.30, 1.7], [-2.38, -.5], [-.70, -1.05], [2.50, -.65]];
    survivors.forEach((s, i) => {
      s.group.visible = i === 0 || squad;
      const [x, z] = squad ? positions[i] : [0, 1]; s.group.position.set(x, 0, z);
      shadows[i].position.set(x, .002, z); shadows[i].visible = s.group.visible;
    });
  }
  function idle(time: number, reduced: boolean) {
    survivors.forEach((s, i) => { s.body.position.y = reduced ? 0 : Math.sin(time * .00135 + i) * .006; s.body.rotation.z = reduced ? 0 : Math.sin(time * .00062 + i) * .003; });
  }
  return { scene, survivors, preview, formation, idle };
}
