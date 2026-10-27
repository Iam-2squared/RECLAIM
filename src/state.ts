/** UI state has no account, network or gameplay authority. Time is injected for tests. */
export const REVEAL_MS = 1750;
export const REVEAL_COOLDOWN_MS = 5500;
export type Screen = 'title' | 'home' | 'mission';
export class ScreenState {
  screen: Screen = 'title';
  squadPreview = false;
  revealStarted: number | null = null;
  lastReveal = -Infinity;
  reveal(now: number): boolean {
    if (this.screen !== 'title' || now - this.lastReveal < REVEAL_COOLDOWN_MS) return false;
    this.revealStarted = now;
    this.lastReveal = now;
    return true;
  }
  bossOpacity(now: number, reducedMotion = false): number {
    if (this.screen !== 'title' || this.revealStarted === null) return 0;
    const elapsed = Math.max(0, now - this.revealStarted);
    if (elapsed >= REVEAL_MS) { this.revealStarted = null; return 0; }
    if (reducedMotion) return 0.55;
    return Math.min(1, elapsed / 380, (REVEAL_MS - elapsed) / 750) * 0.62;
  }
  goHome(): void { this.revealStarted = null; this.screen = 'home'; }
  goMission(): void { this.revealStarted = null; this.screen = 'mission'; }
  goTitle(): void { this.revealStarted = null; this.screen = 'title'; }
}
export type Preferences = { quality: 'balanced' | 'low'; reducedMotion: boolean; gunfire: boolean };
export function parsePreferences(raw: string | null, systemReduced = false): Preferences {
  const defaults: Preferences = { quality: 'balanced', reducedMotion: systemReduced, gunfire: true };
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return defaults;
    return {
      quality: value.quality === 'low' ? 'low' : 'balanced',
      reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : systemReduced,
      gunfire: typeof value.gunfire === 'boolean' ? value.gunfire : true,
    };
  } catch { return defaults; }
}
