/**
 * Bounded async tile lifecycle for future Japanese terrain regions.
 * The loader owns licensed mesh creation. No campaign/storage unlock occurs.
 *
 * Crucial invariant: an aborted request still consumes a physical concurrency
 * slot until its loader Promise settles. AbortSignal is advisory to loaders;
 * some loaders legitimately cannot interrupt an operation already in flight.
 */
import { planRegionTiles, type TileCoord, type TileDetail,
  REGION_TILE_RULES } from './region-tiles.ts';

export type TileLoader<T> = (coord: TileCoord, signal: AbortSignal) => Promise<T>;
export type TileDisposer<T> = (resource: T) => void;
export type RegionStreamReport = Readonly<{
  region: string; desired: number; resident: number; inFlight: number;
  started: readonly string[]; cancelled: readonly string[]; evicted: readonly string[];
}>;
type Pending = Readonly<{ generation: number; controller: AbortController }>;

export class RegionTileStream<T> {
  private readonly resident = new Map<string, T>();
  /** Desired live operations only. Aborted ones are removed from here. */
  private readonly pending = new Map<string, Pending>();
  /** All unresolved loader operations, including aborted/obsolete ones. */
  private readonly unsettled = new Set<AbortController>();
  /** Live priority order; a completion can advance the queue without another focus(). */
  private desired: readonly TileCoord[] = [];
  /** Automatic refill skips failures until an explicit subsequent focus(). */
  private failed = new Set<string>();
  private wanted = new Set<string>();
  private region = '';
  private generation = 0;
  private shutDown = false;
  readonly load: TileLoader<T>;
  readonly dispose: TileDisposer<T>;
  constructor(load: TileLoader<T>, dispose: TileDisposer<T>) { this.load = load; this.dispose = dispose; }

  get loadedKeys(): readonly string[] { return [...this.resident.keys()]; }
  get pendingKeys(): readonly string[] { return [...this.pending.keys()]; }
  get failedKeys(): readonly string[] { return [...this.failed]; }
  /** Counts physical slots; not just requests which still have interested consumers. */
  get outstandingLoads(): number { return this.unsettled.size; }

  focus(code: string, x: number, z: number, detail: TileDetail): RegionStreamReport {
    if (this.shutDown) throw new Error('region stream disposed');
    // Validate *before* modifying the active scene or aborting any request.
    const initial = planRegionTiles(code, x, z, detail, []);
    this.desired = initial.desired;
    this.failed.clear(); // A new user-requested focus is the only automatic retry gate.
    const cancelled: string[] = [], evicted: string[] = [], started: string[] = [];
    if (this.region !== code) {
      this.generation++;
      for (const [key, request] of this.pending) {
        request.controller.abort(); cancelled.push(key);
      }
      this.pending.clear();
      for (const [key, resource] of this.resident) {
        this.dispose(resource); evicted.push(key);
      }
      this.resident.clear(); this.region = code;
    }
    this.wanted = new Set(initial.desired.map(t => t.key));
    for (const [key, request] of this.pending) {
      if (!this.wanted.has(key)) {
        request.controller.abort(); this.pending.delete(key); cancelled.push(key);
      }
    }

    let plan = planRegionTiles(code, x, z, detail, [...this.resident.keys(), ...this.pending.keys()]);
    for (const key of plan.evict) {
      if (this.resident.has(key)) {
        this.dispose(this.resident.get(key)!); this.resident.delete(key); evicted.push(key);
      }
    }
    // This is also invoked after each completion: no extra focus() is required.
    this.startLoads(started);
    return {
      region: code, desired: initial.desired.length, resident: this.resident.size,
      inFlight: this.unsettled.size, started, cancelled, evicted,
    };
  }

  /** Refill physical loader slots. Failed keys remain blocked until focus(). */
  private startLoads(started: string[]): void {
    if (this.shutDown || !this.region) return;
    for (const coord of this.desired) {
      if (this.unsettled.size >= REGION_TILE_RULES.loadLimit) break;
      // Old resident tiles remaining under the eviction budget count toward
      // capacity; asynchronous refill must never cause unbounded residency.
      if (this.resident.size + this.pending.size >= this.desired.length) break;
      if (!this.wanted.has(coord.key) || this.resident.has(coord.key) ||
          this.pending.has(coord.key) || this.failed.has(coord.key)) continue;
      const controller = new AbortController(), generation = this.generation;
      this.pending.set(coord.key, { generation, controller });
      this.unsettled.add(controller);
      started.push(coord.key);
      // A same-turn focus()/clear() may cancel this before loader creation.
      void Promise.resolve().then(async () => {
        if (controller.signal.aborted) return;
        const resource = await this.load(coord, controller.signal);
        const current = this.pending.get(coord.key);
        if (this.shutDown || controller.signal.aborted || current?.controller !== controller ||
            generation !== this.generation || !this.wanted.has(coord.key) || this.region !== coord.code) {
          this.dispose(resource); return;
        }
        this.pending.delete(coord.key);
        if (this.resident.has(coord.key)) this.dispose(resource);
        else this.resident.set(coord.key, resource);
      }).catch(() => {
        const current = this.pending.get(coord.key);
        if (!this.shutDown && !controller.signal.aborted && current?.controller === controller &&
            generation === this.generation && this.region === coord.code && this.wanted.has(coord.key)) {
          this.failed.add(coord.key);
        }
      }).finally(() => {
        if (this.pending.get(coord.key)?.controller === controller) this.pending.delete(coord.key);
        this.unsettled.delete(controller);
        // A failed key is skipped; other missing desired tiles can still load.
        this.startLoads([]);
      });
    }
  }

  clear(): void {
    this.generation++;
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    for (const resource of this.resident.values()) this.dispose(resource);
    this.resident.clear(); this.wanted.clear(); this.desired = []; this.failed.clear(); this.region = '';
    // Do NOT clear unsettled. Old loaders must settle before freeing real slots.
  }
  close(): void { if (!this.shutDown) { this.clear(); this.shutDown = true; } }
}
