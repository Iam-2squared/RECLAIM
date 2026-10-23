/**
 * Bound asynchronous GPU work without throttling the Mission simulation.
 * The shared game renderer remains owned by the application: this class owns
 * only its fence objects, and never loses the context or disposes the renderer.
 */
export class MissionRenderBackpressure {
  private readonly gl: WebGL2RenderingContext;
  private readonly pending: WebGLSync[] = [];
  private closed = false;
  private deferred = 0;
  constructor(gl: WebGL2RenderingContext) { this.gl = gl; }

  canSubmit(): boolean {
    if (this.closed || this.gl.isContextLost()) return false;
    while (this.pending.length) {
      const sync = this.pending[0];
      const status = this.gl.clientWaitSync(sync, 0, 0);
      if (status === this.gl.ALREADY_SIGNALED || status === this.gl.CONDITION_SATISFIED) {
        this.gl.deleteSync(sync); this.pending.shift();
      } else if (status === this.gl.TIMEOUT_EXPIRED) break;
      else throw new Error('Mission GPU completion fence failed');
    }
    if (this.pending.length < 2) return true;
    this.deferred++; return false;
  }

  submitted(): void {
    if (this.closed || this.pending.length >= 2) throw new Error('Mission GPU submission outside render budget');
    const sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) throw new Error('Mission GPU fence allocation failed');
    this.pending.push(sync); this.gl.flush();
  }

  snapshot() { return { pending: this.pending.length, deferred: this.deferred, disposed: this.closed }; }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const sync of this.pending) this.gl.deleteSync(sync);
    this.pending.length = 0;
  }
}
