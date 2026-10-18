import type { GunId } from '../home-state.ts';

/** Render-only feedback. Gameplay hit tests continue to use the unmodified camera ray. */
export const SHOT_FEEDBACK = Object.freeze({
  assault: { pitch: 0.010, travel: 0.022 },
  sniper: { pitch: 0.022, travel: 0.045 },
  rifle: { pitch: 0.014, travel: 0.031 },
} satisfies Record<GunId, { pitch: number; travel: number }>);

export class ShotFeedback {
  pitch = 0;
  travel = 0;
  flashSeconds = 0;
  tracerSeconds = 0;

  fire(id: GunId): void {
    const profile = SHOT_FEEDBACK[id];
    this.pitch = Math.min(0.035, this.pitch + profile.pitch);
    this.travel = Math.min(0.07, this.travel + profile.travel);
    this.flashSeconds = 0.055;
    this.tracerSeconds = 0.11;
  }

  step(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, 0.1);
    this.pitch *= Math.exp(-11 * dt);
    this.travel *= Math.exp(-18 * dt);
    if (this.pitch < 1e-5) this.pitch = 0;
    if (this.travel < 1e-5) this.travel = 0;
    this.flashSeconds = Math.max(0, this.flashSeconds - dt);
    this.tracerSeconds = Math.max(0, this.tracerSeconds - dt);
  }

  reset(): void {
    this.pitch = 0;
    this.travel = 0;
    this.flashSeconds = 0;
    this.tracerSeconds = 0;
  }
}
