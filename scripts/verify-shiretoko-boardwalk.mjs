/**
 * Independent boardwalk preview: real Chromium WebGL, rendered deck, and
 * matching CPU collision surface. Never touches TITLE/HOME or campaign saves.
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const output=resolve('release/shiretoko-boardwalk-review');
await mkdir(output,{recursive:true});
const htmlFile=resolve('release/RECLAIM_Shiretoko_Terrain_Phase1.html');
const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
    '--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files'],
});
const result={
  environment:'Chromium WebGL / Linux software SwiftShader; no physical PC/mobile validation',
  browser:browser.version(), sourceCommit:'', quality:'prototype', tests:[], errors:[],
  saveAccess:[], externalRequests:[], images:[], snapshots:[],
};
const html=await readFile(htmlFile,'utf8');
result.sourceCommit=html.match(/name="reclaim-terrain-source" content="([^"]+)"/)?.[1]??'not embedded';
try {
  for(const enabled of [false,true]){
    const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',e=>result.errors.push(e.message));
    page.on('request',request=>{if(/^https?:/.test(request.url()))result.externalRequests.push(request.url());});
    await page.addInitScript(()=>{
      window.__boardwalkStorage=[];
      for(const method of ['getItem','setItem','removeItem','clear']){
        Storage.prototype[method]=function(){window.__boardwalkStorage.push(method);throw Error('review must not access game storage');};
      }
    });
    const url=pathToFileURL(htmlFile).href+(enabled?'?boardwalk=1':'');
    try{
      await page.goto(url,{waitUntil:'load'});
      await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{}, {timeout:60000});
      await page.evaluate(()=>{window.__SHIRETOKO_TERRAIN__.freeze(true);window.__SHIRETOKO_TERRAIN__.setView(2);});
      await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().camera.fov===44);
      const info=await page.evaluate(()=>{
        const api=window.__SHIRETOKO_TERRAIN__,canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');
        gl.finish();
        const d=api.diagnostics();
        const point={x:-85,z:565};
        const ground=api.terrain.heightAt(point.x,point.z);
        const deck=api.boardwalkHeightAt?.(point.x,point.z)??null;
        const walker=api.walker;
        const placed=walker.place(point.x,point.z);
        return {d,ground,deck,placed,playerY:walker.y,
          glError:gl.getError(),image:canvas.toDataURL('image/png'),w:canvas.width,h:canvas.height};
      });
      assert.equal(info.d.boardwalkReview.enabled,enabled);
      assert.equal(info.d.florareview?.enabled??false,false);
      assert.equal(info.glError,0);
      assert.equal(info.placed,true);
      assert.equal(info.w>0&&info.h>0,true);
      if(enabled){
        assert(info.d.boardwalkReview.panels>30&&info.d.boardwalkReview.panels<=260);
        assert(info.d.boardwalkReview.indexedTriangles===info.d.boardwalkReview.panels*2);
        assert(info.deck!==null,'visible deck surface must exist under the test walker');
        assert(info.deck>info.ground+.1,'deck must stand above the underlying terrain');
        assert(Math.abs(info.playerY-info.deck)<1e-6);
        assert(await page.locator('[data-boardwalk-review]').count()===1);
        result.tests.push('Boardwalk opt-in: actual indexed deck and walker share height triangles');
      }else{
        assert.equal(info.deck,null);
        assert.equal(info.playerY,info.ground);
        assert.equal(await page.locator('[data-boardwalk-review]').count(),0);
        result.tests.push('Default terrain view: no boardwalk, identical terrain-grounded walker');
      }
      const name=enabled?'boardwalk-wetland-webgl.png':'baseline-wetland-webgl.png';
      await writeFile(resolve(output,name),Buffer.from(info.image.split(',')[1],'base64'));
      delete info.image;
      result.images.push({name,viewport:[1600,900],surface:'preserved WebGL framebuffer without DOM'});
      result.snapshots.push({enabled,diagnostics:info.d,ground:info.ground,deck:info.deck,playerY:info.playerY,glError:info.glError});
      const storage=await page.evaluate(()=>window.__boardwalkStorage);
      result.saveAccess.push(...storage);
      await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());
      assert.equal(await page.locator('canvas').count(),0);
      assert.equal(storage.length,0);
    }catch(error){
      result.errors.push(String(error));
      await page.screenshot({path:resolve(output,enabled?'ERROR-boardwalk.png':'ERROR-default.png')}).catch(()=>{});
      throw error;
    }finally{await context.close();}
  }
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.externalRequests,[]);
  assert.deepEqual(result.saveAccess,[]);
  result.tests.push('No errors, external network, save access; both scenes dispose');
  console.log(JSON.stringify({tests:result.tests,browser:result.browser,images:result.images}));
}finally{
  await writeFile(resolve(output,'evidence.json'),JSON.stringify(result,null,2));
  await browser.close();
}
