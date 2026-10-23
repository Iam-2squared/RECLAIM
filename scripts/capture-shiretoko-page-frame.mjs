import {readLiveWebGLCanvasJPEG} from './webgl-canvas-jpeg.mjs';
/**
 * CI-only, non-invasive JPEG of the real, already rendered WebGL canvas.
 * SwiftShader's page-compositor screenshot can hang after pointer-lock
 * walking even though original orbit screenshots and rendering pass.
 * No synthetic image, input, pose, scene or save data is written.
 */
export async function captureTerrainScreenshot(page) {
  const readState = () => page.evaluate(() => {
    const api = window.__SHIRETOKO_TERRAIN__, canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    if (!api || !gl || gl.isContextLost()) throw new Error('WebGL review canvas unavailable');
    const width = canvas.width, height = canvas.height, bytes = width * height * 4;
    if (!Number.isSafeInteger(bytes) || width <= 0 || height <= 0 || bytes > 64 * 1024 * 1024)
      throw new RangeError('invalid review canvas dimensions');
    const d = api.diagnostics();
    return {
      width, height, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      preserveDrawingBuffer: Boolean(gl.getContextAttributes()?.preserveDrawingBuffer),
      mode: d.mode, pointerLocked: d.pointerLocked, grounded: d.player.grounded,
      inputKeys: [...d.inputKeys], contextLost: d.contextLost, shaderError: d.shaderError,
      renderCallsTotal: d.renderCallsTotal,
      groundError: Math.abs(d.player.y - api.terrain.heightAt(d.player.x, d.player.z)),
      yaw: api.walker.yaw, pitch: api.walker.pitch, cameraPosition: [...d.camera.position],
      fov: d.camera.fov, glError: gl.getError(),
    };
  });
  const before = await readState();
  if (before.glError !== 0) throw new Error(`WebGL before screenshot error: ${before.glError}`);
  // Read the already rendered 1600x1000 WebGL drawing buffer from the
  // original canvas, not the stalled page compositor. Overlay DOM pixels
  // are outside that canvas. Preserve the original strict 20s capture limit.
  const encoded = await readLiveWebGLCanvasJPEG(page);
  const jpeg = Buffer.from(encoded.slice('data:image/jpeg;base64,'.length),'base64');
  if (!jpeg || jpeg.length < 4 || jpeg[0] !== 255 || jpeg[1] !== 216)
    throw new Error('WebGL page compositor did not return JPEG pixels');
  const after = await readState();
  if (after.glError !== 0 || after.contextLost) throw new Error(`WebGL after screenshot error: ${after.glError}`);
  // A changing input/pose is not a valid proof of the specified first-person frame.
  for (const key of ['width', 'height', 'dpr', 'mode', 'pointerLocked', 'grounded', 'yaw', 'pitch', 'fov']) {
    if (before[key] !== after[key]) throw new Error(`Canvas capture state changed: ${key}`);
  }
  if (JSON.stringify(before.viewport) !== JSON.stringify(after.viewport) ||
      JSON.stringify(before.cameraPosition) !== JSON.stringify(after.cameraPosition) ||
      JSON.stringify(before.inputKeys) !== JSON.stringify(after.inputKeys))
    throw new Error('Compositor capture viewport, camera or input changed');
  const base64 = jpeg.toString('base64');
  const pixels = await page.evaluate(async payload => {
    // Decode the original canvas JPEG through CPU-only 2D,
    // rather than ask the active WebGL context for a second synchronous readback.
    const image = new Image();
    image.src = `data:image/jpeg;base64,${payload}`;
    await image.decode();
    const view = document.createElement('canvas');
    view.width = image.naturalWidth; view.height = image.naturalHeight;
    const ctx = view.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw new Error('Cannot decode screenshot into CPU pixels');
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, view.width, view.height).data;
    let min = 255, max = 0;
    for (let i = 0; i < rgba.length; i += 4) for (let c = 0; c < 3; c++) {
      min = Math.min(min, rgba[i + c]); max = Math.max(max, rgba[i + c]);
    }
    return { width: view.width, height: view.height, min, max };
  }, base64);
  if (pixels.width !== before.width || pixels.height !== before.height)
    throw new Error('Live canvas JPEG resolution differs from WebGL framebuffer');
  if (!(pixels.max > pixels.min)) throw new Error('Actual WebGL canvas JPEG is blank');
  return { ...before, min: pixels.min, max: pixels.max,
    image: `data:image/jpeg;base64,${base64}` };
}
