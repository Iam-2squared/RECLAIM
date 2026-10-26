import { ROUTE } from '../home-state.ts';
import { AREA_DEFINITIONS, AREA_IDS } from '../world/areas.ts';
import type { AreaId } from '../world/types.ts';

/** Local, device-only progress. This is not authenticated or tamper resistant. */
export const CAMPAIGN_KEY = 'reclaim.campaign.v1';
export const CAMPAIGN_VERSION = 1;
export type { AreaId } from '../world/types.ts';
export type Position = Readonly<{ x: number; y: number; z: number }>;
export type IntroStep = 0 | 1 | 2 | 3 | 4;
export type OpeningId = 'wake' | 'radio' | 'friend-contact' | 'leave-cabin';
export type CampaignStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type SaveStatus = 'saved' | 'memory-only' | 'storage-denied';
export type MissionCheckpoint = Readonly<{
  areaId: AreaId; x: number; y: number; z: number; yaw: number; pitch: number; hp: number;
}>;
export type AreaCampaignRule = Readonly<{
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  spawn: Readonly<{ x: number; z: number; y?: number }>;
  exit: Readonly<{ x: number; z: number; radius: number }>;
  checkpoints?: ReadonlyArray<Readonly<{ id: string; x: number; z: number; radius: number }>>;
  minimumTravel: number;
  minY?: number; maxY?: number;
  opening?: Readonly<{ cabin: Readonly<{minX:number;maxX:number;minZ:number;maxZ:number}>; radio: Readonly<{x:number;z:number}>; door: Readonly<{x:number;z:number}>; leaveRadius:number }>;
}>;
export type CampaignRules = Readonly<Record<AreaId, AreaCampaignRule>>;

const AREA_ORDER: readonly AreaId[] = ['shiretoko', 'ishikari-mountains', 'hidaka-mountains', 'sapporo'];
const AREA_NAMES: Readonly<Record<AreaId, string>> = {
  shiretoko: '知床', 'ishikari-mountains': '石狩山地', 'hidaka-mountains': '日高山脈', sapporo: '札幌',
};
const MAX_POSITION_STEP = 12;
const CABIN = Object.freeze({ minX: -5, maxX: 5, minZ: -6, maxZ: 5 });

/** PROVISIONAL developer passage criteria; not geographic survey or final mission balance. */
export const CAMPAIGN_RULES: CampaignRules = Object.freeze(Object.fromEntries(AREA_IDS.map(id => {
  const area = AREA_DEFINITIONS[id], exit = area.exitTriggers[0];
  return [id, Object.freeze({
    bounds: Object.freeze({ ...area.bounds }), spawn: Object.freeze({ x: area.spawn.x, z: area.spawn.z, y: area.route[0].height }),
    exit: Object.freeze({ ...exit.position, radius: exit.radius }),
    checkpoints: Object.freeze(area.landmarks.filter(p => p.type === 'checkpoint').map(p => Object.freeze({ id: p.id, ...p.position, radius: p.radius }))),
    minimumTravel: id === 'shiretoko' ? 50 : 70,
  })];
})) as unknown as Record<AreaId, AreaCampaignRule>);

export const OPENING = Object.freeze([
  { id: 'wake' as const, label: '朝の目覚め', text: '知床の端にある木造の家。主人公は一人、朝を迎えた。', provisional: true },
  { id: 'radio' as const, label: 'ラジオの報道', text: 'ラジオから、日本各地でAIが暴走し、危機的な状況が広がっているという報道が流れる。', provisional: true },
  { id: 'friend-contact' as const, label: '親友からの連絡', text: '東京にいる親友から連絡が届く。「一緒に日本を脱出しよう」。東京での合流を目指し、まず札幌へ向かう。', provisional: true },
  { id: 'leave-cabin' as const, label: '家を出る', text: '通信や自律制御を頼り切ることはできない。装備を手に、森への道を歩き始める。', provisional: true },
]);

export type TraversalState = Readonly<{
  areaId: AreaId; distance: number; lastPosition: Position; passedCheckpointIds: readonly string[];
}>;
export type PassageEvidence = Readonly<{
  areaId: AreaId; position: Position; distance: number; passedCheckpointIds: readonly string[]; provisional: true;
}>;
export type Campaign = Readonly<{
  version: 1; introStep: IntroStep; droneDefeated: boolean;
  completedAreaIds: readonly AreaId[]; passages: readonly PassageEvidence[];
  checkpoint: MissionCheckpoint | null; traversal: TraversalState | null;
}>;
export type CampaignEvent =
  | { type: 'opening'; step: OpeningId; areaId: 'shiretoko'; position: Position; grounded: boolean; skipped?: boolean }
  | { type: 'position'; areaId: AreaId; position: Position; grounded: boolean }
  | { type: 'drone-defeated'; areaId: 'shiretoko'; enemyId: string; remainingHp: number; hitCount: number }
  | { type: 'area-exit'; areaId: AreaId; position: Position; grounded: boolean };

export function campaignDefaults(): Campaign {
  return freezeCampaign({ version: 1, introStep: 0, droneDefeated: false, completedAreaIds: [], passages: [], checkpoint: null, traversal: null });
}

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function areaId(value: unknown): value is AreaId { return AREA_ORDER.includes(value as AreaId); }
function horizontal(a: Readonly<{ x: number; z: number }>, b: Readonly<{ x: number; z: number }>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function position(value: unknown, rule: AreaCampaignRule): Position | null {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.z)) return null;
  const b = rule.bounds;
  if (value.x < b.minX || value.x > b.maxX || value.z < b.minZ || value.z > b.maxZ || value.y < (rule.minY ?? -200) || value.y > (rule.maxY ?? 1400)) return null;
  return { x: value.x, y: value.y, z: value.z };
}
function inCabin(p: Position, rule:AreaCampaignRule): boolean {
  const cabin=rule.opening?.cabin??CABIN;
  return p.x >= cabin.minX && p.x <= cabin.maxX && p.z >= cabin.minZ && p.z <= cabin.maxZ;
}
function checkpointIds(value: unknown, rule: AreaCampaignRule): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = rule.checkpoints?.map(c => c.id) ?? [];
  return allowed.filter(id => value.includes(id));
}
function completedCheckpoints(ids: readonly string[], rule: AreaCampaignRule): boolean {
  return (rule.checkpoints ?? []).every(c => ids.includes(c.id));
}
function freezeCampaign(value: Campaign): Campaign {
  return Object.freeze({
    version: 1 as const, introStep: value.introStep, droneDefeated: value.droneDefeated,
    completedAreaIds: Object.freeze([...value.completedAreaIds]),
    passages: Object.freeze(value.passages.map(p => Object.freeze({
      ...p, position: Object.freeze({ ...p.position }), passedCheckpointIds: Object.freeze([...p.passedCheckpointIds]),
    }))),
    checkpoint: value.checkpoint ? Object.freeze({ ...value.checkpoint }) : null,
    traversal: value.traversal ? Object.freeze({
      ...value.traversal, lastPosition: Object.freeze({ ...value.traversal.lastPosition }),
      passedCheckpointIds: Object.freeze([...value.traversal.passedCheckpointIds]),
    }) : null,
  });
}

export function unlockedAreaIds(campaign: Campaign): readonly AreaId[] {
  return AREA_ORDER.slice(0, campaign.completedAreaIds.length + 1);
}
export function isAreaUnlocked(campaign: Campaign, id: AreaId): boolean { return unlockedAreaIds(campaign).includes(id); }

function parseCheckpoint(value: unknown, unlocked: readonly AreaId[], rules: CampaignRules): MissionCheckpoint | null {
  if (!record(value) || !areaId(value.areaId) || !unlocked.includes(value.areaId)) return null;
  const p = position(value, rules[value.areaId]);
  if (!p || !finite(value.yaw) || !finite(value.pitch) || Math.abs(value.yaw) > 10000 || Math.abs(value.pitch) > Math.PI / 2) return null;
  const hp = finite(value.hp) ? Math.max(0, Math.min(100, value.hp)) : 100;
  // Dead checkpoints restart healthy; a save must never strand a player in a death loop.
  return { areaId: value.areaId, ...p, yaw: Math.atan2(Math.sin(value.yaw), Math.cos(value.yaw)), pitch: Math.max(-1.45, Math.min(1.45, value.pitch)), hp: hp > 0 ? hp : 100 };
}

/** Ignore injected unlock lists. Only an ordered prefix of complete, valid passage receipts is restored. */
export function parseCampaign(raw: string | null, rules: CampaignRules = CAMPAIGN_RULES): Campaign {
  const initial = campaignDefaults();
  try {
    if (!raw || raw.length > 65536) return initial;
    const v: unknown = JSON.parse(raw);
    if (!record(v) || v.version !== CAMPAIGN_VERSION) return initial;
    const introStep: IntroStep = Number.isInteger(v.introStep) && finite(v.introStep) && v.introStep >= 0 && v.introStep <= 4 ? v.introStep as IntroStep : 0;
    const droneDefeated = introStep === 4 && v.droneDefeated === true;
    const passages: PassageEvidence[] = [];
    if (introStep === 4 && droneDefeated && Array.isArray(v.passages)) {
      for (const [i, input] of v.passages.slice(0, 3).entries()) {
        const expected = AREA_ORDER[i];
        if (!record(input) || input.areaId !== expected || input.provisional !== true) break;
        const rule = rules[expected], p = position(input.position, rule), ids = checkpointIds(input.passedCheckpointIds, rule);
        if (!p || !finite(input.distance) || input.distance < rule.minimumTravel || input.distance > 10000 || horizontal(p, rule.exit) > rule.exit.radius || !completedCheckpoints(ids, rule)) break;
        passages.push({ areaId: expected, position: p, distance: input.distance, passedCheckpointIds: ids, provisional: true });
      }
    }
    const completedAreaIds = passages.map(p => p.areaId);
    const unlocked = AREA_ORDER.slice(0, completedAreaIds.length + 1);
    const checkpoint = parseCheckpoint(v.checkpoint, unlocked, rules);
    let traversal: TraversalState | null = null;
    if (record(v.traversal) && areaId(v.traversal.areaId) && unlocked.includes(v.traversal.areaId)) {
      const rule = rules[v.traversal.areaId], p = position(v.traversal.lastPosition, rule);
      if (p && finite(v.traversal.distance) && v.traversal.distance >= 0 && v.traversal.distance <= 10000) {
        traversal = { areaId: v.traversal.areaId, lastPosition: p, distance: v.traversal.distance, passedCheckpointIds: checkpointIds(v.traversal.passedCheckpointIds, rule) };
      }
    }
    // A checkpoint without consistent same-area movement evidence could be an injected teleport.
    const safeCheckpoint = checkpoint && traversal && checkpoint.areaId === traversal.areaId && horizontal(checkpoint, traversal.lastPosition) <= MAX_POSITION_STEP ? checkpoint : null;
    return freezeCampaign({ version: 1, introStep, droneDefeated, completedAreaIds, passages, checkpoint: safeCheckpoint, traversal });
  } catch { return initial; }
}

export type VisibleRouteEntry = Readonly<{
  id: string; number: number; name: string; displayName: string; description: string; x: number; y: number;
  revealed: boolean; unlocked: boolean; status: 'playable' | 'prototype' | 'unknown';
}>;

/** The canonical 18-stop order stays in HOME data; normal UI receives no future names or plot details. */
export function visibleRoute(campaign: Campaign): readonly VisibleRouteEntry[] {
  return ROUTE.map(([id, name, x, y], index) => {
    const revealed = id === 'shiretoko' || (id === 'sapporo' && isAreaUnlocked(campaign, 'sapporo'));
    return {
      id: revealed ? id : `locked-${String(index + 1).padStart(2, '0')}`, number: index + 1,
      name: revealed ? name : '???', displayName: revealed ? name : '???',
      description: revealed ? (id === 'shiretoko' ? '木造の家から始まる、北の森の探索。' : '都市縁辺の環境プロトタイプ。プレイ可能な範囲はここまで。') : '???',
      x, y, revealed, unlocked: revealed, status: revealed ? (id === 'shiretoko' ? 'playable' : 'prototype') : 'unknown',
    };
  });
}

export type VisibleAreaEntry = Readonly<{ id: AreaId; name: string; displayName: string; status: 'playable' | 'prototype'; provisional: true }>;
export function visibleAreas(campaign: Campaign): readonly VisibleAreaEntry[] {
  return unlockedAreaIds(campaign).map(id => ({ id, name: AREA_NAMES[id], displayName: AREA_NAMES[id], status: id === 'shiretoko' ? 'playable' : 'prototype', provisional: true }));
}

export class CampaignStore {
  private current: Campaign;
  private readonly storage: CampaignStorage | null;
  private readonly rules: CampaignRules;
  private runtimeArea: AreaId | null = null;
  saveStatus: SaveStatus;
  lastPersistenceError: 'read' | 'write' | null = null;

  constructor(storage: CampaignStorage | null = null, rules: Partial<Record<AreaId, AreaCampaignRule>> = {}) {
    this.storage = storage;
    this.rules = { ...CAMPAIGN_RULES, ...rules };
    this.saveStatus = storage ? 'saved' : 'memory-only';
    this.current = campaignDefaults();
    try { if (storage) this.current = parseCampaign(storage.getItem(CAMPAIGN_KEY), this.rules); }
    catch { this.saveStatus = 'storage-denied'; this.lastPersistenceError = 'read'; }
  }

  get value(): Campaign { return this.current; }
  get storageAvailable(): boolean { return !!this.storage && this.saveStatus !== 'storage-denied'; }
  get prototypeEndReached(): boolean {
    const t = this.current.traversal, rule = this.rules.sapporo;
    return t?.areaId === 'sapporo' && t.distance >= rule.minimumTravel && completedCheckpoints(t.passedCheckpointIds, rule) && horizontal(t.lastPosition, rule.exit) <= rule.exit.radius;
  }

  /** Called at real mission entry. Neither opening state nor completion receipts are changed. */
  beginSession(id: AreaId, resume: boolean): boolean {
    if (!areaId(id) || !isAreaUnlocked(this.current, id) || typeof resume !== 'boolean') return false;
    this.runtimeArea = null;
    const c = this.current.checkpoint, t = this.current.traversal;
    if (resume && c?.areaId === id && t?.areaId === id && horizontal(c, t.lastPosition) <= MAX_POSITION_STEP) return true;
    const checkpoint = c?.areaId === id ? null : c;
    const traversal = t?.areaId === id ? null : t;
    if (checkpoint !== c || traversal !== t) this.update({ ...this.current, checkpoint, traversal });
    return true;
  }

  private update(next: Campaign, persist = true): void {
    this.current = freezeCampaign(next);
    if (persist) this.persist();
  }

  private persist(): void {
    if (!this.storage) { this.saveStatus = 'memory-only'; return; }
    try { this.storage.setItem(CAMPAIGN_KEY, JSON.stringify(this.current)); this.saveStatus = 'saved'; this.lastPersistenceError = null; }
    catch { this.saveStatus = 'storage-denied'; this.lastPersistenceError = 'write'; }
  }

  record(event: CampaignEvent): boolean {
    if (!event || !areaId(event.areaId) || !isAreaUnlocked(this.current, event.areaId)) return false;
    if (event.type === 'position') return this.recordPosition(event);
    if (event.type === 'opening') {
      if (event.areaId !== 'shiretoko' || event.grounded !== true) return false;
      const rule=this.rules.shiretoko,p = position(event.position, rule), index = OPENING.findIndex(s => s.id === event.step);
      if (!p || index !== this.current.introStep) return false;
      if (event.step !== 'leave-cabin' && !inCabin(p,rule)) return false;
      if (event.step === 'radio' && event.skipped !== true && horizontal(p,rule.opening?.radio??{ x: -3, z: -3 }) > 2.4) return false;
      if (event.step === 'leave-cabin') {
        const t = this.current.traversal;
        if (inCabin(p,rule) || horizontal(p,rule.opening?.door??{ x: 0, z: 5 }) > (rule.opening?.leaveRadius??9) || t?.areaId !== 'shiretoko' || t.distance < 2 || horizontal(p, t.lastPosition) > MAX_POSITION_STEP) return false;
      }
      this.update({ ...this.current, introStep: (index + 1) as IntroStep }); return true;
    }
    if (event.type === 'drone-defeated') {
      if (event.areaId !== 'shiretoko' || this.current.introStep !== 4 || this.current.droneDefeated || event.enemyId !== 'shiretoko-scout-01' || event.remainingHp !== 0 || !Number.isInteger(event.hitCount) || event.hitCount <= 0 || event.hitCount > 1000 || this.current.traversal?.areaId !== 'shiretoko') return false;
      this.update({ ...this.current, droneDefeated: true }); return true;
    }
    if (event.type === 'area-exit') {
      const nextIndex = this.current.completedAreaIds.length;
      // Sapporo is a playable environment endpoint, never a fabricated story clear or Hakodate unlock.
      if (event.areaId === 'sapporo' || event.areaId !== AREA_ORDER[nextIndex] || event.grounded !== true) return false;
      const rule = this.rules[event.areaId], p = position(event.position, rule), t = this.current.traversal;
      if (!p || horizontal(p, rule.exit) > rule.exit.radius || t?.areaId !== event.areaId || horizontal(p, t.lastPosition) > MAX_POSITION_STEP || Math.abs(p.y - t.lastPosition.y) > MAX_POSITION_STEP || t.distance < rule.minimumTravel || !completedCheckpoints(t.passedCheckpointIds, rule)) return false;
      if (this.current.introStep !== 4 || !this.current.droneDefeated) return false;
      const receipt: PassageEvidence = { areaId: event.areaId, position: p, distance: t.distance, passedCheckpointIds: t.passedCheckpointIds, provisional: true };
      this.runtimeArea = null;
      this.update({ ...this.current, completedAreaIds: [...this.current.completedAreaIds, event.areaId], passages: [...this.current.passages, receipt], checkpoint: null, traversal: null }); return true;
    }
    return false;
  }

  private recordPosition(event: Extract<CampaignEvent, { type: 'position' }>): boolean {
    const rule = this.rules[event.areaId], p = position(event.position, rule);
    if (!p || typeof event.grounded !== 'boolean') return false;
    let previous = this.current.traversal;
    if (this.runtimeArea !== event.areaId) {
      const checkpoint = this.current.checkpoint;
      const canResume = checkpoint?.areaId === event.areaId && horizontal(checkpoint, p) <= MAX_POSITION_STEP;
      if (horizontal(p, rule.spawn) > 8 && !canResume) return false;
      if (!canResume || previous?.areaId !== event.areaId) previous = null;
      this.runtimeArea = event.areaId;
    }
    if (previous?.areaId !== event.areaId) previous = null;
    if (previous && (horizontal(p, previous.lastPosition) > MAX_POSITION_STEP || Math.abs(p.y - previous.lastPosition.y) > MAX_POSITION_STEP)) {
      // Controller safety/death recovery may return to the safe spawn. It earns no distance or POI.
      if (horizontal(p, rule.spawn) > 2 || event.grounded !== true || (rule.spawn.y !== undefined ? Math.abs(p.y - rule.spawn.y) > 4 : Math.abs(p.y - previous.lastPosition.y) > MAX_POSITION_STEP)) return false;
      this.update({ ...this.current, traversal: { ...previous, lastPosition: p } }, false);
      return true;
    }
    const traveled = previous && event.grounded ? horizontal(p, previous.lastPosition) : 0;
    const ids = [...previous?.passedCheckpointIds ?? []];
    if (event.grounded) for (const c of rule.checkpoints ?? []) if (!ids.includes(c.id) && horizontal(p, c) <= c.radius) ids.push(c.id);
    const traversal: TraversalState = { areaId: event.areaId, distance: Math.min(10000, (previous?.distance ?? 0) + traveled), lastPosition: p, passedCheckpointIds: ids };
    this.update({ ...this.current, traversal }, ids.length !== (previous?.passedCheckpointIds.length ?? 0));
    return true;
  }

  checkpoint(input: Omit<MissionCheckpoint, 'hp'> & { hp?: number }): boolean {
    const parsed = parseCheckpoint(input, unlockedAreaIds(this.current), this.rules), t = this.current.traversal;
    if (!parsed || t?.areaId !== parsed.areaId || this.runtimeArea !== parsed.areaId || horizontal(parsed, t.lastPosition) > MAX_POSITION_STEP || Math.abs(parsed.y - t.lastPosition.y) > MAX_POSITION_STEP) return false;
    this.update({ ...this.current, checkpoint: parsed }); return true;
  }

  /** The caller must present an explicit confirmation. HOME appearance/equipment storage is untouched. */
  reset(confirmed: boolean): boolean {
    if (confirmed !== true) return false;
    this.runtimeArea = null; this.update(campaignDefaults()); return true;
  }
}
