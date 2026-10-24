/** Actual opt-in, save-isolated Shiretoko flora + boardwalk WebGL evidence. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {captureTerrainFramebuffer} from './capture-terrain-framebuffer.mjs';
import {closeReviewBrowser} from './close-review-browser.mjs';
const out=resolve('release/shiretoko-nature-review');
await mkdir(out,{recursive:true});
const artifact=resolve('release/RECLAIM_Shiretoko_Terrain_Phase1.html');
const html=await readFile(artifact,'utf8');
const sourceSHA=html.match(/name="reclaim-terrain-source" content="([^"]+)"/)?.[1];
assert.match(sourceSHA??'',/^[0-9a-f]{40}$/);
const browser=await chromium.launch({headless:true,
  ...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1100,height:680},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],network=[];
const result={sourceSHA,browser:browser.version(),method:'real WebGL2 SwiftShader; async pixel buffer and fence',
  device:'CI software renderer; NOT physical Windows GPU',tests:[],images:[],errors,network};
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/i.test(r.url()))network.push(r.url());});
await page.addInitScript(()=>{
  window.__natureStorageAccess=[];
  for(const method of ['getItem','setItem','removeItem','clear'])
    Storage.prototype[method]=function(){
      window.__natureStorageAccess.push(method);
      throw new Error('Independent nature review must not access game saves');
    };
});
let renderingContext;
try{
  await page.goto(pathToFileURL(artifact).href+'?flora=low&boardwalk=1&cabin=1');
  await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{},{timeout:60000});
  renderingContext=await page.evaluateHandle(()=>document.querySelector('canvas').getContext('webgl2'));
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.freeze(true));

  // The standalone URL must FIRST display its selected real cabin, not only
  // a manually forced camera used for downstream vegetation/deck screenshots.
  await page.waitForFunction(()=>{
    const a=window.__SHIRETOKO_TERRAIN__,d=a?.diagnostics();
    return d?.renderCallsTotal>=2 && d.mode==='orbit' && d.cabinReview?.enabled;
  },{},{timeout:30000});
  const firstLook=await page.evaluate(()=>{
    const a=window.__SHIRETOKO_TERRAIN__,d=a.diagnostics(),t=a.terrain;
    return {camera:d.camera,renderCalls:d.renderCallsTotal,
      expectedPosition:[-60,t.heightAt(-60,820)+12,820],
      expectedTarget:[-100,t.heightAt(-100,835)+2,835],
      label:document.getElementById('scene-title')?.textContent,
      reviewMode:document.querySelector('[data-nature-review]')?.textContent};
  });
  for(const field of ['position','target']) {
    const expected=field==='position'?firstLook.expectedPosition:firstLook.expectedTarget;
    for(let i=0;i<3;i++)assert.ok(Math.abs(firstLook.camera[field][i]-expected[i])<.01,
      'native cabin first-look '+field+' must match actual 5m terrain elevation');
  }
  assert.match(firstLook.label??'',/崖上の家/);
  assert.match(firstLook.reviewMode??'',/崖上住宅/);
  const firstFrame=await page.evaluate(captureTerrainFramebuffer);
  assert.equal(firstFrame.glError,0);
  assert.ok(firstFrame.max-firstFrame.min>20,'first-open cabin WebGL view must contain actual scene pixels');
  assert.ok(firstFrame.image.startsWith('data:image/jpeg;base64,'),'native opening JPEG MIME missing');
  const firstBytes=Buffer.from(firstFrame.image.split(',')[1],'base64');
  assert.ok(firstBytes.length>2000,'first-open real framebuffer image missing');
  await writeFile(resolve(out,'first-look-cabin-actual-webgl.jpg'),firstBytes);
  result.images.push({name:'first-look-cabin',filename:'first-look-cabin-actual-webgl.jpg',
    bytes:firstBytes.length,width:firstFrame.width,height:firstFrame.height,
    min:firstFrame.min,max:firstFrame.max,frameCount:firstFrame.renderCallsTotal,
    camera:firstFrame.cameraPosition});
  result.tests.push({name:'native first-open camera frames real cabin and preserves opt-in review',
    pass:true,camera:firstLook.camera,renderCalls:firstLook.renderCalls});

  // Exercise the actual DOM walk control, not just the lower-level walker.
  // Opt-in cabin mode must put the player on the rendered stair surface and
  // restore the same first-look camera after a native Escape key.
  await page.locator('#walk').click();
  const cabinEntry=await page.evaluate(()=>{
    const a=window.__SHIRETOKO_TERRAIN__,d=a.diagnostics();
    return {mode:d.mode,player:d.player,entrance:a.cabinEntrance,
      expectedY:a.cabinHeightAt(a.cabinEntrance.x,a.cabinEntrance.z)};
  });
  assert.equal(cabinEntry.mode,'walk','visible walk button must enter true walking mode');
  assert.ok(Math.hypot(cabinEntry.player.x-cabinEntry.entrance.x,
    cabinEntry.player.z-cabinEntry.entrance.z)<.001,
    'cabin first-look walking must start at its actual staircase, not the distant cape');
  assert.ok(Math.abs(cabinEntry.player.y-cabinEntry.expectedY)<1e-5,
    'native walk enters on the same visible staircase height');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().mode==='orbit',
    {},{timeout:30000});
  const afterWalk=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().camera);
  for(const field of ['position','target']) {
    const expected=field==='position'?firstLook.expectedPosition:firstLook.expectedTarget;
    for(let i=0;i<3;i++)assert.ok(Math.abs(afterWalk[field][i]-expected[i])<.02,
      'Escape should restore the opted-in cabin camera instead of empty overview sky');
  }
  result.tests.push({name:'actual walk click spawns on cabin stairs and Escape restores review view',
    pass:true,entry:cabinEntry,restoredCamera:afterWalk});

  const review=await page.evaluate(()=>{
    const a=window.__SHIRETOKO_TERRAIN__,d=a.diagnostics();
    if(!d.floraReview.enabled||d.floraReview.quality!=='low'||d.floraReview.instances<=1000||
       d.floraReview.drawGroups<1||d.floraReview.drawGroups>96)throw Error('floral layer absent/over budget');
    if(!d.boardwalkReview.enabled||d.boardwalkReview.panels<30||
       d.boardwalkReview.indexedTriangles!==d.boardwalkReview.panels*2)
      throw Error('rendered indexed boardwalk absent');
    if(!d.cabinReview?.enabled||d.cabinReview.parts<25||d.cabinReview.stairs<3)
      throw Error('headland cabin mesh absent');
    const e=a.cabinEntrance;
    if(!e||!a.walker.place(e.x,e.z))throw Error('cannot enter real cabin stairs');
    a.walker.yaw=Math.PI/2;
    for(let i=0;i<245;i++)a.walker.step({forward:1,right:0,sprint:false,jump:false},1/60);
    if(a.walker.x>=-94||a.walker.x<=-108.7||Math.abs(a.walker.y-d.cabinReview.floorY)>1e-5)
      throw Error('cabin doorway/stair walking and real floor are inconsistent');
    if(!a.cabinBlockedAt(-109,835)||a.cabinBlockedAt(-91,835))
      throw Error('cabin real wall/door collision contract failed');
    if(d.shaderError||d.contextLost||d.renderCallsTotal<1)throw Error('WebGL not rendering');
    const u=a.route[3],v=a.route[4],x=(u.x+v.x)/2,z=(u.z+v.z)/2;
    const deck=a.boardwalkHeightAt(x,z), ground=a.terrain.heightAt(x,z);
    if(!Number.isFinite(deck)||deck<=ground+.1)throw Error('visible raised deck height absent');
    if(!a.walker.place(x,z)||Math.abs(a.walker.y-deck)>1e-6)
      throw Error('actual deck geometry and player contact do not agree');
    a.walker.step({forward:0,right:0,sprint:false,jump:true},1/60);
    if(a.walker.grounded)throw Error('deck jump did not take off');
    for(let i=0;i<90;i++)a.walker.step({forward:0,right:0,sprint:false,jump:false},1/60);
    if(!a.walker.grounded||Math.abs(a.walker.y-deck)>1e-5)
      throw Error('player did not land back on the same deck');
    return {floral:d.floraReview,boardwalk:d.boardwalkReview,cabin:d.cabinReview,drawCalls:d.drawCalls,
      triangles:d.triangles,geometries:d.geometries,textures:d.textures,
      deckContact:{x,z,deck,ground,landed:a.walker.y}};
  });
  assert.equal(await page.locator('[data-nature-review]').count(),1);
  result.tests.push({name:'flora LOD, actual raised indexed deck, walker jump/landing',data:review});
  const views=[
    {name:'wooden-wetland',x:-50,z:610,tx:-118,tz:500,elevation:10},
    {name:'flora-wetland',x:-130,z:410,tx:-210,tz:370,elevation:6},
    {name:'headland-cabin',x:-38,z:881,tx:-100,tz:835,elevation:12}
  ];
  for(const view of views){
    const before=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal);
    await page.evaluate(({x,z,tx,tz,elevation})=>{
      const api=window.__SHIRETOKO_TERRAIN__,t=api.terrain;
      api.viewFrom([x,t.heightAt(x,z)+elevation,z],[tx,t.heightAt(tx,tz)+2,tz]);
    },view);
    await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,
      before,{timeout:30000});
    const frame=await page.evaluate(captureTerrainFramebuffer);
    assert.equal(frame.glError,0);
    assert.ok(frame.max-frame.min>20,'actual RGB framebuffer must contain scene variation');
    assert.match(frame.image,/^data:image\/jpeg;base64,/);
    const data=Buffer.from(frame.image.split(',')[1],'base64');
    assert.ok(data.length>2000,'actual JPEG pixels missing');
    const filename=view.name+'-actual-webgl.jpg';
    await writeFile(resolve(out,filename),data);
    result.images.push({name:view.name,filename,bytes:data.length,
      width:frame.width,height:frame.height,min:frame.min,max:frame.max,
      frameCount:frame.renderCallsTotal,camera:frame.cameraPosition});
  }
  assert.deepEqual(await page.evaluate(()=>window.__natureStorageAccess),[]);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());
  const d=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
  assert.equal(d.disposed,true);assert.equal(d.geometries,0);assert.equal(d.textures,0);
  assert.equal(await page.locator('canvas').count(),0);
  assert.equal(await page.locator('[data-nature-review]').count(),0);
  result.tests.push({name:'no saves/network, resources released',pass:true});

  // A second isolated URL is deliberately visited, not an internal viewFrom:
  // this proves the new public ?lookout=1 review truly starts beside the lake.
  await page.goto(pathToFileURL(artifact).href+'?lookout=1');
  await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,
    {},{timeout:60000});
  renderingContext=await page.evaluateHandle(()=>document.querySelector('canvas').getContext('webgl2'));
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.freeze(true));
  await page.waitForFunction(()=>{
    const d=window.__SHIRETOKO_TERRAIN__?.diagnostics();
    return d?.renderCallsTotal>=2&&d.mode==='orbit'&&d.lakeLookoutReview?.enabled;
  },{},{timeout:30000});
  const lakeFirst=await page.evaluate(()=>{
    const api=window.__SHIRETOKO_TERRAIN__,d=api.diagnostics(),entry=api.lakeLookoutEntrance;
    const point=d.lakeLookoutReview.viewpoint;
    return {entry,point,camera:d.camera,renderCalls:d.renderCallsTotal,
      openTitle:document.querySelector('#scene-title')?.textContent,
      surface:api.lakeLookoutHeightAt(entry.x,entry.z),
      dry:!api.terrain.inWater(entry.x,entry.z),
      normalSaveAccess:window.__natureStorageAccess};
  });
  assert(lakeFirst.dry,'new deck entrance must sit on non-submerged real terrain');
  assert(Math.abs(lakeFirst.camera.target[0]-lakeFirst.point.x)<.01);
  assert(Math.abs(lakeFirst.camera.target[1]-lakeFirst.point.y-1)<.01);
  assert.match(lakeFirst.openTitle??'',/湖畔/);
  assert.deepEqual(lakeFirst.normalSaveAccess,[]);
  const lakeFrame=await page.evaluate(captureTerrainFramebuffer);
  assert.equal(lakeFrame.glError,0);
  assert.ok(lakeFrame.max-lakeFrame.min>20,'real first-open lake WebGL must show geometry');
  assert.match(lakeFrame.image,/^data:image\/jpeg;base64,/);
  const lakeBytes=Buffer.from(lakeFrame.image.split(',')[1],'base64');
  assert.ok(lakeBytes.length>2000,'actual lake screenshot absent');
  const lakeFile='highland-lake-lookout-actual-webgl.jpg';
  await writeFile(resolve(out,lakeFile),lakeBytes);
  result.images.push({name:'lake-lookout',filename:lakeFile,
    width:lakeFrame.width,height:lakeFrame.height,bytes:lakeBytes.length,
    min:lakeFrame.min,max:lakeFrame.max,frameCount:lakeFrame.renderCallsTotal,
    camera:lakeFrame.cameraPosition});

  // Native HTML click and real walker/rail height, then Escape must restore
  // the same camera without ever entering or changing the campaign save.
  await page.locator('#walk').click();
  const lakeWalk=await page.evaluate(()=>{
    const api=window.__SHIRETOKO_TERRAIN__,d=api.diagnostics(),e=api.lakeLookoutEntrance;
    return {mode:d.mode,x:d.player.x,y:d.player.y,z:d.player.z,
      entrance:e,heightAt:api.lakeLookoutHeightAt(e.x,e.z),
      blocked:api.lakeLookoutBlockedAt(e.x,e.z)};
  });
  assert.equal(lakeWalk.mode,'walk');
  assert.equal(lakeWalk.blocked,false,'rendered west entrance remains open');
  assert(Math.hypot(lakeWalk.x-lakeWalk.entrance.x,
    lakeWalk.z-lakeWalk.entrance.z)<.001);
  assert(Math.abs(lakeWalk.y-lakeWalk.heightAt)<1e-5,
    'native lake walking must start on the same visible deck triangle');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().mode==='orbit',
    {},{timeout:30000});
  const lakeReturned=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().camera);
  for(let i=0;i<3;i++){
    assert(Math.abs(lakeReturned.position[i]-lakeFirst.camera.position[i])<.02);
    assert(Math.abs(lakeReturned.target[i]-lakeFirst.camera.target[i])<.02);
  }
  assert.deepEqual(await page.evaluate(()=>window.__natureStorageAccess),[]);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());
  const released=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
  assert.equal(released.disposed,true);
  assert.equal(released.geometries,0);
  assert.equal(released.textures,0);
  assert.equal(await page.locator('canvas').count(),0);
  assert.equal(await page.locator('[data-nature-review]').count(),0);
  result.tests.push({name:'native lake preview, same-mesh walk/rail, Escape, WebGL and release',
    pass:true,initial:lakeFirst,walk:lakeWalk,afterWalk:lakeReturned});
  // Follow the sixth public review card to its actual 2400m highland flora.
  // Unlike an artificial viewFrom, this checks the first camera and native
  // walk destination after a fresh file:// navigation, without save changes.
  await page.goto(pathToFileURL(artifact).href+'?flora=low&highland=1');
  await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,
    {},{timeout:60000});
  renderingContext=await page.evaluateHandle(()=>document.querySelector('canvas').getContext('webgl2'));
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.freeze(true));
  await page.waitForFunction(()=>{
    const d=window.__SHIRETOKO_TERRAIN__?.diagnostics();
    return d?.renderCallsTotal>=2&&d.mode==='orbit'&&d.floraReview?.enabled;
  },{},{timeout:30000});
  const highland=await page.evaluate(()=>{
    const a=window.__SHIRETOKO_TERRAIN__,d=a.diagnostics(),terrain=a.terrain;
    return {camera:d.camera,instances:d.floraReview.instances,
      ground:terrain.heightAt(170,-850),
      expectedPosition:[145,terrain.heightAt(145,-810)+35,-810],
      expectedTarget:[170,terrain.heightAt(170,-850)+2,-850],
      label:document.querySelector('#scene-title')?.textContent};
  });
  for(const field of ['position','target']){
    const expected=field==='position'?highland.expectedPosition:highland.expectedTarget;
    for(let i=0;i<3;i++)assert(Math.abs(highland.camera[field][i]-expected[i])<.02,
      'native highland '+field+' must track actual 5m terrain');
  }
  assert.match(highland.label??'',/高原/);
  assert(highland.instances>1200,'highland view must load actual vegetation instances');
  const highlandFrame=await page.evaluate(captureTerrainFramebuffer);
  assert.equal(highlandFrame.glError,0);
  assert(highlandFrame.max-highlandFrame.min>20,'highland screenshot must contain real RGB scene variation');
  assert.match(highlandFrame.image,/^data:image\/jpeg;base64,/);
  const highlandBytes=Buffer.from(highlandFrame.image.split(',')[1],'base64');
  assert(highlandBytes.length>2000,'highland WebGL image must contain visible geometry');
  const highlandFile='highland-shrubs-first-open-actual-webgl.jpg';
  await writeFile(resolve(out,highlandFile),highlandBytes);
  result.images.push({name:'highland-shrubs',filename:highlandFile,
    bytes:highlandBytes.length,width:highlandFrame.width,height:highlandFrame.height,
    min:highlandFrame.min,max:highlandFrame.max,
    frameCount:highlandFrame.renderCallsTotal,camera:highlandFrame.cameraPosition});
  await page.locator('#walk').click();
  const mountainWalk=await page.evaluate(()=>{
    const a=window.__SHIRETOKO_TERRAIN__,d=a.diagnostics();
    return {mode:d.mode,x:d.player.x,z:d.player.z,y:d.player.y,
      ground:a.terrain.heightAt(d.player.x,d.player.z)};
  });
  assert.equal(mountainWalk.mode,'walk');
  assert(Math.hypot(mountainWalk.x-170,mountainWalk.z+850)<.001,
    'native highland link must enter the authored mountain route, not the cape');
  assert(Math.abs(mountainWalk.y-mountainWalk.ground)<1e-5,
    'highland native walker must stand on the real 5m mesh');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().mode==='orbit',
    {},{timeout:30000});
  const highlandReturned=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().camera);
  for(const field of ['position','target'])for(let i=0;i<3;i++)
    assert(Math.abs(highlandReturned[field][i]-highland.camera[field][i])<.02,
      'native Escape must restore opted-in highland camera');
  assert.deepEqual(await page.evaluate(()=>window.__natureStorageAccess),[]);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());
  const highlandDisposed=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
  assert.equal(highlandDisposed.disposed,true);
  assert.equal(highlandDisposed.geometries,0);
  assert.equal(highlandDisposed.textures,0);
  assert.equal(await page.locator('canvas').count(),0);
  result.tests.push({name:'native highland public URL, actual 5m first camera, mountain walk, Escape and disposal',
    pass:true,initial:highland,walk:mountainWalk,returned:highlandReturned});

  console.log('NATURE WEBGL PASS',JSON.stringify({sourceSHA,images:result.images.length,
    instances:review.floral.instances,panels:review.boardwalk.panels,stairs:review.cabin.stairs}));
}catch(error){
  errors.push(String(error?.stack??error));
  throw error;
}finally{
  await writeFile(resolve(out,'nature-real-webgl.json'),JSON.stringify(result,null,2));
  await closeReviewBrowser(browser,context,renderingContext);
}