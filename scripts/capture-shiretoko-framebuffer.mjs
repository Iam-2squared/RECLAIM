/**
 * Runs as page.evaluate(captureTerrainFramebuffer). No imported closure state.
 * Read the actual preserved WebGL2 framebuffer through a pixel-pack buffer
 * and fence, yielding while the GPU completes instead of blocking with finish.
 * Based on the WebGL2 async-readback pattern documented by MDN. No redraw,
 * scene substitution, input, camera mutation, resize or game-storage access.
 */
export async function captureTerrainFramebuffer({quality=.92,timeoutMs=15000}={}) {
 const api=window.__SHIRETOKO_TERRAIN__,canvas=document.querySelector('canvas');
 const gl=canvas?.getContext('webgl2');
 if(!api||!gl||gl.isContextLost())throw new Error('Live terrain WebGL2 context required');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)throw new RangeError('Invalid framebuffer deadline');
 if(!Number.isFinite(quality)||quality<0||quality>1)throw new RangeError('Invalid JPEG quality');
 const width=canvas.width,height=canvas.height,byteLength=width*height*4;
 if(!Number.isSafeInteger(byteLength)||byteLength<=0||byteLength>67108864)throw new RangeError('Framebuffer outside capture budget');
 const preserveDrawingBuffer=Boolean(gl.getContextAttributes()?.preserveDrawingBuffer);
 if(!preserveDrawingBuffer)throw new Error('A preserved actual framebuffer is required');
 const d=api.diagnostics();
 const metadata={...d,width,height,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,preserveDrawingBuffer,
  grounded:d.player.grounded,groundError:Math.abs(d.player.y-api.terrain.heightAt(d.player.x,d.player.z)),
  water:api.terrain.inWater(d.player.x,d.player.z),yaw:api.walker.yaw,pitch:api.walker.pitch,fov:d.camera.fov};
 const priorPack=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),buffer=gl.createBuffer();
 if(!buffer)throw new Error('Could not allocate framebuffer transfer buffer');
 let sync=null;
 try {
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);
  gl.bufferData(gl.PIXEL_PACK_BUFFER,byteLength,gl.STREAM_READ);
  gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,0);
  sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  gl.flush();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,priorPack);
  if(!sync)throw new Error('Could not create framebuffer completion fence');
  const deadline=performance.now()+timeoutMs;
  for(;;){
   if(gl.isContextLost())throw new Error('Context lost during framebuffer transfer');
   const state=gl.clientWaitSync(sync,0,0);
   if(state===gl.ALREADY_SIGNALED||state===gl.CONDITION_SATISFIED)break;
   if(state!==gl.TIMEOUT_EXPIRED)throw new Error(`Framebuffer fence failed: ${state}`);
   if(performance.now()>=deadline)throw new Error('Framebuffer completion deadline exceeded');
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  const rgba=new Uint8Array(byteLength);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);
  gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,rgba);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,priorPack);
  const glError=gl.getError();
  if(glError!==gl.NO_ERROR)throw new Error(`Framebuffer transfer GL error: ${glError}`);
  // WebGL rows start at the bottom. Encode precisely those bytes, flipped into
  // normal image row order; do not ask the still-rendering GL canvas to capture again.
  const imageCanvas=document.createElement('canvas');imageCanvas.width=width;imageCanvas.height=height;
  const ctx=imageCanvas.getContext('2d');if(!ctx)throw new Error('Image encoder unavailable');
  const pixels=ctx.createImageData(width,height),stride=width*4;
  let min=255,max=0;
  for(let y=0;y<height;y++)pixels.data.set(rgba.subarray((height-1-y)*stride,(height-y)*stride),y*stride);
  for(let i=0;i<rgba.length;i+=4)for(let c=0;c<3;c++){min=Math.min(min,rgba[i+c]);max=Math.max(max,rgba[i+c]);}
  ctx.putImageData(pixels,0,0);
  return {...metadata,min,max,glError,image:imageCanvas.toDataURL('image/jpeg',quality),readback:'WebGL2 pixel-pack buffer + completed fence'};
 } finally {
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,priorPack);
  if(sync)gl.deleteSync(sync);
  gl.deleteBuffer(buffer);
 }
}
