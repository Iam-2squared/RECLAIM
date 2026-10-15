/** Fixed physics steps with a bounded catch-up after a delayed render frame. */
export const SIMULATION_TIMING = Object.freeze({ stepSeconds: 1 / 60, maxFrameSeconds: .25, maxSteps: 15 });
export class SimulationClock {
  accumulator = 0;
  reset() { this.accumulator = 0; }
  advance(seconds: number, step: (seconds: number) => boolean | void): number {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    this.accumulator += Math.min(seconds, SIMULATION_TIMING.maxFrameSeconds);
    let steps = 0;
    while (this.accumulator + 1e-12 >= SIMULATION_TIMING.stepSeconds && steps < SIMULATION_TIMING.maxSteps) {
      this.accumulator = Math.max(0, this.accumulator - SIMULATION_TIMING.stepSeconds);
      steps++;
      if (step(SIMULATION_TIMING.stepSeconds) === false) { this.reset(); break; }
    }
    return steps;
  }
}
