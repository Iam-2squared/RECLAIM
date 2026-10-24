/**
 * At most two real WebGL2 draws may be outstanding.
 *
 * Chromium/SwiftShader can return from renderer.render() long before earlier
 * draw commands complete. Unbounded RAF submissions accumulate a GPU queue and
 * make actual post-walk WebGL framebuffer capture exceed its unchanged 20s
 * deadline. Polling a fence never blocks the main thread or fabricates a frame.
 * Scene, meshes, pixel resolution, physics, input and screenshot tests stay real.
 */
export class TerrainGpuFrameGate {
  private readonly pending: WebGLSync[] = [];
  private readonly gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext) { this.gl = gl; }

  canSubmit(): boolean {
    if (this.gl.isContextLost()) return false;
    while (this.pending.length) {
      const sync = this.pending[0];
      const state = this.gl.clientWaitSync(sync, 0, 0);
      if (state === this.gl.ALREADY_SIGNALED || state === this.gl.CONDITION_SATISFIED) {
        this.gl.deleteSync(sync);
        this.pending.shift();
      } else if (state === this.gl.TIMEOUT_EXPIRED) {
        break;
      } else {
        throw new Error('WebGL GPU frame fence failed; refusing an unverified frame');
      }
    }
    return this.pending.length < 2;
  }

  submitted(): void {
    if (this.pending.length >= 2) throw new Error('WebGL GPU frame queue limit exceeded');
    const sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) throw new Error('Unable to fence submitted WebGL frame');
    this.gl.flush();
    this.pending.push(sync);
  }

  dispose(): void {
    for (const sync of this.pending) this.gl.deleteSync(sync);
    this.pending.length = 0;
  }
}
