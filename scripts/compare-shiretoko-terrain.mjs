import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {createHash} from 'node:crypto';
const artifact=resolve(process.argv[2]??'release/RECLAIM_Shiretoko_Terrain_Phase1.html');
const out=resolve(process.argv[3]??'release/shiretoko-phase1-review/comparison/v2');
await mkdir(out,{recursive:true});
const views=[
 ['A-overview',[1320,1660,2270],[-10,125,-85]],
 ['B-coast',[-1320,640,750],[-70,100,120]],
 ['C-plan',[0,3500,-139],[0,0,-140]],
 ['D-cape',[-170,109.68,850],[-15,330,-650]],
 ['E-wetland',[-130,93.68,410],[100,93,435]],
 ['F-lake',[-140,156.68,-310],[180,151,-340]],
 ['G-mountain',[170,336.68,-850],[-70,600,-1250]],
 ['I-inland-reverse',[1100,1700,-4850],[0,370,-1400]],
 ['J-cape-sea',[430,160,1110],[-185,62,840]],
];
const browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
const page=await context.newPage();
// Comparison-only GL clock clamp: both unchanged v1 and v2 water shaders receive exactly t=0.
await page.addInitScript(()=>{
 const proto=WebGL2RenderingContext.prototype,clock=new WeakSet(),get=proto.getUniformLocation,set=proto.uniform1f;
 proto.getUniformLocation=function(program,name){const loc=get.call(this,program,name);if(loc&&name==='uTime')clock.add(loc);return loc;};
 proto.uniform1f=function(loc,value){return set.call(this,loc,clock.has(loc)?0:value);};
}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(pathToFileURL(artifact).href);await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{}, {timeout:60000});await page.evaluate(()=>document.fonts.ready);
 const initial=await page.evaluate(()=>{const a=window.__SHIRETOKO_TERRAIN__;a.freeze(true);a.setClean(true);return a.diagnostics();});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.masthead')).opacity==='0');
 for(const [name,p,t] of views){await page.evaluate(([p,t])=>window.__SHIRETOKO_TERRAIN__.viewFrom(p,t),[p,t]); await page.screenshot({path:resolve(out,`${name}.jpg`),type:'jpeg',quality:94,timeout:60000});console.log(name);}
 await page.evaluate(()=>{const a=window.__SHIRETOKO_TERRAIN__;a.setView(0);a.setClean(false);});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.masthead')).opacity==='1');
 await page.screenshot({path:resolve(out,'H-overview-UI.jpg'),type:'jpeg',quality:94,timeout:60000});
 const final=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
 const html=await readFile(artifact,'utf8');
 const captures=[];for(const name of [...views.map(v=>v[0]),'H-overview-UI']){const data=await readFile(resolve(out,`${name}.jpg`));captures.push({file:`${name}.jpg`,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
 await writeFile(resolve(out,'capture.json'),JSON.stringify({source:html.match(/name="reclaim-terrain-source" content="([^"]+)/)?.[1],tree:html.match(/name="reclaim-terrain-tree" content="([^"]+)/)?.[1],artifact,artifactBytes:Buffer.byteLength(html),artifactSHA256:createHash('sha256').update(html).digest('hex'),views,uiOverviewCamera:final.camera,captures,viewport:[1600,900],dpr:1,browserVersion:browser.version(),conditions:'Identical world-space cameras, FOV 44, 1600x900, DPR1. UI hidden A–G/I/J; H is default overview with UI. Deterministic scene and water uniform uTime fixed to 0 in both versions. No AI images.',initial,final,errors},null,2));
} catch(e){await page.screenshot({path:resolve(out,'FAILED.png'),timeout:60000}).catch(()=>{});throw e;}finally{await browser.close();}
