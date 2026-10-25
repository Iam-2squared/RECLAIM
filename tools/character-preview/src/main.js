import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const $ = id => document.getElementById(id);
const state = { gender: 'male', ready: false, view: 'body', rotate: false, pose: false };
const STORAGE_KEY = 'reclaim.original-skins.v1';
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved === 'male' || saved === 'female') state.gender = saved; } catch { /* Optional local storage. */ }
const cache = new Map();
let record, modelRoot, headBone, headRest, loadVersion = 0;
let animationId = null, lastTime = 0, frames = 0, poseTime = 0, transition = null;
const canvas = $('canvas');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch {
  $('loader').hidden = true;
  $('error').textContent = '3D表示を開始できませんでした。WebGL 2対応のChromeまたはEdgeで開いてください。';
  $('error').hidden = false;
  throw new Error('WebGL renderer unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.setClearColor(0x35404c, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdbe9fa, 0x827664, 1.55));
const key = new THREE.DirectionalLight(0xfff3df, 3.1);
key.position.set(3.2, 5.4, 4.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: .5, far: 12 });
key.shadow.bias = -.00025; key.shadow.normalBias = .008; scene.add(key);
const fill = new THREE.DirectionalLight(0xc3dbff, .85); fill.position.set(-4, 2, 3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xe9e4d7, 1.7); rim.position.set(-1.2, 4, -3.5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x0b1220, opacity: .24 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.006; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(33, 1, .01, 50);
camera.position.set(0, 1, 3.85);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, .94, 0); controls.enableDamping = true; controls.dampingFactor = .09;
controls.enablePan = false; controls.minDistance = .45; controls.maxDistance = 7;
controls.minPolarAngle = .24; controls.maxPolarAngle = Math.PI * .53; controls.autoRotateSpeed = 1.2;
controls.addEventListener('change', requestFrame);
controls.addEventListener('start', () => { transition = null; });
new ResizeObserver(() => {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); requestFrame();
}).observe(canvas);
function requestFrame() { if (animationId === null && !document.hidden) animationId = requestAnimationFrame(render); }
function render(time) {
  animationId = null;
  if (document.hidden) return;
  const dt = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 0; lastTime = time;
  if (transition) {
    const t = Math.min(1, (time - transition.start) / 320), e = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(transition.fromPosition, transition.toPosition, e);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, e);
    if (t === 1) transition = null;
  }
  if (headBone && headRest) {
    headBone.quaternion.copy(headRest);
    if (state.pose) {
      poseTime += dt;
      const parentQ = headBone.parent.getWorldQuaternion(new THREE.Quaternion());
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(poseTime * 1.25) * .36);
      headBone.quaternion.premultiply(parentQ.clone().invert().multiply(yaw).multiply(parentQ));
    }
  }
  const changed = controls.update(dt);
  scene.updateMatrixWorld(true); renderer.render(scene, camera); frames++;
  if (state.rotate || state.pose || transition || changed) requestFrame();
}
document.addEventListener('visibilitychange', () => {
  lastTime = 0;
  if (document.hidden && animationId !== null) { cancelAnimationFrame(animationId); animationId = null; }
  else requestFrame();
});
function bounds(root) {
  root.updateMatrixWorld(true); root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const box = new THREE.Box3(); root.traverse(o => { if (o.isMesh) box.union(new THREE.Box3().setFromObject(o, true)); }); return box;
}
async function loadModel(gender) {
  const version = ++loadVersion; state.ready = false;
  $('loader').hidden = false; $('error').hidden = true;
  $('loading-label').textContent = `${gender === 'male' ? '男性' : '女性'}キャラを読み込み中`;
  try {
    if (!cache.has(gender)) {
      const pending = (async () => {
        const loader = new GLTFLoader();
        const embedded = window.RECLAIM_EMBEDDED_MODELS?.[gender];
        let gltf;
        if (embedded) {
          const binary = atob(embedded), bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          gltf = await loader.parseAsync(bytes.buffer, '');
        } else gltf = await loader.loadAsync(`./assets/${gender}/${gender}.glb`);
        const root = new THREE.Group(); root.add(gltf.scene);
        const meshes = [], hairs = []; let head;
        root.traverse(o => {
          if (o.isBone && /^head(?:_|$)/i.test(o.name) && !head) head = o;
          if (!o.isMesh) return;
          o.castShadow = true; o.receiveShadow = false; meshes.push(o);
          if (/survivor_hair|commando_hair/i.test(o.name + ' ' + o.material?.name)) hairs.push(o);
        });
        if (!head || !hairs.length) throw new Error('初期モデルの骨格・髪を確認できませんでした');
        const box = bounds(root), height = box.max.y - box.min.y, center = box.getCenter(new THREE.Vector3());
        if (!Number.isFinite(height) || height < .001) throw new Error('モデルの寸法を確認できませんでした');
        gltf.scene.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
        root.scale.setScalar(1.8 / height); root.updateMatrixWorld(true);
        return { root, head, rest: head.quaternion.clone(), meshes, hairs };
      })();
      cache.set(gender, pending); pending.catch(() => { if (cache.get(gender) === pending) cache.delete(gender); });
    }
    const next = await cache.get(gender);
    if (version !== loadVersion) return;
    if (modelRoot) scene.remove(modelRoot);
    record = next; modelRoot = next.root; headBone = next.head; headRest = next.rest;
    headBone.quaternion.copy(headRest); scene.add(modelRoot); state.ready = true;
    $('loader').hidden = true; $('model-name').textContent = gender === 'male' ? 'JONESY' : 'RAMIREZ';
    document.querySelector('.model-label .eyebrow').textContent = `SURVIVOR / ${gender === 'male' ? '01' : '02'}`;
    $('current-choice').textContent = `${gender === 'male' ? '男性' : '女性'} / 初期スキン`;
    frameCamera(state.view, true); requestFrame();
  } catch (error) {
    if (version !== loadVersion) return;
    console.error(error); $('loader').hidden = true;
    $('error').textContent = `キャラクターを読み込めませんでした。${error.message}`; $('error').hidden = false;
  }
}
function frameCamera(view, immediate = false) {
  state.view = view;
  const damping = controls.enableDamping; controls.enableDamping = false; controls.update(0); controls.enableDamping = damping;
  const head = new THREE.Vector3(0, 1.6, 0); if (headBone) headBone.getWorldPosition(head);
  const narrow = camera.aspect < .8;
  const target = view === 'head' ? new THREE.Vector3(0, Math.min(1.67, head.y + .075), 0) : new THREE.Vector3(0, .94, 0);
  const position = view === 'head' ? new THREE.Vector3(0, target.y + .01, narrow ? 1.3 : 1.05) : new THREE.Vector3(0, 1, narrow ? 4.65 : 3.85);
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(position); controls.target.copy(target); transition = null; }
  else transition = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: position, toTarget: target, start: performance.now() };
  for (const v of ['body', 'head']) { $(`frame-${v}`).classList.toggle('active', v === view); $(`frame-${v}`).setAttribute('aria-pressed', String(v === view)); }
  requestFrame();
}
function genderButtons() {
  document.querySelectorAll('[data-gender]').forEach(b => { b.classList.toggle('selected', b.dataset.gender === state.gender); b.setAttribute('aria-pressed', String(b.dataset.gender === state.gender)); });
}
document.querySelectorAll('[data-gender]').forEach(button => button.addEventListener('click', () => {
  const gender = button.dataset.gender; if (gender === state.gender) return;
  state.gender = gender; state.pose = false; $('pose-check').setAttribute('aria-pressed', 'false');
  try { localStorage.setItem(STORAGE_KEY, gender); } catch { /* Optional local storage. */ }
  genderButtons(); loadModel(gender);
}));
$('frame-body').addEventListener('click', () => frameCamera('body'));
$('frame-head').addEventListener('click', () => frameCamera('head'));
$('reset-view').addEventListener('click', () => frameCamera(state.view));
$('auto-rotate').addEventListener('click', () => { state.rotate = !state.rotate; controls.autoRotate = state.rotate; $('auto-rotate').setAttribute('aria-pressed', String(state.rotate)); requestFrame(); });
$('pose-check').addEventListener('click', () => { state.pose = !state.pose; $('pose-check').setAttribute('aria-pressed', String(state.pose)); requestFrame(); });
$('reset-customization').addEventListener('click', () => {
  state.rotate = false; state.pose = false; controls.autoRotate = false;
  $('pose-check').setAttribute('aria-pressed', 'false'); $('auto-rotate').setAttribute('aria-pressed', 'false'); frameCamera('body');
});
$('show-credits').addEventListener('click', () => $('credits').showModal());
canvas.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault();
  const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), e.key === 'ArrowLeft' ? -.15 : .15);
  camera.position.copy(controls.target).add(offset); requestFrame();
});
function geometryHash(geometry) {
  let hash = 2166136261;
  for (const array of [...Object.values(geometry.attributes).map(a => a.array), geometry.index?.array].filter(Boolean)) {
    for (const b of new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) hash = Math.imul(hash ^ b, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
Object.defineProperty(window, '__RECLAIM_CHARACTER_REVIEW__', { value: () => {
  if (modelRoot) bounds(modelRoot);
  return {
    ready: state.ready, gender: state.gender, frames, pose: state.pose, rotate: state.rotate,
    meshes: record?.meshes.map(o => ({ name: o.name, visible: o.visible, vertices: o.geometry.attributes.position.count, geometryHash: geometryHash(o.geometry), material: o.material.name, color: o.material.color.getHexString(), map: o.material.map?.uuid })),
    hairMeshes: record?.hairs.map(o => ({ name: o.name, position: o.localToWorld(o.getVertexPosition(0, new THREE.Vector3())).toArray() })),
    bones: record ? new Set(record.meshes.filter(o => o.isSkinnedMesh).flatMap(o => o.skeleton.bones.map(b => b.name))).size : 0,
    headWorldMatrix: headBone?.matrixWorld.toArray(), camera: camera.position.toArray(), target: controls.target.toArray(),
    renderer: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, triangles: renderer.info.render.triangles },
  };
} });
genderButtons(); loadModel(state.gender); requestFrame();
