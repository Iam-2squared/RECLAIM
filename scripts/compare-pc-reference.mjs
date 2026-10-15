import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Compare two actually rendered builds, not a rescaled image approximation.
const [baseline,candidate]=process.argv.slice(2).map(p=>resolve(p));
if(!baseline||!candidate)throw new Error('Usage: node scripts/compare-pc-reference.mjs baseline.html candidate.html');
const out=resolve(process.env.RECLAIM_PC_COMPARISON_OUT??'test-results/pc-comparison');
await mkdir(out,{recursive:true});
const metadata=async path=>{const bytes=await readFile(path),html=bytes.toString();return{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sourceCommit:html.match(/name="reclaim-source-commit" content="([a-f0-9]+)"/)?.[1]};};
const report={baseline:await metadata(baseline),candidate:await metadata(candidate),browser:null,cases:[],errors:[]};
const browser=await chromium.launch({...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
try{
 report.browser=browser.version();
 for(const [width,height] of [[1920,1080],[1536,864],[1366,768],[1280,720],[1024,576]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
  try{
   const pages=[];
   for(const file of [baseline,candidate]){
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>document.body.dataset.ready==='true');
    await page.locator('.reference-backplate').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
    pages.push(page);
   }
   for(const screen of ['title','home']){
    const shots=[];
    for(const [i,page] of pages.entries()){
     if(screen==='home')await page.locator('#home-button').click();
     await page.mouse.move(5,5);await page.locator(`#${screen}-screen`).waitFor({state:'visible'});
     shots.push(await page.screenshot({path:join(out,`${width}x${height}-${screen}-${i?'candidate':'main'}.png`)}));
    }
    const diff=await pages[1].evaluate(async({a,b,width,height})=>{
     const pixels=async source=>{const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);return c.getImageData(0,0,width,height).data;};
     const x=await pixels(a),y=await pixels(b);let maxChannelError=0,overOnePixels=0,differentPixels=0;
     for(let i=0;i<x.length;i+=4){let different=false,over=false;for(let j=0;j<3;j++){const d=Math.abs(x[i+j]-y[i+j]);maxChannelError=Math.max(maxChannelError,d);different||=d>0;over||=d>1;}differentPixels+=Number(different);overOnePixels+=Number(over);}
     return {maxChannelError,overOnePixels,differentPixels,totalPixels:width*height};
    },{a:`data:image/png;base64,${shots[0].toString('base64')}`,b:`data:image/png;base64,${shots[1].toString('base64')}`,width,height});
    report.cases.push({width,height,screen,...diff,pass:diff.overOnePixels===0&&diff.maxChannelError<=1});
   }
  }finally{await context.close();}
 }
}finally{await browser.close();}
report.pass=report.errors.length===0&&report.cases.length===10&&report.cases.every(c=>c.pass);
await writeFile(join(out,'comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
