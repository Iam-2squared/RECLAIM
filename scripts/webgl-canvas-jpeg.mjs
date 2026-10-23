/**
 * A genuinely rendered, preserveDrawingBuffer WebGL canvas, not a generated
 * scene or a fabricated fallback. Capturing canvas pixels does not require
 * Playwright to resubmit the entire SwiftShader page compositor after freeze.
 * The previous screenshot had a strict 20-second deadline, retained here.
 */
export async function withCanvasCaptureDeadline(operation, timeoutMs=20_000) {
  if (typeof operation !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>20_000)
    throw new RangeError('canvas capture must fit the original 20s deadline');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Live WebGL canvas capture exceeded the original 20000ms limit')),timeoutMs);}),
    ]);
  } finally {clearTimeout(timer);}
}

export async function readLiveWebGLCanvasJPEG(page) {
  return withCanvasCaptureDeadline(()=>page.evaluate(()=>{
    const canvas=document.querySelector('canvas');
    if(!canvas || !canvas.getContext('webgl2') || canvas.width<=0 || canvas.height<=0)
      throw new Error('Live WebGL canvas not available for capture');
    // The source canvas is the already-rendered game WebGL drawing buffer.
    // preserveDrawingBuffer, context loss and pixel variation are asserted by
    // the calling full-browser test before and after this exact capture.
    const url=canvas.toDataURL('image/jpeg',0.92);
    if(!url.startsWith('data:image/jpeg;base64,'))
      throw new Error('Live WebGL canvas did not encode actual JPEG pixels');
    return url;
  }),20_000);
}
