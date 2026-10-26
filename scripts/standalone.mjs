import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { collectMissionAssets } from './mission-asset-package.mjs';
import { collectAuthoredMapAssets } from './authored-map-package.mjs';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
let html=await readFile(resolve(dist,'index.html'),'utf8');
const script=html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const css=html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if(!script||!css)throw new Error('Unexpected Vite output: cannot safely inline assets.');
const js=await readFile(resolve(dist,script[1]),'utf8'),styles=await readFile(resolve(dist,css[1]),'utf8');
html=html.replace(script[0],()=>`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`).replace(css[0],()=>`<style>${styles}</style>`);
// Keep the normal Vite bundle small. Only standalone previews carry model bytes.
// GLTFLoader.parseAsync can consume these on file:// without fetching side files.
const modelManifest=JSON.parse(await readFile(resolve(dist,'home-models/manifest.json'),'utf8'));
const embeddedModels={},packagedModels=[];
for(const id of ['jonesy','ramirez']){
 const model=modelManifest.models?.find(model=>model.id===id);
 if(!model||model.file!==`${id}.glb`)throw new Error(`Missing HOME model manifest: ${id}`);
 const bytes=await readFile(resolve(dist,'home-models',model.file));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==model.runtimeSha256)throw new Error(`HOME model hash differs from manifest: ${id}`);
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw new Error(`Invalid HOME GLB: ${id}`);
 const jsonEnd=20+bytes.readUInt32LE(12);
 if(jsonEnd>bytes.length)throw new Error(`Truncated HOME GLB: ${id}`);
 const gltf=JSON.parse(bytes.subarray(20,jsonEnd).toString('utf8'));
 if(!gltf.animations?.some(clip=>clip.name==='Idle'&&clip.channels?.length))throw new Error(`HOME model lacks authored Idle animation: ${id}`);
 if([...(gltf.buffers??[]),...(gltf.images??[])].some(asset=>asset.uri&&!asset.uri.startsWith('data:')))throw new Error(`HOME GLB requires an external asset: ${id}`);
 embeddedModels[id]=bytes.toString('base64');
 packagedModels.push({id,file:model.file,bytes:bytes.length,sha256});
}
const modelData=`<script type="application/json" id="reclaim-home-models">${JSON.stringify(embeddedModels).replaceAll('<','\\u003c')}</script>`;
html=html.replace('<script type="module">',()=>`${modelData}\n<script type="module">`);
// Character motion and held weapons must also work when this HTML is opened
// directly from Explorer. Only this artifact carries the four gameplay GLBs. Developer-only models stay separate.
const missionAssets=await collectMissionAssets(dist,{includeDevModels:false});
const missionData=`<script type="application/json" id="reclaim-mission-assets">${JSON.stringify(missionAssets.payload).replaceAll('<','\\u003c')}</script>`;
html=html.replace('<script type="module">',()=>`${missionData}\n<script type="module">`);
const authoredMap=await collectAuthoredMapAssets(dist);
const mapData=`<script type="application/json" id="reclaim-authored-map">${JSON.stringify(authoredMap.payload).replaceAll('<','\\u003c')}</script>`;
html=html.replace('<script type="module">',()=>`${mapData}\n<script type="module">`);
const license=await readFile(resolve(root,'node_modules/three/LICENSE'),'utf8');
const modelAttribution=await readFile(resolve(root,'public/home-models/ATTRIBUTION.md'),'utf8');
html=html.replace('</head>',()=>`<!-- HOME model attribution\n${modelAttribution.replaceAll('--','—')}-->\n</head>`);
const sourceCommit=process.env.RECLAIM_BUILD_SHA??execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const workingTree=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()?'dirty':'clean';
if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('Expected a full source commit SHA');
html=html.replace('</head>',()=>`<meta name="reclaim-source-commit" content="${sourceCommit}">\n<meta name="reclaim-working-tree" content="${workingTree}">\n<!-- Three.js MIT license\n${license.replaceAll('--','—')}-->\n</head>`);
html=html.replace('</head>',()=>`<script type="application/json" id="reclaim-home-model-manifest">${JSON.stringify({sourceCommit,models:packagedModels}).replaceAll('<','\\u003c')}</script>\n</head>`);
html=html.replace('</head>',()=>`<script type="application/json" id="reclaim-mission-asset-manifest">${JSON.stringify({sourceCommit,...missionAssets.records}).replaceAll('<','\\u003c')}</script>\n</head>`);
html=html.replace('</head>',()=>`<script type="application/json" id="reclaim-authored-map-manifest">${JSON.stringify({sourceCommit,...authoredMap.record}).replaceAll('<','\\u003c')}</script>\n</head>`);
await mkdir(resolve(root,'release'),{recursive:true});
await writeFile(resolve(root,'release/RECLAIM_World_Preview.html'),html);
await writeFile(resolve(root,'release/RECLAIM_PC_Menu_Preview.html'),html);
await writeFile(resolve(root,'release/RECLAIM_Mobile_Menu_Preview.html'),html);
await writeFile(resolve(root,'release/RECLAIM_Title_Preview.html'),html);
await writeFile(resolve(root,'release/RECLAIM_Home_Preview.html'),html);
await writeFile(resolve(root,'release/RECLAIM_Home_V2_Preview.html'),html);
await writeFile(resolve(root,'release/RECLAIM_Home_Lobby_Preview.html'),html.replace('</head>','<meta name="reclaim-initial-screen" content="home">\n</head>'));
await writeFile(resolve(root,'release/RECLAIM_Home_Playable.html'),html.replace('</head>','<meta name="reclaim-initial-screen" content="home">\n</head>'));
console.log(`Standalone world and HOME lobby: release/RECLAIM_World_Preview.html (source ${sourceCommit}; authored HOME motion, mission assets and lazy 3D map embedded; compatible aliases retained; no runtime CDN or API)`);
