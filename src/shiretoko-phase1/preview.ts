import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BASINS, LOCATIONS, ROUTE, TERRAIN, ShiretokoTerrain, rawHeight, clamp } from './terrain.ts';
import { TerrainWalker } from './walker.ts';
import { createSky, detailTexture, heightTexture, terrainMaterial, waterMaterial } from './materials.ts';
import './preview.css';

type View = { position: [number, number, number]; target: [number, number, number] };
const VIEWS: View[] = [
  { position: [1320, 1660, 2270], target: [-10, 125, -85] },
  { position: [-500, 260, 1120], target: [-155, 100, 760] },
  { position: [460, 255, 760], target: [-20, 97, 290] },
  { position: [600, 365, 30], target: [20, 210, -470] },
  { position: [710, 640, -480], target: [-15, 440, -1030] },
];
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const cleanup: (() => void)[] = [];
function on(target: EventTarget, type: string, fn: EventListener) { target.addEventListener(type, fn); cleanup.push(() => target.removeEventListener(type, fn)); }
function fail(message: string) { $('loading').hidden = true; $('error').hidden = false; $('error').textContent = message; }

async function boot() {
  // Yield once so the loading message paints before deterministic CPU generation.
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const started = performance.now(), terrain = new ShiretokoTerrain(), generated = performance.now();
  let shaderError = false;
  let renderer: T.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }); }
  catch { fail('この地形プレビューにはPCブラウザのWebGL 2が必要です。Chrome / Edgeのハードウェアアクセラレーションを確認してください。'); return; }
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    shaderError = true;
    console.error('Terrain shader compilation failed', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader));
    fail('地形シェーダーを実行できませんでした。このPCのブラウザとグラフィックドライバーのWebGL 2対応を確認してください。');
  };
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', '知床の地形。ドラッグで回転、ホイールで拡大。');
  $('terrain-view').append(renderer.domElement);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(44, innerWidth / innerHeight, .12, 16000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .1; controls.maxPolarAngle = Math.PI * .49;
  controls.minDistance = 10; controls.maxDistance = 6300; controls.zoomSpeed = .8;
  const sky = createSky(); scene.add(sky);
  const detail = detailTexture(), height = heightTexture(terrain), material = terrainMaterial(detail);
  const root = new T.Group(); root.name = 'Shiretoko Phase 1 — original terrain only'; scene.add(root);
  const chunks: T.Mesh[] = [];
  for (let cz = -4; cz < 4; cz++) for (let cx = -4; cx < 4; cx++) {
    const data = terrain.chunk(cx, cz), geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new T.BufferAttribute(data.normals, 3));
    geometry.setAttribute('aOcclusion', new T.BufferAttribute(data.occlusion, 1));
    geometry.setIndex(new T.BufferAttribute(data.indices, 1)); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material); mesh.name = `terrain/${cx}/${cz}/5m`; root.add(mesh); chunks.push(mesh);
  }
  // Continuous inland continuation: 20m grid, stitched to EVERY 5m vertex on the main border.
  // It is distant scenery only; walking remains inside the explicit 2.4km survey area.
  const positions: number[] = [], normals: number[] = [], occ: number[] = [], indices: number[] = [];
  const backCols = 360, backRows = 150, backStep = 20;
  const add = (x: number, z: number) => {
    const index = positions.length / 3, y = z === -1200 && Math.abs(x) <= 1200 ? terrain.heightAt(x, z) : rawHeight(x, z);
    const sample = (a: number,b: number) => Math.abs(a)<=1200 && Math.abs(b)<=1200 ? terrain.heightAt(a,b) : rawHeight(a,b);
    const nx = sample(x - 5, z) - sample(x + 5, z), nz = sample(x, z - 5) - sample(x, z + 5), len = Math.hypot(nx, 10, nz);
    positions.push(x, y, z); normals.push(nx / len, 10 / len, nz / len); occ.push(1); return index;
  };
  for (let z = 0; z <= backRows; z++) for (let x = 0; x <= backCols; x++) add(-3600 + x * backStep, -4200 + z * backStep);
  for (let z = 0; z < backRows; z++) for (let x = 0; x < backCols; x++) {
    const a = z * (backCols + 1) + x, b = a + 1, c = a + backCols + 1, d = c + 1;
    indices.push(a, c, b);
    if (z === backRows - 1) {
      const c1 = add(-3600 + x * backStep + 5, -1200), c2 = add(-3600 + x * backStep + 10, -1200), c3 = add(-3600 + x * backStep + 15, -1200);
      indices.push(b, c, c1, b, c1, c2, b, c2, c3, b, c3, d);
    } else indices.push(b, c, d);
  }
  const backGeometry = new T.BufferGeometry();
  backGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); backGeometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); backGeometry.setAttribute('aOcclusion', new T.Float32BufferAttribute(occ, 1)); backGeometry.setIndex(indices);
  const backdrop = new T.Mesh(backGeometry, material); backdrop.name = '20m inland continuation / stitched'; root.add(backdrop);

  const waters: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>[] = [];
  const ocean = new T.Mesh(new T.PlaneGeometry(24000, 24000), waterMaterial(detail, height, 0)); ocean.rotation.x = -Math.PI / 2; ocean.position.y = .15; ocean.name = 'preview sea level'; root.add(ocean); waters.push(ocean);
  for (const b of BASINS) {
    const lake = new T.Mesh(new T.PlaneGeometry(b.rx * 2.9, b.rz * 2.9), waterMaterial(detail, height, b.level, b));
    lake.rotation.x = -Math.PI / 2; lake.position.set(b.x, b.level, b.z); lake.name = `preview water/${b.id}`; root.add(lake); waters.push(lake);
  }
  const routePoints: T.Vector3[] = [];
  for (let i = 1; i < ROUTE.length; i++) {
    const a = ROUTE[i - 1], b = ROUTE[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    for (let s = 0; s < steps; s++) { const t = s / steps, x = T.MathUtils.lerp(a.x, b.x, t), z = T.MathUtils.lerp(a.z, b.z, t); routePoints.push(new T.Vector3(x, terrain.heightAt(x, z) + .7, z)); }
  }
  const last = ROUTE[ROUTE.length - 1]; routePoints.push(new T.Vector3(last.x, terrain.heightAt(last.x, last.z) + .7, last.z));
  const routeLine = new T.Line(new T.BufferGeometry().setFromPoints(routePoints), new T.LineDashedMaterial({ color: 0xf7e6b3, dashSize: 5, gapSize: 4, depthTest: true }));
  routeLine.computeLineDistances(); routeLine.visible = false; routeLine.name = 'optional route inspection overlay'; root.add(routeLine);
  const walker = new TerrainWalker(terrain), keys = new Set<string>(), frameTimes: number[] = [];
  let walking = false, disposed = false, contextLost = false, activeLocation = -1, selectedView = 0, animation = 0, lastFrame = performance.now(), accumulator = 0, firstFrame = 0, freeze = false, needsRender = true, renderCallsTotal = 0;
  const drawSubmissionMs: number[] = [];
  const cameraChanged = () => { needsRender = true; };
  controls.addEventListener('change', cameraChanged); cleanup.push(() => controls.removeEventListener('change',cameraChanged));
  let transition: { from: T.Vector3; targetFrom: T.Vector3; to: View; start: number } | null = null;
  function renderNow(time = performance.now()) {
    if (disposed || contextLost || shaderError) return;
    if (!freeze) for (const water of waters) water.material.uniforms.uTime.value = (time-started)/1000;
    const submitted = performance.now(); renderer.render(scene,camera); renderCallsTotal++; needsRender = false;
    if (drawSubmissionMs.length < 600) drawSubmissionMs.push(performance.now()-submitted);
    if (!firstFrame && !shaderError) { firstFrame = performance.now(); $('loading').hidden = true; }
  }
  const hints = [
    ['海と、崖と、<br />まだ名のない道。', '岬から湿原へ。湖を越え、内陸の山々へ。'],
    ['崖の上から、<br />旅が始まる。', '海へ張り出した岬。住宅のための平坦な敷地。'],
    ['水と草原が、<br />道をひらく。', '開けた低湿地。入り組む池と、緩やかな起伏。'],
    ['静かな湖と、<br />山への入口。', '不規則な湖岸。その奥に続く、高原と谷。'],
    ['尾根の向こうへ。', '主稜線、枝尾根、侵食谷。内陸へ連なる山々。'],
  ];
  function selectView(index: number, instant = false) {
    exitWalk(); selectedView = index; activeLocation = index - 1;
    document.querySelectorAll<HTMLButtonElement>('[data-location]').forEach(button => button.classList.toggle('active', Number(button.dataset.location) === activeLocation));
    $('scene-title').innerHTML = hints[index][0]; $('scene-description').textContent = hints[index][1];
    $('overview').classList.toggle('active', index === 0); $('overview').setAttribute('aria-pressed', String(index === 0));
    if (instant) { camera.position.fromArray(VIEWS[index].position); controls.target.fromArray(VIEWS[index].target); controls.update(); transition = null; }
    else transition = { from: camera.position.clone(), targetFrom: controls.target.clone(), to: VIEWS[index], start: performance.now() };
    if (instant) renderNow();
  }
  function updateWalkCamera() { camera.position.set(walker.x, walker.y + walker.eyeHeight, walker.z); camera.rotation.order = 'YXZ'; camera.rotation.set(walker.pitch, walker.yaw, 0); }
  function enterWalk() {
    const p = LOCATIONS[Math.max(0, activeLocation)];
    if (!walker.place(p.x, p.z)) return;
    transition = null; controls.enabled = false; walking = true; keys.clear(); accumulator = 0;
    walker.yaw = 0; walker.pitch = 0; camera.fov = 66; camera.updateProjectionMatrix(); updateWalkCamera();
    document.body.classList.add('walking'); $('walk-overlay').hidden = false; $('walk-message').hidden = false;
    $('walk').innerHTML = '俯瞰に戻る <span>ESC</span>';
    $('controls-hint').textContent = 'WASD 移動 · Shift ダッシュ · Space ジャンプ · Esc 俯瞰';
    requestLock();
  }
  function requestLock() {
    if (!walking) return;
    try { const result = renderer.domElement.requestPointerLock(); if (result) result.catch(() => { $('walk-message').hidden = false; }); }
    catch { $('walk-message').hidden = false; }
  }
  function exitWalk() {
    if (!walking) return;
    walking = false; keys.clear(); walker.clearInput(); accumulator = 0; document.exitPointerLock?.();
    controls.enabled = true; camera.fov = 44; camera.updateProjectionMatrix();
    document.body.classList.remove('walking'); $('walk-overlay').hidden = true;
    $('walk').innerHTML = 'この場所を歩く <span>↗</span>';
    $('controls-hint').innerHTML = 'ドラッグ：回転 <span>·</span> 右ドラッグ：移動 <span>·</span> ホイール：拡大';
    $('altitude').textContent = '2,400 × 2,400 m';
  }
  function setClean(value: boolean) { document.body.classList.toggle('clean', value); }
  on($('overview'), 'click', () => selectView(0));
  on($('elevation'), 'click', () => {
    const enabled = !material.uniforms.uElevation.value; material.uniforms.uElevation.value = enabled ? 1 : 0;
    needsRender = true;
    $('elevation').classList.toggle('active', enabled); $('elevation').setAttribute('aria-pressed', String(enabled));
  });
  on($('route'), 'click', () => { routeLine.visible = !routeLine.visible; needsRender = true; $('route').classList.toggle('active', routeLine.visible); $('route').setAttribute('aria-pressed', String(routeLine.visible)); });
  on($('clean'), 'click', () => setClean(true));
  on($('walk'), 'click', () => { if (walking) selectView(selectedView); else enterWalk(); });
  document.querySelectorAll<HTMLButtonElement>('[data-location]').forEach(button => on(button, 'click', () => selectView(Number(button.dataset.location) + 1)));
  on(renderer.domElement, 'click', () => requestLock());
  on(renderer.domElement, 'pointerdown', () => { if (!walking) transition = null; });
  on(document, 'pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    // Acquiring the lock must not erase a W/Space press made immediately after the click.
    if (!locked) { keys.clear(); walker.clearInput(); accumulator = 0; if (walking) selectView(selectedView); }
    $('walk-message').hidden = locked;
  });
  on(document, 'mousemove', event => {
    if (walking && document.pointerLockElement === renderer.domElement) {
      const e = event as MouseEvent; walker.yaw -= e.movementX * .002; walker.pitch = clamp(walker.pitch - e.movementY * .002, -1.4, 1.4);
    }
  });
  on(document, 'keydown', event => {
    const e = event as KeyboardEvent;
    if (e.code === 'KeyH') setClean(!document.body.classList.contains('clean'));
    if (e.code === 'Escape') { setClean(false); if (walking) selectView(selectedView); }
    if (!walking && /^Digit[0-4]$/.test(e.code)) selectView(Number(e.code.slice(-1)));
    if (walking && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space'].includes(e.code)) { e.preventDefault(); keys.add(e.code); }
  });
  on(document, 'keyup', event => keys.delete((event as KeyboardEvent).code));
  on(window, 'blur', () => { keys.clear(); walker.clearInput(); accumulator = 0; });
  on(document, 'visibilitychange', () => { keys.clear(); walker.clearInput(); accumulator = 0; lastFrame = performance.now(); needsRender = true; });
  on(window, 'resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); needsRender = true; });
  on(renderer.domElement, 'webglcontextlost', event => { event.preventDefault(); contextLost = true; keys.clear(); if (walking) exitWalk(); fail('描画コンテキストが失われました。ページを再読み込みして地形を再構築してください。保存データへの変更はありません。'); });
  selectView(0, true);
  function frame(time: number) {
    if (disposed) return;
    animation = requestAnimationFrame(frame);
    if (document.hidden || contextLost || shaderError) { lastFrame = time; return; }
    const rawDelta = Math.max(0, (time - lastFrame) / 1000), dt = Math.min(.15, rawDelta); lastFrame = time;
    if (walking) {
      if (document.pointerLockElement === renderer.domElement) {
        accumulator += dt;
        while (accumulator >= 1 / 60) { walker.step({ forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')), right: Number(keys.has('KeyD')) - Number(keys.has('KeyA')), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space') }, 1 / 60); accumulator -= 1 / 60; }
      }
      updateWalkCamera(); $('altitude').textContent = `${walker.y.toFixed(1)} m / 徒歩 ${walker.distance.toFixed(0)} m`;
    } else if (transition) {
      const t = clamp((time - transition.start) / 1300), easing = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.from, new T.Vector3(...transition.to.position), easing); controls.target.lerpVectors(transition.targetFrom, new T.Vector3(...transition.to.target), easing); controls.update();
      if (t === 1) transition = null;
    } else controls.update();
    // A terrain review has no reason to flood the GPU with identical idle overview frames.
    if (needsRender || walking || transition) renderNow(time);
    if (walking && document.pointerLockElement === renderer.domElement && rawDelta > 0 && frameTimes.length < 600) frameTimes.push(rawDelta * 1000);
  }
  animation = requestAnimationFrame(frame);
  const diagnostics = () => ({
    ready: Boolean(firstFrame), phase: 1, terrainOnly: true, mode: walking ? 'walk' : 'orbit',
    bounds: [-1200, 1200], cellMetres: 5, chunks: chunks.length, gridVertices: terrain.heights.length,
    generatedMs: +(generated - started).toFixed(1), firstFrameMs: firstFrame ? +(firstFrame - started).toFixed(1) : null,
    triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    frameTimesMs: frameTimes.slice(2), drawSubmissionMs:drawSubmissionMs.slice(), renderCallsTotal, renderingPolicy:'on-demand orbit, continuous walking', viewport: [innerWidth, innerHeight], dpr: renderer.getPixelRatio(),
    player: { x: walker.x, y: walker.y, z: walker.z, grounded: walker.grounded, distance: walker.distance },
    pointerLocked:document.pointerLockElement===renderer.domElement, inputKeys:[...keys], hidden:document.hidden, contextLost, shaderError, disposed, heapBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  });
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(animation); document.exitPointerLock?.(); cleanup.splice(0).forEach(fn => fn()); controls.dispose();
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
    scene.traverse(object => { if (object instanceof T.Mesh || object instanceof T.Line) { geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); detail.dispose(); height.dispose(); renderer.dispose(); renderer.domElement.remove(); scene.clear();
  }
  on(window, 'pagehide', () => dispose());
  // This entry is explicitly a development review surface, including the standalone artifact.
  // Inspection hooks are isolated here and never imported by the actual game's index.html.
  Object.assign(window, { __SHIRETOKO_TERRAIN__: {
    diagnostics, terrain, walker, route: ROUTE, setView: (index: number) => selectView(clamp(Math.floor(index), 0, 4), true),
    setClean, freeze: (value: boolean) => { freeze = value; },
    viewFrom: (position: [number, number, number], target: [number, number, number]) => { exitWalk(); transition = null; camera.position.fromArray(position); controls.target.fromArray(target); controls.update(); needsRender=true; },
    dispose,
  } });
}
boot().catch(error => { console.error(error); fail('地形の構築に失敗しました。ページを再読み込みしてください。'); });
