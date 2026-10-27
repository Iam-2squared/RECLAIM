import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {BOSS_CLIPS,validateBossGlb} from './boss-asset-package.mjs';

export const SAPPORO_BOSS_IDS=Object.freeze(['spider','snowblower']);
const sources=Object.freeze([['spider','電纏蜘蛛','小ボス',3],['snowblower','氷路開拓機','中ボス',4]]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Use the animated exports belonging to the user's original Blender assets. */
export async function syncSapporoBossAssets(workspace,publicDirectory){
  const directory=resolve(publicDirectory,'sapporo-bosses');await mkdir(directory,{recursive:true});const models=[];
  for(const [id,name,rank,phase] of sources){
    const sourceDirectory=resolve(workspace,'motion/characters',name),meta=JSON.parse(await readFile(resolve(sourceDirectory,'animation.json'),'utf8'));
    const record=meta.files.find(file=>file.path===`${name}_animated.glb`),blend=meta.files.find(file=>file.path===`${name}_animated.blend`);
    if(meta.asset_id!==id||meta.city!=='札幌'||!record||!blend||!meta.source_original_preserved)throw Error(`Invalid Sapporo boss source metadata: ${id}`);
    const source=resolve(sourceDirectory,record.path),bytes=await readFile(source);
    if(bytes.length!==record.bytes||sha(bytes)!==record.sha256)throw Error(`Sapporo boss source hash differs: ${id}`);
    validateBossGlb(bytes,id);await copyFile(source,resolve(directory,`${id}.glb`));
    models.push({id,name,rank,phase,file:`${id}.glb`,bytes:bytes.length,sha256:record.sha256,clips:[...BOSS_CLIPS],source:`motion/characters/${name}/${record.path}`,animatedBlender:`motion/characters/${name}/${blend.path}`,originalBlender:`character/ボス/札幌/${name}/${name}.blend`,front:'+Z',units:'metres'});
  }
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify({version:1,city:'札幌',models},null,2)+'\n');return models;
}

export async function collectSapporoBossAssets(publicDirectory){
  const directory=resolve(publicDirectory,'sapporo-bosses'),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
  if(manifest.city!=='札幌'||!Array.isArray(manifest.models)||manifest.models.length!==2||new Set(manifest.models.map(m=>m.id)).size!==2||manifest.models.some(m=>!SAPPORO_BOSS_IDS.includes(m.id)))throw Error('Incomplete Sapporo boss manifest');
  const payload={},records=[];
  for(const id of SAPPORO_BOSS_IDS){
    const model=manifest.models.find(m=>m.id===id);if(model.file!==`${id}.glb`)throw Error(`Unexpected Sapporo boss filename: ${id}`);
    const bytes=await readFile(resolve(directory,model.file));if(bytes.length!==model.bytes||sha(bytes)!==model.sha256)throw Error(`Sapporo boss asset hash differs: ${id}`);
    validateBossGlb(bytes,id);payload[id]=bytes.toString('base64');records.push({id,file:model.file,bytes:model.bytes,sha256:model.sha256,clips:[...BOSS_CLIPS],rank:model.rank,phase:model.phase});
  }
  return{payload,records};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const repo=resolve(import.meta.dirname,'..');console.log(JSON.stringify(await syncSapporoBossAssets(resolve(repo,'..'),resolve(repo,'public')),null,2));}
