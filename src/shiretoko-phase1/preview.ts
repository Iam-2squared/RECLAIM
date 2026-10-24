import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BASINS, CHANNELS, LOCATIONS, ROUTE, TERRAIN, ShiretokoTerrain, clamp } from './terrain.ts';
import { TerrainIntro } from './intro.ts';
import { sceneryMesh } from './scenery.ts';
import { basinWaterMesh } from './water.ts';
import { TerrainWalker } from './walker.ts';
import { createFloraReviewLayer } from './flora-renderer.ts';
import { createBoardwalkReview } from './boardwalk.ts';
import { createCliffCabinReview } from './cabin.ts';
import { createLakeLookoutReview } from './lake-lookout.ts';
import { natureReviewFocus } from './review-focus.ts';
import { TerrainFrameDemand } from './frame-demand.ts';
import { TerrainGpuFrameGate } from './gpu-frame-gate.ts';
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
  const started = performance.now();
  let shaderError = false;
  let renderer: T.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }); }
  catch { fail('この地形プレビューにはPCブラウザのWebGL 2が必要です。Chrome / Edgeのハードウェアアクセラレーションを確認してください。'); return; }
  // An unavailableWebGL error must not depend on a foreground RAF or spend a
  // second generating unused terrain. Supported browsers still paint loading
  // once before CPU generation; dispose the early renderer on generation error.
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const terrainStarted=performance.now();let terrain:ShiretokoTerrain;
  try { terrain=new ShiretokoTerrain(); }catch(error){renderer.dispose();throw error;}
  const generated=performance.now();
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
    geometry.setAttribute('aWetness', new T.BufferAttribute(data.wetness, 1));
    geometry.setAttribute('aExposure', new T.BufferAttribute(data.exposure, 1));
    geometry.setIndex(new T.BufferAttribute(data.indices, 1)); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material); mesh.name = `terrain/${cx}/${cz}/5m`; root.add(mesh); chunks.push(mesh);
  }
  const sceneryStarted=performance.now();
  for (const band of ['near','far'] as const) {
    const data=sceneryMesh(terrain,band), geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(data.positions,3));
    geometry.setAttribute('normal',new T.BufferAttribute(data.normals,3));
    geometry.setAttribute('aOcclusion',new T.BufferAttribute(data.occlusion,1));
    geometry.setAttribute('aWetness',new T.BufferAttribute(data.wetness,1));
    geometry.setAttribute('aExposure',new T.BufferAttribute(data.exposure,1));
    geometry.setIndex(new T.BufferAttribute(data.indices,1));geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,material);mesh.name=`${band} inland continuation / stitched`;
    root.add(mesh);
  }
  const sceneryGeneratedMs=performance.now()-sceneryStarted;

  const waters: T.Mesh<T.BufferGeometry, T.ShaderMaterial>[] = [];
  // The old 24km plane exposed a trapezoidal END OF THE SEA in reverse aerial
  // views. Keep its geometric edge outside every allowed camera frustum.
  const ocean = new T.Mesh(new T.PlaneGeometry(120000, 120000), waterMaterial(detail, height, 0)); ocean.rotation.x = -Math.PI / 2; ocean.position.y = .15; ocean.name = 'preview sea level / horizon continuous'; root.add(ocean); waters.push(ocean);
  for (const b of BASINS) {
    const data=basinWaterMesh(terrain,b),geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(data.positions,3));geometry.setIndex(new T.BufferAttribute(data.indices,1));geometry.computeBoundingSphere();
    const lake = new T.Mesh(geometry, waterMaterial(detail, height, b.level));
    lake.name = `preview water/${b.id}/terrain-clipped`; root.add(lake); waters.push(lake);
  }
  for(const channel of CHANNELS) {
    const positions:number[]=[],indices:number[]=[];
    for(let i=0;i<channel.points.length;i++) {
      const p=channel.points[i],a=channel.points[Math.max(0,i-1)],b=channel.points[Math.min(channel.points.length-1,i+1)];
      const len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len,w=channel.width+12;
      positions.push(p.x+nx*w,p.y+.015,p.z+nz*w,p.x-nx*w,p.y+.015,p.z-nz*w);
      if(i>0){const v=i*2;indices.push(v-2,v,v-1,v-1,v,v+1);}
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    const mesh=new T.Mesh(geometry,waterMaterial(detail,height,91));mesh.name=`watercourse/${channel.id}`;root.add(mesh);waters.push(mesh);
  }
  // Opt-in standalone review, not the saved 480m campaign world or default V4 baseline.
  // These URL parameters preserve unchanged TITLE/HOME and reference screenshots.
  const query = new URLSearchParams(location.search);
  const floraChoice = query.get('flora');
  const floraReview = ['1', 'low', 'balanced'].includes(floraChoice ?? '')
    ? createFloraReviewLayer(terrain, floraChoice === 'balanced' ? 'balanced' : 'low') : null;
  const boardwalkReview = ['1', 'true', 'on'].includes(query.get('boardwalk') ?? '')
    ? createBoardwalkReview(terrain) : null;
  const cabinReview = ['1', 'true', 'on'].includes(query.get('cabin') ?? '')
    ? createCliffCabinReview(terrain) : null;
  const lakeLookoutReview = ['1', 'true', 'on'].includes(query.get('lookout') ?? '')
    ? createLakeLookoutReview(terrain) : null;
  const natureBadges: HTMLElement[] = [];
  if (floraReview) root.add(floraReview.group);
  if (cabinReview) root.add(cabinReview.group);
  if (lakeLookoutReview) root.add(lakeLookoutReview.group);
  if (lakeLookoutReview && !cabinReview && !boardwalkReview && !floraReview) {
    root.add(new T.HemisphereLight(0xe0eaf4, 0x4c4b42, 1.8));
    const lookoutSun=new T.DirectionalLight(0xffdab0, 2.0);
    lookoutSun.position.set(-260,640,340);root.add(lookoutSun);
  }
  if (cabinReview && !boardwalkReview && !floraReview) {
    root.add(new T.HemisphereLight(0xe0eaf4, 0x4c4b42, 1.8));
    const cabinSun=new T.DirectionalLight(0xffdab0, 2.0);
    cabinSun.position.set(-260,640,340);root.add(cabinSun);
  }
  if (boardwalkReview) {
    root.add(boardwalkReview.group);
    // Development decking uses bounded lit materials; original scene shader path is untouched.
    const fill = new T.HemisphereLight(0xe0eaf4, 0x4c4b42, 2);
    fill.name = 'review timber skylight'; root.add(fill);
    const sun = new T.DirectionalLight(0xffdab0, 2.1);
    sun.position.set(-260, 640, 340); sun.name = 'review timber sunlight'; root.add(sun);
  }
  if (floraReview || boardwalkReview || cabinReview || lakeLookoutReview) {
    const badge = document.createElement('div');
    badge.textContent = [floraReview ? `植生 ${floraReview.quality}` : '',
      boardwalkReview ? '木道・三角形接地' : '',
      cabinReview ? '崖上住宅・階段・室内衝突' : '',
      lakeLookoutReview ? '湖畔展望デッキ・実三角形接地' : ''].filter(Boolean).join(' ＋ ')
      + ' ｜開発レビュー・本編セーブ未接続';
    badge.setAttribute('data-nature-review', 'true');
    Object.assign(badge.style, { position: 'fixed', bottom: '14px', left: '14px', zIndex: '25',
      padding: '7px 12px', background: 'rgba(14,32,29,.88)', color: '#e3e5d5',
      font: '12px sans-serif', borderRadius: '5px', pointerEvents: 'none' });
    document.body.append(badge); natureBadges.push(badge);
  }
  const routePoints: T.Vector3[] = [];
  for (let i = 1; i < ROUTE.length; i++) {
    const a = ROUTE[i - 1], b = ROUTE[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    for (let s = 0; s < steps; s++) { const t = s / steps, x = T.MathUtils.lerp(a.x, b.x, t), z = T.MathUtils.lerp(a.z, b.z, t); routePoints.push(new T.Vector3(x, terrain.heightAt(x, z) + .7, z)); }
  }
  const last = ROUTE[ROUTE.length - 1]; routePoints.push(new T.Vector3(last.x, terrain.heightAt(last.x, last.z) + .7, last.z));
  const routeLine = new T.Line(new T.BufferGeometry().setFromPoints(routePoints), new T.LineDashedMaterial({ color: 0xf7e6b3, dashSize: 5, gapSize: 4, depthTest: true }));
  routeLine.computeLineDistances(); routeLine.visible = false; routeLine.name = 'optional route inspection overlay'; root.add(routeLine);
  const intro=new TerrainIntro();
  const reviewHeight = (x:number,z:number) =>
    cabinReview?.heightAt(x,z) ?? boardwalkReview?.heightAt(x,z) ??
    lakeLookoutReview?.heightAt(x,z) ?? null;
  const reviewBlocked = (x:number,z:number) =>
    Boolean(cabinReview?.blockedAt(x,z) || lakeLookoutReview?.blockedAt(x,z));
  const walker = new TerrainWalker(terrain,
    cabinReview || boardwalkReview || lakeLookoutReview ? reviewHeight : undefined,
    cabinReview || lakeLookoutReview ? reviewBlocked : undefined),
    keys = new Set<string>(), frameTimes: number[] = [];
  let walking = false, disposed = false, contextLost = false, activeLocation = -1, selectedView = 0, animation = 0, lastFrame = performance.now(), accumulator = 0, firstFrame = 0, freeze = false, needsRender = true, renderCallsTotal = 0;
  const drawSubmissionMs: number[] = [];
  const frameDemand = new TerrainFrameDemand();
  // Real WebGL2 GPU fences prevent RAF from queuing dozens of software-GL
  // frames whose eventual completion blocks the original V4 capture deadline.
  // Physics and pointer/keyboard input still run each RAF regardless of GPU load.
  const gpuFrameGate = new TerrainGpuFrameGate(renderer.getContext() as WebGL2RenderingContext);
  const cameraChanged = () => { needsRender = true; };
  controls.addEventListener('change', cameraChanged); cleanup.push(() => controls.removeEventListener('change',cameraChanged));
  let transition: { from: T.Vector3; targetFrom: T.Vector3; to: View; start: number } | null = null;
  function updateIntroLabels() {
    if(intro.state!=='overview'){$('intro-labels').hidden=true;return;}
    $('intro-labels').hidden=false;
    const occupied: {x:number;y:number;w:number;h:number}[]=[];
    // Project only on a requested frame. Reserve heading/actions; suppress labels that cannot fit.
    LOCATIONS.forEach((p,i)=>{
      const label=$(`intro-location-${i}`), v=new T.Vector3(p.x,terrain.heightAt(p.x,p.z)+10,p.z).project(camera);
      const x=(v.x*.5+.5)*innerWidth+12,y=(-v.y*.5+.5)*innerHeight-28,w=150,h=34;
      const blocked=v.z>1||v.z<0||x<20||x+w>innerWidth-20||y<22||y+h>innerHeight-125||(x<innerWidth*.34&&y<250)||occupied.some(r=>x<r.x+r.w+12&&x+w+12>r.x&&y<r.y+r.h+12&&y+h+12>r.y);
      label.hidden=blocked;
      if(!blocked){label.style.transform=`translate(${x}px,${y}px)`;occupied.push({x,y,w,h});}
    });
  }
  LOCATIONS.forEach((p,i)=>{const label=document.createElement('span');label.id=`intro-location-${i}`;label.className='intro-marker';label.innerHTML=`<b>0${i+1}</b>${p.name}`;$('intro-labels').append(label);});
  function renderNow(time = performance.now()) {
    if (disposed || contextLost || shaderError) return;
    if (!gpuFrameGate.canSubmit()) { needsRender = true; return; }
    if (!freeze) for (const water of waters) water.material.uniforms.uTime.value = (time-started)/1000;
    updateIntroLabels();
    // The backdrop represents directions, not a finite sphere fixed to the
    // world's origin. Panning to the distant terminal must not exit its shell.
    sky.position.copy(camera.position);
    const submitted = performance.now(); renderer.render(scene,camera); gpuFrameGate.submitted(); frameDemand.submitted(camera); renderCallsTotal++; needsRender = false;
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
  let natureFocusActive = false;
  function selectView(index: number, instant = false) {
    natureFocusActive = false;
    closeIntro(); exitWalk(); selectedView = index; activeLocation = index - 1;
    // Finish pending user orbit deltas before defining a fixed-camera move.
    // Otherwise a0–4 shortcut immediately after a drag drifts off its target.
    const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
    document.querySelectorAll<HTMLButtonElement>('[data-location]').forEach(button => button.classList.toggle('active', Number(button.dataset.location) === activeLocation));
    $('scene-title').innerHTML = hints[index][0]; $('scene-description').textContent = hints[index][1];
    $('overview').classList.toggle('active', index === 0); $('overview').setAttribute('aria-pressed', String(index === 0));
    if (instant) { camera.position.fromArray(VIEWS[index].position); controls.target.fromArray(VIEWS[index].target); controls.update(); transition = null; }
    else transition = { from: camera.position.clone(), targetFrom: controls.target.clone(), to: VIEWS[index], start: performance.now() };
    if (instant) renderNow();
  }
  function updateWalkCamera() { camera.position.set(walker.x, walker.y + walker.eyeHeight, walker.z); camera.rotation.order = 'YXZ'; camera.rotation.set(walker.pitch, walker.yaw, 0); }
  function enterWalk() {
    // When entering the FIRST cabin review view, start on its real stairs,
    // not 70m away at the canonical cape location. Landmark buttons and the
    // normal 480m game are deliberately unaffected.
    const cabinEntry = natureFocusActive && firstLook?.kind === 'cabin'
      ? cabinReview?.entrance : null;
    const lakeEntry = natureFocusActive && firstLook?.kind === 'lookout'
      ? lakeLookoutReview?.entrance : null;
    const highlandEntry = natureFocusActive && firstLook?.kind === 'highland'
      ? LOCATIONS[3] : null;
    const p = cabinEntry ?? lakeEntry ?? highlandEntry ?? LOCATIONS[Math.max(0, activeLocation)];
    if (!walker.place(p.x, p.z)) return;
    transition = null; controls.enabled = false; walking = true; keys.clear(); accumulator = 0;
    walker.yaw = cabinEntry ? Math.PI / 2 : lakeEntry ? -Math.PI / 2 : 0;
    walker.pitch = 0;
    camera.fov = 66; camera.updateProjectionMatrix(); updateWalkCamera();
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
  // Escape/back preserves the opted-in cabin camera. Without this, the
  // viewer returned to the remote all-map view after walking into the house.
  function returnFromWalk() {
    if (natureFocusActive && (firstLook?.kind === 'cabin' || firstLook?.kind === 'lookout' || firstLook?.kind === 'highland')) {
      exitWalk();
      camera.position.fromArray(firstLook.position);
      controls.target.fromArray(firstLook.target);
      controls.update();
      needsRender = true;
    } else selectView(selectedView);
  }
  let flight: {from:T.Vector3;target:T.Vector3;start:number}|null=null;
  function closeIntro() {
    flight=null;intro.cancel();document.body.classList.remove('intro');$('intro-panel').hidden=true;routeLine.visible=!document.body.classList.contains('clean')&&$('route').getAttribute('aria-pressed')==='true';controls.enabled=true;
  }
  function openIntro() {
    selectView(0,true);intro.open();document.body.classList.add('intro');$('intro-panel').hidden=false;routeLine.visible=true;
    $('intro-explore').hidden=false;$('intro-explore').textContent='探索を開始';$('intro-fly').hidden=false;$('intro-description').textContent='海と断崖、湿原と湖。その奥に続く山々へ。';
    controls.enabled=true;needsRender=true;$('intro-explore').focus({preventScroll:true});
  }
  on($('intro-open'),'click',openIntro);
  on($('intro-cancel'),'click',()=>selectView(0,true));
  on($('intro-explore'),'click',()=>{if(!intro.explore())return;closeIntro();activeLocation=0;selectedView=0;enterWalk();});
  on($('intro-fly'),'click',()=>{
    if(!intro.fly())return;routeLine.visible=false;
    // Reduced motion directly shows the landing; neither branch requests pointer lock asynchronously.
    flight={from:camera.position.clone(),target:controls.target.clone(),start:matchMedia('(prefers-reduced-motion: reduce)').matches?performance.now()-3200:performance.now()};
    controls.enabled=false;$('intro-fly').hidden=true;$('intro-explore').hidden=true;
  });
  function setClean(value: boolean) { document.body.classList.toggle('clean', value);routeLine.visible=!value&&(intro.state==='overview'||$('route').getAttribute('aria-pressed')==='true'); needsRender=true; }
  on($('overview'), 'click', () => selectView(0));
  on($('elevation'), 'click', () => {
    const enabled = !material.uniforms.uElevation.value; material.uniforms.uElevation.value = enabled ? 1 : 0;
    needsRender = true;
    $('elevation').classList.toggle('active', enabled); $('elevation').setAttribute('aria-pressed', String(enabled));
  });
  on($('route'), 'click', () => { routeLine.visible = !routeLine.visible; needsRender = true; $('route').classList.toggle('active', routeLine.visible); $('route').setAttribute('aria-pressed', String(routeLine.visible)); });
  on($('clean'), 'click', () => setClean(true));
  on($('walk'), 'click', () => { if (walking) returnFromWalk(); else enterWalk(); });
  document.querySelectorAll<HTMLButtonElement>('[data-location]').forEach(button => on(button, 'click', () => selectView(Number(button.dataset.location) + 1)));
  on(renderer.domElement, 'click', () => requestLock());
  on(renderer.domElement, 'pointerdown', () => { if (!walking) transition = null; });
  on(document, 'pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    // Acquiring the lock must not erase a W/Space press made immediately after the click.
    if (!locked) { keys.clear(); walker.clearInput(); accumulator = 0; if (walking) returnFromWalk(); }
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
    if (e.code === 'Escape') { setClean(false); if(intro.state!=='closed')selectView(0,true); if (walking) returnFromWalk(); }
    if (!walking && /^Digit[0-4]$/.test(e.code)) selectView(Number(e.code.slice(-1)));
    if (walking && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space'].includes(e.code)) { e.preventDefault(); keys.add(e.code); }
  });
  on(document, 'keyup', event => keys.delete((event as KeyboardEvent).code));
  on(window, 'blur', () => { if(intro.state==='flying')selectView(0,true); keys.clear(); walker.clearInput(); accumulator = 0; });
  on(document, 'visibilitychange', () => { if(document.hidden && intro.state==='flying')selectView(0,true); keys.clear(); walker.clearInput(); accumulator = 0; lastFrame = performance.now(); needsRender = true; });
  on(window, 'resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); needsRender = true; });
  on(renderer.domElement, 'webglcontextlost', event => { event.preventDefault(); contextLost = true; closeIntro(); keys.clear(); if (walking) exitWalk(); fail('描画コンテキストが失われました。ページを再読み込みして地形を再構築してください。保存データへの変更はありません。'); });
  selectView(0, true);
  // The default V4 baseline keeps its untouched all-map opening. Nature-only
  // links land directly on their visible 3D subject, not an empty distant sky.
  const lakePoint=lakeLookoutReview?.viewpoint;
  // This dedicated lake-only URL starts with its actual dynamically surveyed
  // dry shoreline deck, not an unrelated all-map/cape camera. Combined nature
  // URLs retain the existing cabin-first camera and all review scripts.
  const firstLook = lakePoint && !cabinReview && !boardwalkReview && !floraReview
    ? {
        kind:'lookout' as const,
        position:[lakePoint.x-18,
          terrain.heightAt(lakePoint.x-18,lakePoint.z+14)+9,lakePoint.z+14] as const,
        target:[lakePoint.x,lakePoint.y+1,lakePoint.z] as const,
        title:'湖畔の展望デッキへ。',description:'本物の湖岸に沿った木製展望台。床・支柱・手すりは実地形に接地します。',
      }
    : natureReviewFocus(query, (x,z) => terrain.heightAt(x,z));
  if (firstLook) {
    natureFocusActive = true;
    camera.position.set(...firstLook.position);
    controls.target.set(...firstLook.target);
    controls.update();
    $('scene-title').textContent = firstLook.title;
    $('scene-description').textContent = firstLook.description;
    // The baseline caption remains byte-for-byte in ordinary terrain mode.
    const caption = document.querySelector('.study-caption');
    if (caption) for (const node of caption.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes('建物・植生は次の工程'))
        node.textContent = node.textContent.replace('建物・植生は次の工程','自然・木道・住宅の開発レビュー');
    }
    needsRender = true;
  }
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
    } else if (flight) {
      const t=clamp((time-flight.start)/3200),e=t*t*(3-2*t),site=LOCATIONS[0];
      const end=new T.Vector3(site.x,terrain.heightAt(site.x,site.z)+walker.eyeHeight,site.z);
      camera.position.lerpVectors(flight.from,end,e);
      controls.target.lerpVectors(flight.target,new T.Vector3(site.x,109.8,site.z-140),e);
      camera.lookAt(controls.target);needsRender=true;
      if(t===1){flight=null;intro.land();$('intro-explore').hidden=false;$('intro-explore').textContent='ここから歩く';$('intro-description').textContent='崖上の敷地。クリックすると視点操作を開始します。';$('intro-explore').focus({preventScroll:true});}
    } else if (transition) {
      const t = clamp((time - transition.start) / 1300), easing = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.from, new T.Vector3(...transition.to.position), easing); controls.target.lerpVectors(transition.targetFrom, new T.Vector3(...transition.to.target), easing); controls.update();
      if (t === 1) transition = null;
    } else if(intro.state!=='landed')controls.update();
    // Frozen water plus an unchanged walking camera is an identical image.
    // Keep input/60Hz physics above active, and draw every changed pose; do not
    // flood the software GPU with duplicate frames while a capture is pending.
    if (needsRender || transition || (walking && (!freeze || frameDemand.changed(camera)))) renderNow(time);
    if (walking && document.pointerLockElement === renderer.domElement && rawDelta > 0 && frameTimes.length < 600) frameTimes.push(rawDelta * 1000);
  }
  animation = requestAnimationFrame(frame);
  let geometryAttributeBytes=0,indexBytes=0;
  scene.traverse(object=>{if(object instanceof T.Mesh || object instanceof T.Line){for(const a of Object.values(object.geometry.attributes) as T.BufferAttribute[])geometryAttributeBytes+=a.array.byteLength;indexBytes+=object.geometry.index?.array.byteLength??0;}});
  const diagnostics = () => ({
    ready: Boolean(firstFrame), phase: 1, revision: 4, terrainOnly: !floraReview && !boardwalkReview && !cabinReview,
    floraReview: floraReview ? { enabled: true, quality: floraReview.quality,
      instances: floraReview.instances, drawGroups: floraReview.drawGroups,
      instanceBytes: floraReview.instanceBytes, saveWrites: 0 } : { enabled: false },
    boardwalkReview: boardwalkReview ? { enabled: true, panels: boardwalkReview.panels,
      supports: boardwalkReview.supports, indexedTriangles: boardwalkReview.indexedTriangles,
      saveWrites: 0 } : { enabled: false },
    cabinReview: cabinReview ? {enabled:true,stairs:cabinReview.stairs,
      parts:cabinReview.parts,floorY:cabinReview.floorY,saveWrites:0} : {enabled:false},
    lakeLookoutReview: lakeLookoutReview ? {enabled:true,
      entrance:lakeLookoutReview.entrance,viewpoint:lakeLookoutReview.viewpoint,
      panels:lakeLookoutReview.panels,supports:lakeLookoutReview.supports,saveWrites:0} : {enabled:false},
    mode: walking ? 'walk' : 'orbit', routeOverlayVisible:routeLine.visible, intro:intro.state, sound:'off / no audio resources',
    bounds: [-1200, 1200], cellMetres: 5, chunks: chunks.length, gridVertices: terrain.heights.length,
    generatedMs: +(generated - terrainStarted).toFixed(1), firstFrameMs: firstFrame ? +(firstFrame - started).toFixed(1) : null,
    sceneryGeneratedMs:+sceneryGeneratedMs.toFixed(1),
    triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls,
    geometryAttributeBytes,indexBytes,terrainHeightBytes:terrain.heights.byteLength,approxTextureBytes:512*512*4*4/3+terrain.count**2*4,
    camera:{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov},
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    frameTimesMs: frameTimes.slice(2), drawSubmissionMs:drawSubmissionMs.slice(), renderCallsTotal, renderingPolicy:'on-demand orbit; continuous walking unless frozen and camera unchanged', viewport: [innerWidth, innerHeight], dpr: renderer.getPixelRatio(),
    player: { x: walker.x, y: walker.y, z: walker.z, grounded: walker.grounded, distance: walker.distance },
    pointerLocked:document.pointerLockElement===renderer.domElement, inputKeys:[...keys], hidden:document.hidden, contextLost, shaderError, disposed, heapBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  });
  function dispose() {
    if (disposed) return; disposed = true; natureBadges.forEach(badge => badge.remove()); intro.dispose();flight=null;cancelAnimationFrame(animation); document.exitPointerLock?.(); cleanup.splice(0).forEach(fn => fn()); controls.dispose();
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
    scene.traverse(object => { if (object instanceof T.InstancedMesh) object.dispose(); if (object instanceof T.Mesh || object instanceof T.Line) { geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); detail.dispose(); height.dispose();
    gpuFrameGate.dispose();
    renderer.dispose();
    // This *standalone* preview owns its WebGL context (unlike the game
    // renderer shared by Mission). Releasing it before detaching the canvas
    // lets Chromium/SwiftShader finish GPU teardown without a post-disposal
    // automation command. All mesh/material/resource assertions are unchanged.
    renderer.forceContextLoss();
    renderer.domElement.remove(); scene.clear();
  }
  on(window, 'pagehide', () => dispose());
  // This entry is explicitly a development review surface, including the standalone artifact.
  // Inspection hooks are isolated here and never imported by the actual game's index.html.
  if(document.body.dataset.initialIntro==='true')openIntro();
  Object.assign(window, { __SHIRETOKO_TERRAIN__: {
    diagnostics, terrain, walker, route: ROUTE, boardwalkHeightAt: boardwalkReview?.heightAt ?? null, cabinHeightAt: cabinReview?.heightAt ?? null, cabinBlockedAt: cabinReview?.blockedAt ?? null, cabinEntrance: cabinReview?.entrance ?? null,
    lakeLookoutHeightAt:lakeLookoutReview?.heightAt ?? null,
    lakeLookoutBlockedAt:lakeLookoutReview?.blockedAt ?? null,
    lakeLookoutEntrance:lakeLookoutReview?.entrance ?? null,
    setView: (index: number) => selectView(clamp(Math.floor(index), 0, 4), true),
    setClean, freeze: (value: boolean) => { freeze = value; if(value)for(const water of waters)water.material.uniforms.uTime.value=0; needsRender=true; },
    viewFrom: (position: [number, number, number], target: [number, number, number]) => { exitWalk(); natureFocusActive = false; transition = null; camera.position.fromArray(position); controls.target.fromArray(target); controls.update(); needsRender=true; },
    openIntro, dispose,
  } });
}
boot().catch(error => { console.error(error); fail('地形の構築に失敗しました。ページを再読み込みしてください。'); });
