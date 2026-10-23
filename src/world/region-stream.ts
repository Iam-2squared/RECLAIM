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
  private wanted = new Set<string>();
  private region = '';
  private generation = 0;
  // Prevent callbacks in external disposers/abort listeners from resurrecting
  // an earlier focus after a later focus, clear, or close has taken ownership.
  private revision = 0;
  private shutDown = false;
  private lastFocus: {code:string;x:number;z:number;detail:TileDetail}|null=null;
  private refillQueued=false;
  private lastRefillFailure:string|null=null;
  readonly load: TileLoader<T>;
  readonly dispose: TileDisposer<T>;
  constructor(load: TileLoader<T>, dispose: TileDisposer<T>) { this.load = load; this.dispose = dispose; }

  get loadedKeys(): readonly string[] { return [...this.resident.keys()]; }
  get pendingKeys(): readonly string[] { return [...this.pending.keys()]; }
  /** Counts physical slots; not just requests which still have interested consumers. */
  get outstandingLoads(): number { return this.unsettled.size; }
  /** Only used by debugging/review UI; no repeated silent retries on errors. */
  get refillFailure(): string|null { return this.lastRefillFailure; }

  /** A settled slot can be reused without waiting for another user focus event. */
  private scheduleRefill():void {
    if(this.refillQueued||this.shutDown||!this.lastFocus||
       this.unsettled.size>=REGION_TILE_RULES.loadLimit)return;
    let missing=false;
    for(const key of this.wanted)
      if(!this.resident.has(key)&&!this.pending.has(key)){missing=true;break;}
    if(!missing)return;
    this.refillQueued=true;
    queueMicrotask(()=>{
      this.refillQueued=false;
      if(this.shutDown||!this.lastFocus)return;
      const spec=this.lastFocus;
      try { this.focus(spec.code,spec.x,spec.z,spec.detail); }
      catch(error) {this.lastRefillFailure=String(error);}
    });
  }

  focus(code: string, x: number, z: number, detail: TileDetail): RegionStreamReport {
    if (this.shutDown) throw new Error('region stream disposed');
    // Validate *before* modifying the active scene or aborting any request.
    const initial = planRegionTiles(code, x, z, detail, []);
    const revision = ++this.revision;
    this.lastFocus={code,x,z,detail};
    this.lastRefillFailure=null;
    const requireCurrent = () => {
      if (this.shutDown || revision !== this.revision)
        throw new Error('region stream focus superseded by a reentrant lifecycle operation');
    };
    const cancelled: string[] = [], evicted: string[] = [], started: string[] = [];
    if (this.region !== code) {
      this.generation++;
      const obsoletePending = [...this.pending];
      this.pending.clear();
      for (const [key, request] of obsoletePending) {
        request.controller.abort(); cancelled.push(key);
      }
      requireCurrent();
      // Clear ownership before invoking external disposers. A partially lost
      // graphics context must not leave previously-disposed resident handles.
      const obsolete = [...this.resident];
      this.resident.clear(); this.wanted.clear(); this.region = code;
      const failures: unknown[] = [];
      for (const [key, resource] of obsolete) {
        evicted.push(key);
        try { this.dispose(resource); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, 'region switch disposal failed');
      requireCurrent();
    }
    this.wanted = new Set(initial.desired.map(t => t.key));
    for (const [key, request] of this.pending) {
      if (!this.wanted.has(key)) {
        this.pending.delete(key); request.controller.abort(); cancelled.push(key);
        requireCurrent();
      }
    }

    let plan = planRegionTiles(code, x, z, detail, [...this.resident.keys(), ...this.pending.keys()]);
    const evictionFailures: unknown[] = [];
    for (const key of plan.evict) {
      if (this.resident.has(key)) {
        const resource = this.resident.get(key)!;
        this.resident.delete(key); evicted.push(key);
        try { this.dispose(resource); } catch (error) { evictionFailures.push(error); }
      }
    }
    if (evictionFailures.length) throw new AggregateError(evictionFailures, 'region tile disposal failed');
    requireCurrent();
    // Obsolete unresolved operations still occupy real loader slots.
    const available = Math.max(0, REGION_TILE_RULES.loadLimit - this.unsettled.size);
    plan = planRegionTiles(code, x, z, detail, [...this.resident.keys(), ...this.pending.keys()]);
    for (const coord of plan.load.slice(0, available)) {
      const controller = new AbortController(), generation = this.generation;
      this.pending.set(coord.key, { generation, controller });
      this.unsettled.add(controller); started.push(coord.key);
      // Let same-turn focus() cancel a request before creating any loader work.
      let completedOrObsolete=false;
      void Promise.resolve().then(async () => {
        if (controller.signal.aborted) return;
        const resource = await this.load(coord, controller.signal);
        // A loader returning no mesh is a failed load, never a resident tile.
        // The next explicit focus may safely retry without any ghost geometry.
        if (resource === null || resource === undefined) return;
        const current = this.pending.get(coord.key);
        if (this.shutDown || controller.signal.aborted || current?.controller !== controller ||
            generation !== this.generation || !this.wanted.has(coord.key) || this.region !== code) {
          this.dispose(resource); completedOrObsolete=true; return;
        }
        this.pending.delete(coord.key);
        if (this.resident.has(coord.key)) this.dispose(resource);
        else this.resident.set(coord.key, resource);
        completedOrObsolete=true;
      }).catch(() => {
        // A loader failure remains eligible for a subsequent explicit focus().
      }).finally(() => {
        if (this.pending.get(coord.key)?.controller === controller) this.pending.delete(coord.key);
        this.unsettled.delete(controller);
        // A failed/empty active load waits for explicit refocus; never spin
        // indefinitely against a broken loader. Aborted old loads may release
        // capacity for the NEW focus even if the old Promise rejected.
        if((completedOrObsolete||controller.signal.aborted)&&!this.shutDown)
          this.scheduleRefill();
      });
    }
    return {
      region: code, desired: initial.desired.length, resident: this.resident.size,
      inFlight: this.unsettled.size, started, cancelled, evicted,
    };
  }

  clear(): void {
    this.lastFocus=null;
    this.revision++;
    this.generation++;
    const pending = [...this.pending.values()];
    this.pending.clear();
    const resources = [...this.resident.values()];
    this.resident.clear(); this.wanted.clear(); this.region = '';
    for (const request of pending) request.controller.abort();
    const failures: unknown[] = [];
    for (const resource of resources) {
      try { this.dispose(resource); } catch (error) { failures.push(error); }
    }
    // Do NOT clear unsettled. Old loaders must settle before freeing real slots.
    if (failures.length) throw new AggregateError(failures, 'region clear disposal failed');
  }
  close(): void {
    if (this.shutDown) return;
    // Set terminal state FIRST: a disposer cannot reopen while close() runs.
    this.shutDown = true;
    this.clear();
  }
}
