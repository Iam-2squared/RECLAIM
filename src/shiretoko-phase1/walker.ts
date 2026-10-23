import { LOCATIONS, TERRAIN, ShiretokoTerrain } from './terrain.ts';
export type WalkInput = { forward: number; right: number; sprint: boolean; jump: boolean };
/** Independent preview-only movement. No gameplay/campaign state, no storage. */
export class TerrainWalker {
  x = LOCATIONS[0].x as number; z = LOCATIONS[0].z as number; y = 108;
  yaw = 0; pitch = 0; velocity = 0; grounded = true; jumpHeld = false; distance = 0;
  readonly eyeHeight = 1.68;
  readonly terrain: ShiretokoTerrain;
  // Optional review-only indexed deck. The default campaign-independent walker
  // remains on the canonical 5m terrain and is byte-for-byte behavior-compatible.
  private readonly platformHeightAt: ((x: number, z: number) => number | null) | undefined;
  private readonly blockedAt: ((x: number, z: number) => boolean) | undefined;
  constructor(terrain: ShiretokoTerrain, platformHeightAt?: (x: number, z: number) => number | null,
    blockedAt?: (x: number, z: number) => boolean) {
    this.terrain = terrain; this.platformHeightAt = platformHeightAt; this.blockedAt = blockedAt;
    this.y = this.surfaceAt(this.x, this.z);
  }
  private surfaceAt(x: number, z: number): number {
    const deck = this.platformHeightAt?.(x, z);
    if (deck !== null && deck !== undefined && Number.isFinite(deck)) return deck;
    return this.terrain.heightAt(x, z);
  }
  private waterAt(x: number, z: number): boolean {
    return this.platformHeightAt?.(x, z) == null && this.terrain.inWater(x, z);
  }
  private slopeAt(x: number, z: number): number {
    if (this.platformHeightAt?.(x, z) == null) return this.terrain.slopeAt(x, z);
    return Math.hypot(this.surfaceAt(x + .35, z) - this.surfaceAt(x - .35, z),
      this.surfaceAt(x, z + .35) - this.surfaceAt(x, z - .35)) / .7;
  }
  place(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (Math.abs(x) >= TERRAIN.extent - 2 || Math.abs(z) >= TERRAIN.extent - 2 || this.waterAt(x, z) || this.blockedAt?.(x, z) || this.slopeAt(x, z) > .8) return false;
    this.x = x; this.z = z; this.y = this.surfaceAt(x, z); this.velocity = 0; this.grounded = true; this.jumpHeld = false; return true;
  }
  clearInput() { this.jumpHeld = false; }
  step(input: WalkInput, seconds: number): void {
    const dt = Math.max(0, Math.min(.05, Number.isFinite(seconds) ? seconds : 0));
    if (!dt) return;
    const length = Math.max(1, Math.hypot(input.forward, input.right)), speed = input.sprint ? 5.8 : 3.1;
    const dx = (-Math.sin(this.yaw) * input.forward + Math.cos(this.yaw) * input.right) * speed * dt / length;
    const dz = (-Math.cos(this.yaw) * input.forward - Math.sin(this.yaw) * input.right) * speed * dt / length;
    const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
    for (let i = 0; i < pieces; i++) {
      const oldX = this.x, oldZ = this.z;
      for (const axis of ['x', 'z'] as const) {
        const x = this.x + (axis === 'x' ? dx / pieces : 0), z = this.z + (axis === 'z' ? dz / pieces : 0);
        if (Math.abs(x) >= TERRAIN.extent - 2 || Math.abs(z) >= TERRAIN.extent - 2 || this.waterAt(x, z) || this.blockedAt?.(x, z)) continue;
        if (this.slopeAt(x, z) > .85 || this.surfaceAt(x, z) - this.surfaceAt(this.x, this.z) > .4) continue;
        this[axis] = axis === 'x' ? x : z;
      }
      this.distance += Math.hypot(this.x - oldX, this.z - oldZ);
    }
    if (input.jump && !this.jumpHeld && this.grounded) { this.velocity = 6; this.grounded = false; }
    this.jumpHeld = input.jump;
    this.velocity -= 20 * dt; this.y += this.velocity * dt;
    const ground = this.surfaceAt(this.x, this.z);
    if (this.y <= ground || (this.velocity < 0 && this.y - ground < .35)) { this.y = ground; this.velocity = 0; this.grounded = true; }
  }
}
