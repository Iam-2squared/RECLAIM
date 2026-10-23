/**
 * Game-only impact arbitration and ephemeral tracer data.
 * The renderer consumes exactly the same swept paths as hit registration.
 * No DOM, Three, save writes, or invented hit endpoints.
 */
import { boxSweep, sphereSweep, terrainSweep, type Vector3, type ProjectileEvent } from './ballistics.ts';

export type ImpactMaterial = 'terrain' | 'wood' | 'stone' | 'metal' | 'drone';
export type BoxBounds = Readonly<{
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}>;
export type Solid = Readonly<{
  id: string; material: Exclude<ImpactMaterial, 'terrain' | 'drone'>; bounds: BoxBounds;
}>;
export type DroneTarget = Readonly<{ id: string; center: Vector3; radius: number }>;
export type SegmentWorld = Readonly<{
  solids: readonly Solid[];
  drone: DroneTarget | null;
  heightAt: (x: number, z: number) => number;
}>;
export type TaggedImpact = Readonly<{
  fraction: number; point: Vector3; material: ImpactMaterial; targetId: string | null;
}>;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9;
const order: Readonly<Record<ImpactMaterial, number>> = {
  terrain: 0, stone: 1, metal: 2, wood: 3, drone: 4,
};
const finiteVec = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const between = (from: Vector3, to: Vector3, fraction: number): Vector3 => ({
  x: from.x + (to.x - from.x) * fraction,
  y: from.y + (to.y - from.y) * fraction,
  z: from.z + (to.z - from.z) * fraction,
});
/** Closest hit wins; on an exactly coplanar tie cover wins over the target. */
export function resolveSegmentImpact(from: Vector3, to: Vector3, world: SegmentWorld): TaggedImpact | null {
  if (!finiteVec(from) || !finiteVec(to)) throw new RangeError('invalid impact segment');
  let selected: TaggedImpact | null = null;
  const consider = (fraction: number | undefined, material: ImpactMaterial, targetId: string | null) => {
    if (fraction === undefined || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return;
    if (selected && (selected.fraction < fraction && !near(selected.fraction, fraction))) return;
    if (selected && near(selected.fraction, fraction)) {
      if (order[selected.material] < order[material]) return;
      if (order[selected.material] === order[material] && (selected.targetId ?? '') <= (targetId ?? '')) return;
    }
    selected = { fraction, point: between(from, to, fraction), material, targetId };
  };
  for (const c of world.solids) consider(boxSweep(from, to, c.bounds)?.fraction, c.material, c.id);
  consider(terrainSweep(from, to, world.heightAt)?.fraction, 'terrain', null);
  if (world.drone) consider(sphereSweep(from, to, world.drone.center, world.drone.radius)?.fraction, 'drone', world.drone.id);
  return selected;
}
export type TracerSpan = Readonly<{
  projectileId: number; from: Vector3; to: Vector3; age: number;
  duration: number; terminal: boolean; alpha: number;
}>;
export const TRAIL_LIMITS = Object.freeze({ lifespanSeconds: .095, maxSpans: 72 });
/** Fixed memory cap, terminal segments briefly survive to fade out. */
export class TracerHistory {
  private spans: Array<Omit<TracerSpan, 'alpha'>> = [];
  observe(events: readonly ProjectileEvent[]): void {
    for (const event of events) {
      if (!finiteVec(event.from) || !finiteVec(event.to)) continue;
      if (Math.hypot(event.to.x - event.from.x, event.to.y - event.from.y, event.to.z - event.from.z) < 1e-6) continue;
      this.spans.push({
        projectileId: event.id,
        from: { ...event.from }, to: { ...event.to }, age: 0,
        duration: TRAIL_LIMITS.lifespanSeconds,
        terminal: event.hit || event.expired,
      });
    }
    if (this.spans.length > TRAIL_LIMITS.maxSpans)
      this.spans.splice(0, this.spans.length - TRAIL_LIMITS.maxSpans);
  }
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const bounded = Math.min(dt, .25);
    this.spans = this.spans.map(s => ({ ...s, age: s.age + bounded })).filter(s => s.age < s.duration);
  }
  get visible(): readonly TracerSpan[] {
    return this.spans.map(s => ({ ...s, alpha: 1 - s.age / s.duration }));
  }
  clear(): void { this.spans.length = 0; }
}
