/**
 * A genuinely rendered, preserveDrawingBuffer WebGL canvas, not a generated
 * scene or a fabricated fallback. Asynchronous canvas encoding avoids toDataURL's synchronous JPEG
 * readback and does not invoke the page compositor after pointer lock.
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
  return withCanvasCaptureDeadline(()=>page.evaluate(async()=>{
    const canvas=document.querySelector('canvas');
    const gl=canvas?.getContext('webgl2');
    if(!gl || gl.isContextLost?.() || canvas.width<=0 || canvas.height<=0)
      throw new Error('Live WebGL canvas not available for capture');
    // The source is still the original already-rendered WebGL framebuffer.
    // toBlob keeps JPEG encoding asynchronous instead of toDataURL's
    // synchronous readback/serialization on SwiftShader's page main thread.
    // Context, full resolution, camera pose and pixel variation are verified
    // by the original real-browser assertions surrounding this operation.
    if(typeof canvas.toBlob!=='function')
      throw new Error('Live WebGL canvas cannot encode JPEG asynchronously');
    const blob=await new Promise((resolve,reject)=>{
      try {
        canvas.toBlob(result=>result?resolve(result):reject(new Error('Live WebGL canvas did not encode actual JPEG pixels')),'image/jpeg',0.92);
      } catch(error) {reject(error);}
    });
    if(blob.type!=='image/jpeg' || blob.size<4)
      throw new Error('Live WebGL canvas did not encode actual JPEG pixels');
    const encoded=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(reader.error ?? new Error('Live WebGL JPEG data read failed'));
      reader.onload=()=>resolve(reader.result);
      try {reader.readAsDataURL(blob);} catch(error) {reject(error);}
    });
    if(typeof encoded!=='string' || !encoded.startsWith('data:image/jpeg;base64,'))
      throw new Error('Live WebGL canvas did not encode actual JPEG pixels');
    return encoded;
  }),20_000);
}
