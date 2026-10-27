import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { batchActorMeshes } from './actor-mesh-batches.ts';

export type PlayerCharacter = 'jonesy' | 'ramirez';
export type ActorMotion = 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Aim' | 'Shoot' | 'Reload' | 'Hit' | 'Death' | 'Melee' | 'Attack' | 'Hover' | 'Patrol' | 'Chase' | 'Ram';
export type EnemyKind = 'drone' | 'humanoid';
export type MissionWeapon = 'assault' | 'sniper' | 'knife';
export type ActorPosition = Readonly<{ x: number; y: number; z: number }>;
export type HeldWeaponPose = Readonly<{
  rear?: number; drop?: number; rise?: number; flash?: number;
  aim?: number; reload?: number; swing?: number; thirdPerson?: boolean;
  cameraPitch?: number; cameraYaw?: number;
  /** Authoritative look pitch, separate from the small cosmetic recoil impulse. */
  lookPitch?: number;
}>;
type ModelId = PlayerCharacter | `${EnemyKind}-lv${1 | 5}`;
export type EmbeddedMissionAssets = Readonly<{
  models?: Partial<Record<ModelId, string>>;
  weapons?: Partial<Record<MissionWeapon, string>>;
}>;
/** Standalone HTML stores binary GLBs as data, never executable source code. */
export function parseEmbeddedMissionAssets(text: string | null): EmbeddedMissionAssets {
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid embedded mission assets');
  const result: { models?: Partial<Record<ModelId, string>>; weapons?: Partial<Record<MissionWeapon, string>> } = {};
  for (const section of ['models', 'weapons'] as const) {
    const value = (parsed as Record<string, unknown>)[section];
    if (value === undefined) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid embedded asset section');
    const allowed = section === 'models' ? ['jonesy', 'ramirez', 'humanoid-lv1', 'drone-lv1', 'humanoid-lv5', 'drone-lv5'] : ['assault', 'sniper', 'knife'];
    const entries: Record<string, string> = {};
    for (const id of allowed) {
      const encoded = (value as Record<string, unknown>)[id];
      if (encoded !== undefined) {
        if (typeof encoded !== 'string' || !encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid embedded asset encoding');
        entries[id] = encoded;
      }
    }
    result[section] = entries;
  }
  return result;
}
export type ActorOptions = Readonly<{
  onLoad?: () => void;
  onError?: (message: string) => void;
  /** Asset overrides also let the offline build provide data URLs. */
  modelUrls?: Partial<Record<ModelId, string>>;
  weaponUrls?: Partial<Record<MissionWeapon, string>>;
  enemyViewDistance?: number;
  /** Defer unused skins/props and reduce visual animation work on touch devices. */
  mobile?: boolean;
  initialWeapon?: MissionWeapon;
}>;

const finite = (n: number) => Number.isFinite(n);
const positionValid = (p: ActorPosition) => finite(p.x) && finite(p.y) && finite(p.z);
const unit = (n: number | undefined) => finite(n ?? 0) ? T.MathUtils.clamp(n ?? 0, 0, 1) : 0;
const offset = (n: number | undefined, max = .3) => finite(n ?? 0) ? T.MathUtils.clamp(n ?? 0, -max, max) : 0;
const baseUrl = () => import.meta.env?.BASE_URL ?? '/';
const DISPLAY: Record<ModelId | MissionWeapon, string> = {
  jonesy: 'ジョンジー', ramirez: 'ラミレス', 'humanoid-lv1': '人型Lv.1', 'humanoid-lv5': '人型Lv.5',
  'drone-lv1': 'ドローンLv.1', 'drone-lv5': 'ドローンLv.5', assault: 'アサルト', sniper: 'スナイパー', knife: 'サバイバルナイフ',
};
const ONCE = new Set<ActorMotion>(['Jump', 'Reload', 'Hit', 'Death', 'Melee', 'Attack', 'Ram']);
const ALIASES: Partial<Record<ActorMotion, readonly string[]>> = {
  Idle: ['Idle', 'Hover'], Hover: ['Hover', 'Idle'], Walk: ['Walk', 'Patrol', 'Idle'],
  Run: ['Run', 'Chase', 'Walk', 'Idle'], Patrol: ['Patrol', 'Hover', 'Idle'],
  Chase: ['Chase', 'Patrol', 'Hover'], Ram: ['Ram', 'Body_Ram', 'Attack', 'Hover'],
  Melee: ['Melee', 'Attack', 'Shoot', 'Idle'], Aim: ['Aim', 'Idle'],
};

/** In-place authored clips. Gameplay remains authoritative over position and damage. */
export class MotionPlayback {
  readonly mixer: T.AnimationMixer;
  readonly root: T.Object3D;
  private readonly clips = new Map<string, T.AnimationClip>();
  private action: T.AnimationAction | null = null;
  private requested: ActorMotion = 'Idle';
  private actual = '';
  private deferredSeconds = 0;
  constructor(root: T.Object3D, clips: readonly T.AnimationClip[]) {
    this.root = root;
    this.mixer = new T.AnimationMixer(root);
    for (const clip of clips) this.clips.set(clip.name.toLowerCase(), clip);
  }
  play(motion: ActorMotion): void {
    if(this.requested===motion&&this.action)return;
    this.requested = motion;
    const choices = ALIASES[motion] ?? [motion, 'Idle', 'Hover'];
    const clip = choices.map(name => this.clips.get(name.toLowerCase())).find(Boolean);
    if (!clip || this.action?.getClip() === clip) return;
    this.flushDeferred();
    const previous = this.action;
    const next = this.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.setLoop(ONCE.has(motion) ? T.LoopOnce : T.LoopRepeat, ONCE.has(motion) ? 1 : Infinity);
    next.clampWhenFinished = ONCE.has(motion);
    next.play();
    // Death must not retain a fragment of a looping locomotion action forever.
    if (previous) previous.crossFadeTo(next, motion === 'Hit' ? .06 : .14, false);
    this.action = next;
    this.actual = clip.name;
  }
  private flushDeferred():void {if(this.deferredSeconds>0){this.mixer.update(this.deferredSeconds);this.deferredSeconds=0;}}
  step(dt: number,visible=true,minimumStep=0): void {
    const elapsed=finite(dt)&&dt>0?Math.min(dt,.1):0;
    if(!visible){this.deferredSeconds+=elapsed;return;}
    // Only the presentation clock is sampled less often; accumulated active
    // time is retained, so clips keep their original speed and duration.
    if(finite(minimumStep)&&minimumStep>0){
      this.deferredSeconds+=elapsed;
      if(this.deferredSeconds+1e-9<Math.min(.1,minimumStep))return;
      this.flushDeferred();return;
    }
    this.flushDeferred();if(elapsed)this.mixer.update(elapsed);
  }
  snapshot() { return { requested: this.requested, clip: this.actual, clips: [...this.clips.values()].map(c => c.name), time: this.action?.time ?? 0 }; }
  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); this.action = null;this.deferredSeconds=0; }
}

type Actor = { root: T.Group; visual: T.Group; motion: MotionPlayback; clips: readonly T.AnimationClip[]; hand: T.Bone | null; fallback: boolean };
type EnemyRequest = { position: {x:number;y:number;z:number}; yaw: number; motion: ActorMotion; level: 1 | 5 };
type Weapon = { first: T.Group; third: T.Group; firstTip: T.Object3D | null; thirdTip: T.Object3D | null };

const updateVisibleWorld=function(this:T.Object3D,force?:boolean):void {if(this.visible)T.Object3D.prototype.updateMatrixWorld.call(this,force);};
const suspendHiddenTransforms=(root:T.Object3D)=>{root.updateMatrixWorld=updateVisibleWorld;};

function resources(root: T.Object3D, geometries: Set<T.BufferGeometry>, materials: Set<T.Material>, textures: Set<T.Texture>): void {
  root.traverse(object => {
    const mesh = object as T.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if ((value as T.Texture | null)?.isTexture) textures.add(value as T.Texture);
    }
  });
}

function normalizeActor(scene: T.Group, animations: readonly T.AnimationClip[], id: ModelId): Actor {
  const root = new T.Group(), visual = new T.Group();
  root.name = `Mission ${id}`;
  visual.name = 'Model axes: authored front +Z to game -Z';
  visual.rotation.y = Math.PI;
  visual.add(scene); root.add(visual);
  root.updateMatrixWorld(true);
  const skins=new Set<T.Skeleton>();scene.traverse(object => { const mesh = object as T.SkinnedMesh; if (mesh.isSkinnedMesh) skins.add(mesh.skeleton); });skins.forEach(skin=>skin.update());
  const bounds = new T.Box3().setFromObject(scene, true);
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  if (![size.x, size.y, size.z].every(finite) || Math.min(size.x, size.y, size.z) <= 0) throw new Error('Invalid model bounds');
  // Player exports are normalized to 1.8m as well, so this is also safe for the
  // original supplied skins when an asset override is used during development.
  const player = id === 'jonesy' || id === 'ramirez';
  const scale = player ? 1.8 / size.y : 1;
  // Canonical character exports have feet/body origins authored at X/Z=0.
  // A whole-body bounding-box centre would shift when a rifle-ready hand or a
  // long helmet extends forward, causing the feet to drift from the controller.
  scene.position.y -= id.startsWith('drone') ? center.y : bounds.min.y;
  visual.scale.setScalar(scale);
  let hand: T.Bone | null = null;
  root.traverse(object => {
    const mesh = object as T.Mesh;
    if(id==='ramirez'&&mesh.isMesh){
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if(materials.some(material=>/head/i.test(material.name)))mesh.geometry.computeVertexNormals();
    }
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    if ((object as T.SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
    if ((object as T.Bone).isBone && /^hand_r(?:_|$)/i.test(object.name)) hand = object as T.Bone;
  });
  batchActorMeshes(scene,animations);
  const motion = new MotionPlayback(scene, animations);
  motion.play(id.startsWith('drone') ? 'Hover' : 'Idle');
  root.updateMatrixWorld(true);
  suspendHiddenTransforms(root);
  return { root, visual, motion, clips: animations, hand, fallback: false };
}

function fallbackActor(id: ModelId): Actor {
  const root = new T.Group(), visual = new T.Group(); root.add(visual);
  const material = new T.MeshLambertMaterial({ color: id.startsWith('humanoid') ? 0x909591 : 0x647365 });
  if (id.startsWith('drone')) visual.add(new T.Mesh(new T.BoxGeometry(.64, .22, .5), material));
  else { const body = new T.Mesh(new T.CapsuleGeometry(.22, 1.18, 4, 8), material); body.position.y = .83; visual.add(body); }
  root.name = `Unavailable model fallback: ${id}`;
  suspendHiddenTransforms(root);
  return { root, visual, motion: new MotionPlayback(visual, []), clips: [], hand: null, fallback: true };
}

function cloneActor(template: Actor): Actor {
  const root=cloneSkeleton(template.root) as T.Group;
  const visual=root.children[0] as T.Group;
  // SkeletonUtils clones one Skeleton per mesh even when the GLB shared a skin.
  // Preserve that sharing inside an actor, while every actor retains its own bones.
  const sourceMeshes:T.SkinnedMesh[]=[],clonedMeshes:T.SkinnedMesh[]=[],skins=new Map<T.Skeleton,T.Skeleton>();
  template.root.traverse(object=>{if((object as T.SkinnedMesh).isSkinnedMesh)sourceMeshes.push(object as T.SkinnedMesh);});
  root.traverse(object=>{if((object as T.SkinnedMesh).isSkinnedMesh)clonedMeshes.push(object as T.SkinnedMesh);});
  for(let index=0;index<clonedMeshes.length;index++){
    const mesh=clonedMeshes[index],source=sourceMeshes[index].skeleton,shared=skins.get(source);
    if(shared){mesh.skeleton.dispose();mesh.skeleton=shared;}else skins.set(source,mesh.skeleton);
  }
  let hand:T.Bone|null=null;
  root.traverse(object=>{if((object as T.Bone).isBone&&/^hand_r(?:_|$)/i.test(object.name))hand=object as T.Bone;});
  suspendHiddenTransforms(root);
  return {root,visual,motion:new MotionPlayback(root,template.clips),clips:template.clips,hand,fallback:template.fallback};
}

type EnemyUnit={actor:Actor;template:Actor;kind:EnemyKind;model:ModelId;displayModel:ModelId;request:EnemyRequest};

function fallbackWeapon(kind: MissionWeapon): T.Group {
  const group = new T.Group(), material = new T.MeshLambertMaterial({ color: 0x4e5857 });
  const body = new T.Mesh(new T.BoxGeometry(kind === 'knife' ? .32 : .8, .09, .07), material);
  body.position.x = kind === 'knife' ? .12 : .1; group.add(body);
  const tip = new T.Object3D(); tip.name = 'Tip_Visual'; tip.position.x = kind === 'knife' ? .28 : .5; group.add(tip);
  return group;
}

/** Owns decoded mission models, animation mixers and held-prop presentation. */
export class MissionActors {
  readonly scene: T.Scene;
  readonly camera: T.Camera;
  readonly character: PlayerCharacter;
  readonly options: ActorOptions;
  private disposed = false;
  private status: 'idle' | 'loading' | 'ready' | 'degraded' | 'disposed' = 'idle';
  private pending: Promise<void> | null = null;
  private readonly actors = new Map<ModelId, Actor>();
  private readonly weapons = new Map<MissionWeapon, Weapon>();
  private readonly loadingVariants = new Set<ModelId>();
  private readonly loadingWeapons = new Set<MissionWeapon>();
  private readonly failed = new Set<string>();
  private readonly enemyRequests = new Map<EnemyKind, EnemyRequest>();
  private readonly enemyUnits = new Map<string, EnemyUnit>();
  private readonly deferredUnits = new Map<string, {kind:EnemyKind;request:EnemyRequest}>();
  private readonly placeholders = new Map<EnemyKind, Actor>();
  private enemyViewDistance = 180;
  private readonly firstWeaponHolder = new T.Group();
  private readonly thirdWeaponHolder = new T.Group();
  private readonly owned = new Set<T.Object3D>();
  private embedded: EmbeddedMissionAssets | null = null;
  private readonly scratch = new T.Vector3();
  private readonly playerPosition = { x: 0, y: 0, z: 0 };
  private playerYaw = 0;
  private playerMotion: ActorMotion = 'Idle';
  private thirdPerson = false;
  private selectedWeapon: MissionWeapon = 'assault';
  private weaponPose: HeldWeaponPose = {};
  constructor(scene: T.Scene, camera: T.Camera, character: PlayerCharacter = 'jonesy', options: ActorOptions = {}) {
    this.scene = scene; this.camera = camera; this.character = character; this.options = options;
    this.selectedWeapon=options.initialWeapon??'assault';
    if(finite(options.enemyViewDistance??NaN))this.enemyViewDistance=T.MathUtils.clamp(options.enemyViewDistance!,30,250);
    this.firstWeaponHolder.name = 'First person held weapon';
    this.thirdWeaponHolder.name = 'Third person held weapon';
    camera.add(this.firstWeaponHolder);
    this.firstWeaponHolder.scale.setScalar(.7);
    scene.add(this.thirdWeaponHolder);
    this.firstWeaponHolder.visible = false;
    this.thirdWeaponHolder.visible = false;
    suspendHiddenTransforms(this.firstWeaponHolder);suspendHiddenTransforms(this.thirdWeaponHolder);
  }
  load(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.disposed) return Promise.resolve();
    this.status = 'loading';
    if (this.embedded === null) {
      try {
        this.embedded = parseEmbeddedMissionAssets(typeof document === 'undefined' ? null : document.getElementById('reclaim-mission-assets')?.textContent ?? null);
      } catch {
        this.embedded = {};
        this.report('embedded');
      }
    }
    this.pending = (async () => {
      await Promise.all(this.options.mobile?[this.loadWeapon(this.selectedWeapon)]:[
        this.loadActor(this.character), this.loadActor('humanoid-lv1'), this.loadActor('drone-lv1'),
        ...(['assault', 'sniper', 'knife'] as const).map(kind => this.loadWeapon(kind)),
      ]);
      if (this.disposed) return;
      this.status = this.failed.size ? 'degraded' : 'ready';
      this.setPlayer(this.playerPosition, this.playerYaw, this.playerMotion, 0, this.thirdPerson);
      for (const [kind, request] of this.enemyRequests) this.setEnemy(kind, request.position, request.yaw, request.motion, 0, request.level);
      this.setWeapon(this.selectedWeapon, this.weaponPose);
      this.options.onLoad?.();
    })();
    return this.pending;
  }
  private report(id: string): void {
    if (this.disposed || this.failed.has(id)) return;
    this.failed.add(id);
    if (this.status === 'ready') this.status = 'degraded';
    this.options.onError?.(`${id === 'embedded' ? '同梱モデル' : DISPLAY[id as keyof typeof DISPLAY] ?? id}の3Dデータを読み込めなかったため、仮表示に切り替えました。`);
  }
  private discard(root: T.Object3D): void {
    const g = new Set<T.BufferGeometry>(), m = new Set<T.Material>(), t = new Set<T.Texture>();
    resources(root, g, m, t); g.forEach(v => v.dispose()); m.forEach(v => v.dispose()); t.forEach(v => v.dispose());
  }
  private async loadActor(id: ModelId): Promise<void> {
    if (this.actors.has(id) || this.loadingVariants.has(id) || this.disposed) return;
    this.loadingVariants.add(id);
    let actor: Actor;
    let decoded: T.Group | null = null;
    try {
      const encoded = this.embedded?.models?.[id];
      const gltf = await new GLTFLoader().loadAsync(this.options.modelUrls?.[id] ?? (encoded ? `data:model/gltf-binary;base64,${encoded}` : `${baseUrl()}mission-models/${id}.glb`));
      decoded = gltf.scene;
      if (this.disposed) { this.discard(gltf.scene); return; }
      actor = normalizeActor(gltf.scene, gltf.animations, id);
    } catch {
      if (this.disposed) return;
      if (decoded) this.discard(decoded);
      this.report(id); actor = fallbackActor(id);
    } finally { this.loadingVariants.delete(id); }
    this.actors.set(id, actor);
    this.owned.add(actor.root); this.scene.add(actor.root); actor.root.visible = false;
    if (id !== this.character) {
      const kind: EnemyKind = id.startsWith('drone') ? 'drone' : 'humanoid';
      const request = this.enemyRequests.get(kind);
      if (request) this.setEnemy(kind, request.position, request.yaw, request.motion, 0, request.level);
    }
    for(const [unitId,unit] of [...this.enemyUnits])this.setEnemyUnit(unitId,unit.kind,unit.request.position,unit.request.yaw,unit.request.motion,0,unit.request.level);
    this.options.onLoad?.();
  }
  private async loadWeapon(kind: MissionWeapon): Promise<void> {
    if(this.weapons.has(kind)||this.loadingWeapons.has(kind)||this.disposed||this.failed.has(kind))return;
    this.loadingWeapons.add(kind);
    let first: T.Group;
    try {
      const encoded = this.embedded?.weapons?.[kind];
      const gltf = await new GLTFLoader().loadAsync(this.options.weaponUrls?.[kind] ?? (encoded ? `data:model/gltf-binary;base64,${encoded}` : `${baseUrl()}mission-weapons/${kind}.glb`));
      if (this.disposed) { this.discard(gltf.scene); this.loadingWeapons.delete(kind); return; }
      first = new T.Group(); first.add(gltf.scene);
      batchActorMeshes(gltf.scene,gltf.animations);
      first.updateMatrixWorld(true);
      const grip = gltf.scene.getObjectByName('Grip_R');
      if (grip) gltf.scene.position.sub(grip.getWorldPosition(new T.Vector3()));
    } catch {
      if (this.disposed) { this.loadingWeapons.delete(kind); return; }
      this.report(kind); first = fallbackWeapon(kind);
    }
    this.loadingWeapons.delete(kind);
    const third = cloneSkeleton(first) as T.Group;
    suspendHiddenTransforms(first);suspendHiddenTransforms(third);
    // Keep depth testing between the model's own separate mechanical parts.
    // Disabling it lets the stock and scope's rear surfaces cover the view.
    first.traverse(object => {
      const mesh = object as T.Mesh;
      if (!mesh.isMesh) return;
      const change = (material: T.Material) => { const copy = material.clone(); copy.depthTest = true; copy.depthWrite = true; return copy; };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(change) : change(mesh.material);
      mesh.renderOrder = 0;
      mesh.frustumCulled = false;
    });
    this.owned.add(first); this.owned.add(third);
    this.firstWeaponHolder.add(first); this.thirdWeaponHolder.add(third);
    first.visible = third.visible = false;
    this.weapons.set(kind, { first, third, firstTip: first.getObjectByName('Tip_Visual') ?? null, thirdTip: third.getObjectByName('Tip_Visual') ?? null });
    this.setWeapon(this.selectedWeapon, this.weaponPose);
    if(this.options.mobile)this.options.onLoad?.();
  }
  setPlayer(position: ActorPosition, yaw: number, motion: ActorMotion, dt: number, thirdPerson: boolean): void {
    if (this.disposed || !positionValid(position) || !finite(yaw)) return;
    this.playerPosition.x=position.x;this.playerPosition.y=position.y;this.playerPosition.z=position.z;this.playerYaw = yaw; this.playerMotion = motion; this.thirdPerson = thirdPerson;
    if(this.options.mobile&&thirdPerson&&!this.actors.has(this.character))void this.loadActor(this.character);
    const actor = this.actors.get(this.character);
    if (actor) {
      actor.root.position.set(position.x, position.y, position.z);
      actor.root.rotation.y = yaw;
      actor.root.visible = thirdPerson;
      if(!this.options.mobile||thirdPerson){actor.motion.play(motion);actor.motion.step(dt,thirdPerson,this.options.mobile?.05:0);}
    }
    this.positionThirdWeapon();
    this.firstWeaponHolder.visible = !thirdPerson && this.weapons.has(this.selectedWeapon);
    this.thirdWeaponHolder.visible = thirdPerson && this.weapons.has(this.selectedWeapon);
  }
  setEnemy(kind: EnemyKind, position: ActorPosition, yaw: number, motion: ActorMotion, dt: number, level: 1 | 5 = 1): void {
    if (this.disposed || !positionValid(position) || !finite(yaw)) return;
    let request=this.enemyRequests.get(kind);
    if(!request){request={position:{...position},yaw,motion,level};this.enemyRequests.set(kind,request);}
    else{request.position.x=position.x;request.position.y=position.y;request.position.z=position.z;request.yaw=yaw;request.motion=motion;request.level=level;}
    const id: ModelId = `${kind}-lv${level}`;
    const visible=!this.options.mobile||Math.hypot(position.x-this.playerPosition.x,position.z-this.playerPosition.z)<=this.enemyViewDistance;
    if (!this.actors.has(id) && (this.options.mobile?visible:level===5)) void this.loadActor(id);
    const actor = this.actors.get(id) ?? this.actors.get(`${kind}-lv1`);
    for (const tier of [1, 5] as const) { const other = this.actors.get(`${kind}-lv${tier}`); if (other) other.root.visible = other === actor&&visible; }
    if (!actor) return;
    actor.root.position.set(position.x, position.y, position.z); actor.root.rotation.y = yaw;
    if(visible){actor.motion.play(motion);actor.motion.step(dt,true,this.options.mobile?.05:0);}
  }
  /** Independent authored actors; cloned skeletons share cached geometry/textures. */
  setEnemyUnit(id:string,kind:EnemyKind,position:ActorPosition,yaw:number,motion:ActorMotion,dt:number,level:1|5=1):void {
    if(this.disposed||!id||id.length>128||!positionValid(position)||!finite(yaw)||(kind!=='humanoid'&&kind!=='drone')||(level!==1&&level!==5))return;
    if(!this.enemyUnits.has(id)&&!this.deferredUnits.has(id)&&this.enemyUnits.size+this.deferredUnits.size>=50)return;
    const near=Math.hypot(position.x-this.playerPosition.x,position.z-this.playerPosition.z)<=this.enemyViewDistance;
    if(this.options.mobile&&!near){
      const existing=this.enemyUnits.get(id);
      if(existing){existing.actor.root.visible=false;Object.assign(existing.request.position,position);existing.request.yaw=yaw;existing.request.motion=motion;existing.request.level=level;}
      else {
        const deferred=this.deferredUnits.get(id);
        if(deferred){deferred.kind=kind;Object.assign(deferred.request.position,position);deferred.request.yaw=yaw;deferred.request.motion=motion;deferred.request.level=level;}
        else this.deferredUnits.set(id,{kind,request:{position:{...position},yaw,motion,level}});
      }
      return;
    }
    this.deferredUnits.delete(id);
    if(this.status==='idle')void this.load();
    const model:ModelId=`${kind}-lv${level}`,base:ModelId=`${kind}-lv1`;
    if(!this.actors.has(model)&&!this.loadingVariants.has(model))void this.loadActor(model);
    let template=this.actors.get(model)??this.actors.get(base),displayModel=this.actors.has(model)?model:base;
    if(!template){
      if(!this.placeholders.has(kind)){const placeholder=fallbackActor(base);this.placeholders.set(kind,placeholder);this.owned.add(placeholder.root);}
      template=this.placeholders.get(kind)!;displayModel=base;
    }
    let unit=this.enemyUnits.get(id);
    if(!unit||unit.template!==template||unit.model!==model){
      if(unit)this.removeEnemyUnit(id);
      const actor=cloneActor(template);actor.root.name=`Enemy unit ${id} (${model})`;this.scene.add(actor.root);
      unit={actor,template,kind,model,displayModel,request:{position:{...position},yaw,motion,level}};this.enemyUnits.set(id,unit);
    }
    unit.kind=kind;unit.displayModel=displayModel;unit.request.position.x=position.x;unit.request.position.y=position.y;unit.request.position.z=position.z;unit.request.yaw=yaw;unit.request.motion=motion;unit.request.level=level;
    unit.actor.root.position.set(position.x,position.y,position.z);unit.actor.root.rotation.y=yaw;
    const dx=position.x-this.playerPosition.x,dz=position.z-this.playerPosition.z;unit.actor.root.visible=dx*dx+dz*dz<=this.enemyViewDistance*this.enemyViewDistance;
    unit.actor.motion.play(motion);if(unit.actor.root.visible)unit.actor.motion.step(dt,true,this.options.mobile?.05:0);
  }
  setEnemyViewDistance(metres:number):void {
    if(!finite(metres))return;this.enemyViewDistance=T.MathUtils.clamp(metres,30,250);
    for(const unit of this.enemyUnits.values())unit.actor.root.visible=Math.hypot(unit.request.position.x-this.playerPosition.x,unit.request.position.z-this.playerPosition.z)<=this.enemyViewDistance;
  }
  removeEnemyUnit(id:string):void {
    this.deferredUnits.delete(id);
    const unit=this.enemyUnits.get(id);if(!unit)return;
    unit.actor.motion.dispose();const skeletons=new Set<T.Skeleton>();
    unit.actor.root.traverse(object=>{const mesh=object as T.SkinnedMesh;if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);});
    skeletons.forEach(skeleton=>skeleton.dispose());unit.actor.root.removeFromParent();this.enemyUnits.delete(id);
  }
  resetEnemyUnits():void {for(const id of [...this.enemyUnits.keys()])this.removeEnemyUnit(id);this.deferredUnits.clear();}
  resetEnemies():void {
    this.resetEnemyUnits();this.enemyRequests.clear();
    for(const [id,actor] of this.actors)if(id!==this.character)actor.root.visible=false;
  }
  private positionThirdWeapon(): void {
    if(!this.thirdPerson)return;
    const actor = this.actors.get(this.character);
    this.thirdWeaponHolder.position.set(this.playerPosition.x, this.playerPosition.y + 1.14, this.playerPosition.z);
    this.thirdWeaponHolder.rotation.set(offset(this.weaponPose.lookPitch, 1.4), this.playerYaw, 0, 'YXZ');
    // Position follows the actual animated wrist. Forward alignment stays with
    // the character, avoiding differing original hand-bone roll between skins.
    if (actor?.hand) this.thirdWeaponHolder.position.copy(actor.hand.getWorldPosition(this.scratch));
    else this.thirdWeaponHolder.position.add(new T.Vector3(.23, 0, -.2).applyAxisAngle(T.Object3D.DEFAULT_UP, this.playerYaw));
  }
  setWeapon(kind: MissionWeapon, pose: HeldWeaponPose = {}): void {
    if (this.disposed) return;
    this.selectedWeapon = kind; this.weaponPose = { ...pose };
    if(this.options.mobile&&!this.weapons.has(kind))void this.loadWeapon(kind);
    if (pose.thirdPerson !== undefined) this.thirdPerson = pose.thirdPerson;
    const aim = unit(pose.aim), reload = unit(pose.reload), swing = unit(pose.swing);
    const reloadArc = Math.sin(reload * Math.PI), slash = swing;
    const rear = offset(pose.rear), drop = offset(pose.drop), rise = offset(pose.rise);
    this.firstWeaponHolder.position.set(T.MathUtils.lerp(.25, .10, aim) + reloadArc * .08 - slash * .18,
      T.MathUtils.lerp(-.27, -.23, aim) - drop - reloadArc * .2 + slash * .06, -.78 + rear + reloadArc * .08);
    this.firstWeaponHolder.rotation.set(rise + reloadArc * .45 - slash * .3, Math.PI / 2 - slash * .95, -reloadArc * .3 + slash * .65);
    this.positionThirdWeapon();
    for (const [id, weapon] of this.weapons) {
      weapon.first.visible = weapon.third.visible = id === kind;
      weapon.third.rotation.set(rise + reloadArc * .35, Math.PI / 2 - slash * .8, -reloadArc * .25 + slash * .6);
      weapon.third.position.set(0, -drop - reloadArc * .1, rear);
    }
    this.firstWeaponHolder.visible = !this.thirdPerson && this.weapons.has(kind) && !(kind==='sniper'&&aim>.12);
    this.thirdWeaponHolder.visible = this.thirdPerson && this.weapons.has(kind);
  }
  muzzleWorld(target = new T.Vector3()): T.Vector3 | null {
    if (this.disposed || this.selectedWeapon === 'knife') return null;
    const weapon = this.weapons.get(this.selectedWeapon);
    if (!weapon) return null;
    const tip = this.thirdPerson ? weapon.thirdTip : weapon.firstTip;
    const holder = this.thirdPerson ? weapon.third : weapon.first;
    return tip ? tip.getWorldPosition(target) : holder.localToWorld(target.set(.65, .16, 0));
  }
  snapshot() {
    const weaponGeometry: Partial<Record<MissionWeapon, number>> = {};
    const unitGeometries=new Set<T.BufferGeometry>(),unitMaterials=new Set<T.Material>(),unitTextures=new Set<T.Texture>(),unitSkeletons=new Set<T.Skeleton>();
    for(const unit of this.enemyUnits.values()){resources(unit.actor.root,unitGeometries,unitMaterials,unitTextures);unit.actor.root.traverse(object=>{const mesh=object as T.SkinnedMesh;if(mesh.isSkinnedMesh)unitSkeletons.add(mesh.skeleton);});}
    for (const [kind, weapon] of this.weapons) {
      let triangles = 0;
      weapon.first.traverse(object => { const mesh = object as T.Mesh; if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3; });
      weaponGeometry[kind] = triangles;
    }
    return {
      status: this.status, ready: this.status === 'ready', failed: [...this.failed], character: this.character,
      models: [...this.actors.keys()], weapons: [...this.weapons.keys()], thirdPerson: this.thirdPerson,
      weapon: this.selectedWeapon, viewmodelVisible:this.firstWeaponHolder.visible, player: this.actors.get(this.character)?.motion.snapshot() ?? null,
      weaponGeometry, embedded: this.embedded !== null && Boolean(this.embedded.models || this.embedded.weapons),
      enemies: [...this.enemyRequests].map(([kind, r]) => ({ kind, level: r.level, motion: r.motion,
        loaded: this.actors.has(`${kind}-lv${r.level}`), fallback: this.actors.get(`${kind}-lv${r.level}`)?.fallback ?? false })),
      enemyUnitCount:this.enemyUnits.size,enemyUnitLimit:50,enemyViewDistance:this.enemyViewDistance,
      mobile:this.options.mobile??false,deferredEnemyUnitCount:this.deferredUnits.size,animationRate:this.options.mobile?20:null,
      enemyUnitResources:{geometries:unitGeometries.size,materials:unitMaterials.size,textures:unitTextures.size,skeletons:unitSkeletons.size},
      enemyUnits:[...this.enemyUnits].map(([id,unit])=>({id,kind:unit.kind,level:unit.request.level,model:unit.model,displayModel:unit.displayModel,visible:unit.actor.root.visible,loaded:this.actors.has(unit.model),fallback:unit.actor.fallback,position:{...unit.request.position},motion:unit.actor.motion.snapshot()})),
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.status = 'disposed';
    this.resetEnemyUnits();
    for (const actor of this.actors.values()) actor.motion.dispose();
    for(const actor of this.placeholders.values())actor.motion.dispose();
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    const skeletons=new Set<T.Skeleton>();
    for (const root of this.owned) { resources(root, geometries, materials, textures);root.traverse(object=>{const mesh=object as T.SkinnedMesh;if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);}); root.removeFromParent(); }
    skeletons.forEach(skeleton=>skeleton.dispose());
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    this.firstWeaponHolder.removeFromParent(); this.thirdWeaponHolder.removeFromParent();
    this.owned.clear(); this.actors.clear(); this.weapons.clear(); this.loadingVariants.clear();this.loadingWeapons.clear(); this.enemyRequests.clear();this.placeholders.clear();
  }
}
