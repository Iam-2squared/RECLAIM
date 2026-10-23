import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]??'release/shiretoko-phase1-review/v4/comparison'),out=resolve(root,'pairs');await mkdir(out,{recursive:true});
const baseline=JSON.parse(await readFile(resolve(root,'v3/capture.json'),'utf8')),current=JSON.parse(await readFile(resolve(root,'v4/capture.json'),'utf8'));
for(const key of ['views','viewport','dpr','fov','waterTime','filter'])assert.deepEqual(baseline[key],current[key],key);assert.equal(current.filter,null);assert.equal(current.records.length,38);
const browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage(),pairs=[];
try{
 for(const record of current.records){
  const old=baseline.records.find(r=>r.file===record.file);assert.ok(old);
  for(const key of ['position','target'])assert.ok(Math.hypot(...record.camera[key].map((v,i)=>v-old.camera[key][i]))<1e-8,'Camera difference below10nm');assert.equal(record.camera.fov,old.camera.fov);
  const images=await Promise.all(['v3','v4'].map(async v=>(await readFile(resolve(root,v,record.file))).toString('base64')));
  const result=await page.evaluate(async({images,name})=>{
   const [a,b]=await Promise.all(images.map(data=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='data:image/jpeg;base64,'+data;})));if(a.width!==b.width||a.height!==b.height)throw Error('Mismatched viewport');
   const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(a,0,0);const x=ctx.getImageData(0,0,c.width,c.height).data;ctx.drawImage(b,0,0);const y=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,max=0,changed=0;for(let i=0;i<x.length;i+=4){let d=0;for(let j=0;j<3;j++){const n=Math.abs(x[i+j]-y[i+j]);sum+=n;max=Math.max(max,n);d=Math.max(d,n);}changed+=Number(d>1);}
   c.width=a.width*2;c.height=a.height+42;const p=c.getContext('2d');p.fillStyle='#101e25';p.fillRect(0,0,c.width,c.height);p.fillStyle='#fff';p.font='20px sans-serif';p.fillText('v3 / '+name,18,28);p.fillText('v4 / '+name,a.width+18,28);p.drawImage(a,0,42);p.drawImage(b,a.width,42);
   return{jpeg:c.toDataURL('image/jpeg',.94).split(',')[1],width:a.width,height:a.height,meanAbsoluteRGBDifference:sum/(a.width*a.height*3),maxRGBDifference:max,pixelsOver1:changed};
  },{images,name:record.name});const{jpeg,...stats}=result;await writeFile(resolve(out,record.file),Buffer.from(jpeg,'base64'));pairs.push({file:record.file,name:record.name,...stats});
 }
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 await writeFile(resolve(root,'comparison.json'),JSON.stringify({baseline:baseline.source,current:current.source,baselineSHA256:baseline.artifactSHA256,currentSHA256:current.artifactSHA256,viewport:current.viewport,dpr:current.dpr,fov:current.fov,waterTime:0,cameraConditionsEqual:true,pairs,note:'Original real WebGL page screenshots in v3/ and v4/. pairs/ only places originals side by side with version labels. RGB change is not aesthetic acceptance.'},null,2));
 await writeFile(resolve(root,'gallery.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RECLAIM v3/v4 実WebGL比較</title><style>body{margin:0 auto;max-width:1800px;padding:26px;background:#102019;color:#e1e7df;font:15px/1.7 system-ui}a{color:#e2c79c}img{width:100%;height:auto;display:block}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}figcaption{padding:8px;background:#263b30}code{overflow-wrap:anywhere}section{margin:30px 0}h2{font-size:18px}</style><h1>地形v3 → v4 / 同条件38視点</h1><p>1600×900 / DPR1 / FOV44 / 水面時刻0 / 同カメラ・同光・同空・同霧。写真品質の一致や実機性能の保証ではありません。</p><p>v3 <code>${baseline.source}</code><br>v4 <code>${current.source}</code></p><p><a href="comparison.json">比較JSON</a> / <a href="../metrics/mesh-lod-audit.json">実メッシュ/LOD検査</a></p>${pairs.map(p=>`<section id="${p.name}"><h2>${esc(p.name)}</h2><div class="pair">${['v3','v4'].map(v=>`<figure><figcaption>${v}</figcaption><a href="${v}/${p.file}"><img loading="lazy" src="${v}/${p.file}" alt="${v} ${p.name}"></a></figure>`).join('')}</div><p>RGB平均変化 ${p.meanAbsoluteRGBDifference.toFixed(3)}/255（品質点数ではありません）</p></section>`).join('')}</html>`);
 console.log(JSON.stringify({pairs:pairs.length,root}));
}finally{await browser.close();}
