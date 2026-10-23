import assert from 'node:assert/strict';
import {captureTerrainScreenshot} from './capture-shiretoko-page-frame.mjs';
import {withCanvasCaptureDeadline} from './webgl-canvas-jpeg.mjs';

/** Capture the real settled V4 walking frame without a blocking GPU finish.
 * All reads, encoding and CPU image checks share the existing 20-second
 * capture budget. A timeout is a failure, never a fallback or silent retry.
 */
export async function captureShiretokoWalkFrame(page) {
  return withCanvasCaptureDeadline(async()=>{
    const read=()=>page.evaluate(()=>{
      const api=window.__SHIRETOKO_TERRAIN__,d=api.diagnostics();
      return {...d,groundError:Math.abs(d.player.y-api.terrain.heightAt(d.player.x,d.player.z)),
        water:api.terrain.inWater(d.player.x,d.player.z)};
    });
    const before=await read();
    const capture=await captureTerrainScreenshot(page);
    const after=await read();
    for(const state of [before,after]){
      assert.equal(state.mode,'walk');
      assert.equal(state.pointerLocked,true);
      assert.equal(state.player.grounded,true);
      assert.equal(state.water,false);
      assert.ok(state.groundError<.001);
      assert.deepEqual(state.inputKeys,[]);
      assert.equal(state.contextLost,false);
      assert.equal(state.shaderError,false);
      assert.deepEqual(state.viewport,[1600,900]);
      assert.equal(state.dpr,1);
    }
    assert.deepEqual(before.player,after.player,'actual walker must not move during capture');
    assert.deepEqual(before.camera,after.camera,'actual camera must not move during capture');
    assert.equal(capture.width,1600);assert.equal(capture.height,900);
    assert.deepEqual(capture.viewport,[1600,900]);assert.equal(capture.dpr,1);
    assert.equal(capture.preserveDrawingBuffer,true);
    assert.equal(capture.glError,0);assert.equal(capture.contextLost,false);
    assert.equal(capture.shaderError,false);assert.equal(capture.mode,'walk');
    assert.equal(capture.pointerLocked,true);assert.equal(capture.grounded,true);
    assert.deepEqual(capture.inputKeys,[]);assert.ok(capture.groundError<.001);
    assert.deepEqual(capture.cameraPosition,before.camera.position);
    assert.equal(capture.fov,before.camera.fov);
    assert.ok(capture.max>capture.min,'real framebuffer must contain nonblank pixels');
    assert.ok(capture.renderCallsTotal>=before.renderCallsTotal);
    return {...before,glError:capture.glError,image:capture.image,
      captureWidth:capture.width,captureHeight:capture.height,
      captureMethod:'Actual preserved WebGL canvas; asynchronous JPEG; DOM excluded'};
  },20_000);
}
