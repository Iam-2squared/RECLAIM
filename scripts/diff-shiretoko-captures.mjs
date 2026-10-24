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
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const figures=pairs.map(p=>`<section><h2>${escape(p.file)}</h2><div class="pair">${['v2','v3'].map(v=>`<figure><figcaption>${v}</figcaption><a href="${v}/${escape(p.file)}"><img loading="lazy" src="${v}/${escape(p.file)}" alt="${v} ${escape(p.file)}" /></a></figure>`).join('')}</div><p>平均RGB差 ${p.meanAbsoluteChannelDifference.toFixed(3)} / 255 — 差分量であり、品質点数ではありません。</p></section>`).join('');
 await writeFile(resolve(root,'gallery.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RECLAIM 地形 v2 / v3 実WebGL比較</title><style>body{margin:0 auto;padding:30px;max-width:1800px;background:#101b24;color:#e1e7e5;font:15px/1.7 system-ui,sans-serif}h1{font-size:26px}h2{font-size:17px;margin:30px 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}figcaption{font-weight:700;padding:8px 12px;background:#21323d}img{display:block;width:100%;height:auto}p{color:#afbdc3}a{color:#cbd4ad}code{overflow-wrap:anywhere}@media(max-width:650px){body{padding:12px}.pair{gap:5px}h1{font-size:20px}}</style><h1>地形 v2 → v3：同条件の実WebGL比較</h1><p>1600×900 / DPR1 / FOV44 / 同一世界座標カメラ / 水面時刻0。左右の原画像は編集せず保持。画像を開くと原寸表示できます。写真品質の承認や物理Windows性能の証明ではありません。</p><p>v2 <code>${escape(v2.source)}</code><br>v3 <code>${escape(v3.source)}</code></p><a href="comparison.json">比較JSON</a>${figures}</html>`);
 console.log(JSON.stringify({pairs:pairs.length,output:out,gallery:resolve(root,'gallery.html')},null,2));
}finally{await browser.close();}
