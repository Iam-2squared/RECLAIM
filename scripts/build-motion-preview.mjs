import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import { collectMissionAssets } from './mission-asset-package.mjs';

const root=resolve(import.meta.dirname,'..'),workspace=resolve(root,'..');
// Refuse partial/outdated motion libraries before writing either preview file.
const assets=await collectMissionAssets(resolve(root,'public'));
const outputs=await build({configFile:false,root:resolve(root,'tools/motion-preview'),base:'./',publicDir:false,
  build:{write:false,emptyOutDir:false,cssCodeSplit:false,assetsInlineLimit:Infinity,
    rollupOptions:{input:resolve(root,'tools/motion-preview/index.html'),output:{inlineDynamicImports:true,entryFileNames:'preview.js',assetFileNames:'[name][extname]'}}}});
const result=Array.isArray(outputs)?outputs[0]:outputs;
if(!('output' in result))throw new Error('Unexpected motion preview build output');
const chunks=result.output.filter(output=>output.type==='chunk');
const htmlAsset=result.output.find(output=>output.type==='asset'&&output.fileName==='index.html');
const cssAssets=result.output.filter(output=>output.type==='asset'&&output.fileName.endsWith('.css'));
if(chunks.length!==1||!htmlAsset||cssAssets.length!==1)throw new Error('Motion preview must contain exactly one self-contained script and stylesheet');
let html=String(htmlAsset.source);
const script=html.match(/<script\b[^>]*type="module"[^>]*src="[^"]+"[^>]*><\/script>/);
const stylesheet=html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/);
if(!script||!stylesheet)throw new Error('Cannot safely inline the motion preview');
html=html.replace(script[0],()=>`<script type="module">${chunks[0].code.replace(/<\/script/gi,'<\\/script')}</script>`);
html=html.replace(stylesheet[0],()=>`<style>${String(cssAssets[0].source)}</style>`);
const data=`<script type="application/json" id="reclaim-motion-assets">${JSON.stringify(assets.payload).replaceAll('<','\\u003c')}</script>`;
const manifest=`<script type="application/json" id="reclaim-motion-manifest">${JSON.stringify(assets.records).replaceAll('<','\\u003c')}</script>`;
html=html.replace('<script type="module">',()=>`${data}\n${manifest}\n<script type="module">`);
const license=await readFile(resolve(root,'node_modules/three/LICENSE'),'utf8');
const attribution=await readFile(resolve(root,'public/home-models/ATTRIBUTION.md'),'utf8');
html=html.replace('</head>',()=>`<!-- Three.js MIT license\n${license.replaceAll('--','—')}\nCharacter attribution\n${attribution.replaceAll('--','—')}-->\n</head>`);
if(/<(?:script|link)\b[^>]*(?:src|href)="(?:https?:|\.\/?)/i.test(html))throw new Error('Motion preview still references a sidecar script or stylesheet');
const targets=[resolve(workspace,'motion/キャラ動作確認.html'),resolve(root,'release/RECLAIM_Character_Motion_Preview.html')];
for(const target of targets){
  await mkdir(resolve(target,'..'),{recursive:true});
  const prior=await open(target,'r').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(prior){try{const prefix=Buffer.alloc(4096);const {bytesRead}=await prior.read(prefix,0,prefix.length,0);if(!prefix.subarray(0,bytesRead).toString().includes('name="reclaim-motion-preview"'))throw new Error(`Refusing to overwrite unrelated HTML: ${target}`);}finally{await prior.close();}}
  await writeFile(target,html);
}
console.log(JSON.stringify({outputs:targets,models:assets.records.models.length,clips:assets.records.models.reduce((n,m)=>n+m.clips.length,0),weapons:assets.records.weapons.length,bytes:Buffer.byteLength(html),offline:true},null,2));
