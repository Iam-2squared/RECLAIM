/** Read the actual WebGL frame without synchronously draining the GPU queue.
 * Serialized by Playwright into the review page; deliberately has no imports.
 * No scene, resolution, camera, input, simulation or game-save mutation.
 */
export async function captureTerrainFramebuffer({ timeoutMs = 20000, pollMs = 10 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000 ||
      !Number.isFinite(pollMs) || pollMs < 1 || pollMs > 1000) throw new RangeError('invalid readback budget');
  const api = window.__SHIRETOKO_TERRAIN__, canvas = document.querySelector('canvas');
  const gl = canvas?.getContext('webgl2');
  if (!api || !gl || gl.isContextLost()) throw new Error('WebGL readback unavailable');
  const width = canvas.width, height = canvas.height, bytes = width * height * 4;
  if (!Number.isSafeInteger(bytes) || width <= 0 || height <= 0 || bytes > 64 * 1024 * 1024)
    throw new RangeError('invalid framebuffer size');
  const d = api.diagnostics();
  // Associate metadata with the submitted read, not a later walking frame.
  const state = {
    width, height, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    preserveDrawingBuffer: Boolean(gl.getContextAttributes()?.preserveDrawingBuffer),
    mode: d.mode, pointerLocked: d.pointerLocked, grounded: d.player.grounded,
    inputKeys: [...d.inputKeys], contextLost: d.contextLost, shaderError: d.shaderError,
    renderCallsTotal: d.renderCallsTotal,
    groundError: Math.abs(d.player.y - api.terrain.heightAt(d.player.x, d.player.z)),
    yaw: api.walker.yaw, pitch: api.walker.pitch, cameraPosition: [...d.camera.position], fov: d.camera.fov,
  };
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('cannot allocate readback buffer');
  let sync;
  const rgba = new Uint8Array(bytes);
  const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
  try {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
    // With a PBO bound, 0 is a GPU-buffer byte offset, not a CPU destination.
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
    sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) throw new Error('cannot allocate readback fence');
    gl.flush();
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      if (gl.isContextLost()) throw new Error('WebGL context lost during readback');
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
      if (status !== gl.TIMEOUT_EXPIRED) throw new Error('WebGL readback fence failed');
      if (performance.now() >= deadline) throw new Error('WebGL readback fence timed out');
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    // Restore the binding current at this point; the scene kept running while waiting.
    const current = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    try {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
    } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, current); }
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) throw new Error(`WebGL readback error: ${glError}`);
    let min = 255, max = 0;
    for (let i = 0; i < rgba.length; i += 4) for (let c = 0; c < 3; c++) {
      min = Math.min(min, rgba[i + c]); max = Math.max(max, rgba[i + c]);
    }
    // Encode those exact pixels; canvas.toDataURL on the WebGL canvas would
    // cause a SECOND synchronous GPU readback. 2D ImageData is CPU-only.
    const topDown = new Uint8ClampedArray(bytes), stride = width * 4;
    for (let y = 0; y < height; y++)
      topDown.set(rgba.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = width; imageCanvas.height = height;
    const imageContext = imageCanvas.getContext('2d');
    if (!imageContext) throw new Error('image encoder unavailable');
    imageContext.putImageData(new ImageData(topDown, width, height), 0, 0);
    return { ...state, min, max, glError, image: imageCanvas.toDataURL('image/jpeg', .92) };
  } finally {
    // Only initial errors can leave our buffer bound.
    if (gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === buffer)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
    if (sync) gl.deleteSync(sync);
    gl.deleteBuffer(buffer);
  }
}
