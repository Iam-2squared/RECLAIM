/**
 * Connects the existing authoritative ScoutDrone.hit/HP contract to tagged
 * projectile receipts without owning campaign progression or rendering.
 * This is fictional game combat only, not a projectile calibration model.
 */
import type { ShotFrame } from './projectile-pipeline.ts';
export type DroneHitTarget = {
  readonly id: string;
  readonly hp: number;
  readonly hits: number;
  hit(damage: number): boolean;
};
export type DamageBridgeResult = Readonly<{
  acceptedHits: number;
  defeated: boolean;
  absorbed: number;
}>;
export const DAMAGE_BRIDGE_LIMITS = Object.freeze({ maxSeen: 256, maxImpactsPerFrame: 24 });

/** Bound duplicate detection: the authoritative enemy still rejects hits after HP reaches zero. */
export class DroneImpactBridge {
  private seen = new Set<number>();

  // Projectile IDs are session-local and monotonically allocated, but their
  // impact order can differ. Reject IDs older than the bounded replay window
  // even after their original receipts have been evicted from seen.
  private highestSeenId = 0;
  reset(): void { this.seen.clear(); this.highestSeenId = 0; }
  apply(frame: ShotFrame, target: DroneHitTarget | null, onDefeated: (enemy: DroneHitTarget) => void): DamageBridgeResult {
    if (frame.impacts.length > DAMAGE_BRIDGE_LIMITS.maxImpactsPerFrame)
      throw new RangeError('projectile impact frame exceeds active projectile budget');
    let acceptedHits = 0, absorbed = 0, defeated = false;
    for (const receipt of frame.impacts) {
      const id = receipt.projectileId;
      if (!Number.isSafeInteger(id) || id <= 0 || this.seen.has(id) ||
          id <= this.highestSeenId - DAMAGE_BRIDGE_LIMITS.maxSeen) { absorbed++; continue; }
      if (id > this.highestSeenId) {
        this.highestSeenId = id;
        // Preserve the bounded numerical replay window even when flight times
        // make impacts arrive out of launch order.
        const cutoff = id - DAMAGE_BRIDGE_LIMITS.maxSeen;
        for (const seenId of this.seen) if (seenId <= cutoff) this.seen.delete(seenId);
      }
      this.seen.add(id);
      if (!target || receipt.owner !== 'player' || receipt.impact.material !== 'drone' ||
        receipt.impact.targetId !== target.id || !Number.isFinite(receipt.damage) || receipt.damage <= 0) {
        absorbed++; continue;
      }
      const hpBefore = target.hp;
      if (hpBefore <= 0 || !target.hit(receipt.damage)) { absorbed++; continue; }
      acceptedHits++;
      if (hpBefore > 0 && target.hp === 0) {
        defeated = true;
        onDefeated(target);
      }
    }
    return { acceptedHits, defeated, absorbed };
  }
}
