import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]??'release/shiretoko-phase1-review/comparison');
const out=resolve(root,'pairs');await mkdir(out,{recursive:true});
const v2=JSON.parse(await readFile(resolve(root,'v2/capture.json'),'utf8')),v3=JSON.parse(await readFile(resolve(root,'v3/capture.json'),'utf8'));
if(JSON.stringify(v2.views)!==JSON.stringify(v3.views)||JSON.stringify(v2.viewport)!==JSON.stringify(v3.viewport))throw new Error('Refusing mismatched camera conditions');
const browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage(),pairs=[];
try{
 for(const {file} of v3.captures){
  const images=await Promise.all(['v2','v3'].map(async version=>(await readFile(resolve(root,version,file))).toString('base64')));
  const result=await page.evaluate(async({images,file})=>{
   const [a,b]=await Promise.all(images.map(data=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=`data:image/jpeg;base64,${data}`;})));
   if(a.width!==b.width||a.height!==b.height)throw new Error('Image dimensions differ');
   const pixels=document.createElement('canvas');pixels.width=a.width;pixels.height=a.height;const ctx=pixels.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(a,0,0);const p=ctx.getImageData(0,0,a.width,a.height).data;ctx.drawImage(b,0,0);const q=ctx.getImageData(0,0,a.width,a.height).data;
   let sum=0,changed=0,max=0;for(let i=0;i<p.length;i+=4){let pixel=0;for(let n=0;n<3;n++){const d=Math.abs(p[i+n]-q[i+n]);sum+=d;max=Math.max(max,d);pixel=Math.max(pixel,d);}changed+=Number(pixel>1);}
   const pair=document.createElement('canvas');pair.width=a.width*2;pair.height=a.height+42;const c=pair.getContext('2d');c.fillStyle='#0d1720';c.fillRect(0,0,pair.width,pair.height);c.fillStyle='#edf0ea';c.font='18px sans-serif';c.fillText(`v2 — ${file}`,20,28);c.fillText(`v3 — ${file}`,a.width+20,28);c.drawImage(a,0,42);c.drawImage(b,a.width,42);
   return{width:a.width,height:a.height,meanAbsoluteChannelDifference:sum/(a.width*a.height*3),maxChannelDifference:max,pixelsOver1:changed,totalPixels:a.width*a.height,jpeg:pair.toDataURL('image/jpeg',.94).split(',')[1]};
  },{images,file});
  const {jpeg,...stats}=result;await writeFile(resolve(out,file),Buffer.from(jpeg,'base64'));pairs.push({file,...stats});
 }
 await writeFile(resolve(root,'comparison.json'),JSON.stringify({baseline:v2.source,current:v3.source,baselineArtifactSHA256:v2.artifactSHA256,currentArtifactSHA256:v3.artifactSHA256,viewport:v3.viewport,dpr:1,fov:44,waterTime:0,cameraConditionsEqual:true,pairs,note:'Raw browser captures are retained under v2/ and v3/. pairs/ only places those two screenshots side by side with labels. Pixel difference measures CHANGE, not aesthetic quality or acceptance.'},null,2));
 console.log(JSON.stringify({pairs:pairs.length,output:out},null,2));
}finally{await browser.close();}
