import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MotionPlayback, type ActorMotion, type ActorPosition } from './actors.ts';

export type BossModel = 'boar' | 'owl';
export type BossActorOptions = Readonly<{
  modelUrls?: Partial<Record<BossModel, string>>;
  onLoad?: () => void;
  onError?: (message: string) => void;
  viewDistance?: number;
  /** Stream distant boss visuals only when a touch player approaches. */
  mobile?: boolean;
}>;
export type EmbeddedBossAssets = Partial<Record<BossModel, string>>;
const IDS = ['boar', 'owl'] as const;
const NAMES = { boar: '錆猪', owl: '哨戒梟' };
const CLIPS = ['Idle', 'Walk', 'Chase', 'Attack', 'Hit', 'Death'];
const finitePosition = (p: ActorPosition) => [p.x, p.y, p.z].every(Number.isFinite);

/** Binary assets remain data when the game is opened directly from Explorer. */
export function parseEmbeddedBossAssets(text: string | null): EmbeddedBossAssets {
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid embedded boss assets');
  const result: EmbeddedBossAssets = {};
  for (const id of IDS) {
    const value = (parsed as Record<string, unknown>)[id];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.length || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid embedded boss encoding');
    result[id] = value;
  }
  return result;
}

type BossRequest = { id: string; position: ActorPosition; yaw: number; motion: string };
type BossVisual = { root: T.Group; motion: MotionPlayback; height: number; width: number; depth: number; meshes: number };

function disposeVisual(root: T.Object3D): void {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>(), skeletons = new Set<T.Skeleton>();
  root.traverse(object => {
    const mesh = object as T.SkinnedMesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if ((value as T.Texture | null)?.isTexture) textures.add(value as T.Texture);
    }
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); skeletons.forEach(value => value.dispose());
  root.removeFromParent();
}

/** Two authored bosses, with independent animation mixers and no proxy models. */
export class BossActors {
  private readonly visuals = new Map<BossModel, BossVisual>();
  private readonly requests = new Map<BossModel, BossRequest>();
  private readonly failed = new Set<string>();
  private readonly loading = new Set<BossModel>();
  private readonly scratch = new T.Vector3();
  private pending: Promise<void> | null = null;
  private embedded: EmbeddedBossAssets = {};
  private disposed = false;
  private status = 'idle';
  private viewDistance = 180;
  private readonly scene: T.Scene;
  private readonly camera: T.Camera;
  private readonly options: BossActorOptions;
  constructor(scene: T.Scene, camera: T.Camera, options: BossActorOptions = {}) {
    this.scene = scene; this.camera = camera; this.options = options;
    this.setViewDistance(options.viewDistance ?? 180);
  }
  setViewDistance(distance: number): void { if (Number.isFinite(distance)) this.viewDistance = T.MathUtils.clamp(distance, 30, 300); }
  load(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.disposed) return Promise.resolve();
    this.status = 'loading';
    try { this.embedded = parseEmbeddedBossAssets(typeof document === 'undefined' ? null : document.getElementById('reclaim-boss-assets')?.textContent ?? null); }
    catch { this.report('embedded'); }
    this.pending = Promise.all(this.options.mobile?[]:IDS.map(id => this.loadModel(id))).then(() => {
      if (this.disposed) return;
      this.status = this.failed.size ? 'degraded' : 'ready';
      for (const [kind, request] of this.requests) this.setBoss(request.id, kind, request.position, request.yaw, request.motion, 0);
      this.options.onLoad?.();
    });
    return this.pending;
  }
  private report(id: string): void {
    if (this.disposed || this.failed.has(id)) return;
    this.failed.add(id);
    this.options.onError?.(`${id === 'embedded' ? '同梱ボス' : NAMES[id as BossModel]}の3Dデータを読み込めませんでした。`);
  }
  private async loadModel(id: BossModel): Promise<void> {
    if(this.disposed||this.visuals.has(id)||this.loading.has(id)||this.failed.has(id))return;
    this.loading.add(id);
    let decoded: T.Group | null = null;
    try {
      const encoded = this.embedded[id], url = this.options.modelUrls?.[id] ?? (encoded ? `data:model/gltf-binary;base64,${encoded}` : `${import.meta.env?.BASE_URL ?? '/'}mission-bosses/${id}.glb`);
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
      decoded = gltf.scene;
      if (this.disposed) { disposeVisual(decoded); return; }
      if (!CLIPS.every(name => gltf.animations.some(clip => clip.name === name && clip.tracks.length))) throw new Error('Missing boss motion');
      decoded.updateMatrixWorld(true);
      const skeletons = new Set<T.Skeleton>();
      decoded.traverse(object => { const mesh = object as T.SkinnedMesh; if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
      skeletons.forEach(skeleton => skeleton.update());
      const bounds = new T.Box3().setFromObject(decoded, true), size = bounds.getSize(new T.Vector3());
      if (![size.x, size.y, size.z, bounds.min.y].every(Number.isFinite) || Math.min(size.x, size.y, size.z) <= 0) throw new Error('Invalid boss bounds');
      // Files are in metres, authored facing +Z with feet at ground level.
      // Match the gameplay yaw convention while keeping their authored size.
      const root = new T.Group(), axes = new T.Group();
      root.name = `Mission boss ${id}`; axes.rotation.y = Math.PI;
      decoded.position.y -= bounds.min.y;
      axes.add(decoded); root.add(axes); root.visible = false;
      let meshes = 0;
      decoded.traverse(object => {
        const mesh = object as T.SkinnedMesh;
        if (mesh.isMesh) { meshes++; mesh.castShadow = true; mesh.receiveShadow = true; }
        if (mesh.isSkinnedMesh) mesh.frustumCulled = false;
      });
      root.updateMatrixWorld = function(force?: boolean): void { if (this.visible) T.Object3D.prototype.updateMatrixWorld.call(this, force); };
      const motion = new MotionPlayback(decoded, gltf.animations); motion.play('Idle');
      this.visuals.set(id, { root, motion, height: size.y, width: size.x, depth: size.z, meshes });
      this.scene.add(root);
    } catch {
      if (decoded) disposeVisual(decoded);
      this.report(id);
    } finally {this.loading.delete(id);}
  }
  private ensureNearbyModel(kind:BossModel):void {
    if(this.visuals.has(kind)||this.loading.has(kind)||this.failed.has(kind)||this.disposed)return;
    void this.loadModel(kind).then(()=>{
      if(this.disposed)return;
      this.status=this.failed.size?'degraded':'ready';
      const request=this.requests.get(kind);
      if(request)this.setBoss(request.id,kind,request.position,request.yaw,request.motion,0);
      this.options.onLoad?.();
    });
  }
  setBoss(id: string, kind: BossModel, position: ActorPosition, yaw: number, motion: string, dt: number): void {
    if (this.disposed || !finitePosition(position) || !Number.isFinite(yaw) || !IDS.includes(kind)) return;
    let request = this.requests.get(kind);
    if (!request) { request = { id, position: { ...position }, yaw, motion }; this.requests.set(kind, request); }
    else { request.id = id; Object.assign(request.position, position); request.yaw = yaw; request.motion = motion; }
    this.camera.getWorldPosition(this.scratch);
    const distanceSquared=(position.x-this.scratch.x)**2+(position.y-this.scratch.y)**2+(position.z-this.scratch.z)**2;
    if(this.options.mobile&&distanceSquared<(this.viewDistance+24)**2)this.ensureNearbyModel(kind);
    const visual = this.visuals.get(kind); if (!visual) return;
    visual.root.position.set(position.x, position.y, position.z); visual.root.rotation.y = yaw;
    visual.root.visible = distanceSquared < this.viewDistance * this.viewDistance;
    // Far mobile bosses retain their gameplay requests without touching skeletons.
    if(!this.options.mobile||visual.root.visible){
      visual.motion.play((CLIPS.includes(motion) ? motion : 'Idle') as ActorMotion);
      visual.motion.step(dt,visual.root.visible,this.options.mobile?.05:0);
    }
  }
  reset(): void {
    this.requests.clear();
    for (const visual of this.visuals.values()) { visual.root.visible = false; visual.motion.play('Idle'); visual.motion.mixer.setTime(0); }
  }
  snapshot() {
    return { status: this.status, mobile:this.options.mobile??false,decodedModels:this.visuals.size,animationRate:this.options.mobile?20:null, embedded: !!Object.keys(this.embedded).length, errors: [...this.failed], bosses: [...this.requests].map(([kind, request]) => {
      const visual = this.visuals.get(kind);
      return { id: request.id, kind, loaded: !!visual, visible: visual?.root.visible ?? false, position: { ...request.position }, yaw: request.yaw, ...(visual ? { ...visual.motion.snapshot(), dimensions: { width: visual.width, height: visual.height, depth: visual.depth }, meshes: visual.meshes } : {}) };
    }) };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const visual of this.visuals.values()) { visual.motion.dispose(); disposeVisual(visual.root); }
    this.visuals.clear(); this.requests.clear();this.loading.clear(); this.status = 'disposed';
  }
}
