/** Local evidence runner. Does not push, deploy, modify saves, or contact APIs. */
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),baselineHtml=process.argv[2]?resolve(process.argv[2]):null,out=resolve(process.argv[3]??'release/shiretoko-phase1-review/v3-run');
await mkdir(resolve(out,'logs'),{recursive:true});
const records=[],source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
async function run(name,command,args){
 console.log(`Checking ${name}`);let stdout='',stderr='';const started=Date.now();
 const child=spawn(command,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 await writeFile(resolve(out,'logs',`${name}.log`),`${command} ${args.join(' ')}\n\n${stdout}\n--- stderr ---\n${stderr}`);
 records.push({name,command:[command,...args],exitCode:code,durationMs:Date.now()-started});
 await writeFile(resolve(out,'run.json'),JSON.stringify({source,records},null,2));
 if(code!==0)throw new Error(`${name} failed (${code}); see ${resolve(out,'logs',`${name}.log`)}`);
 console.log(`${name}: PASS (${((Date.now()-started)/1000).toFixed(1)}s)`);
}
await run('typecheck','npm',['run','typecheck']);
await run('node-tests','npm',['test']);
await run('build','npm',['run','build']);
await run('blender-tool-tests','npm',['run','test:blender']);
await run('package','node',['scripts/package-shiretoko-terrain.mjs']);
await run('scope','node',['scripts/audit-shiretoko-scope.mjs',resolve(out,'scope.json')]);
await run('browser-terrain','node',['scripts/verify-shiretoko-terrain.mjs']);
await run('browser-intro','node',['scripts/verify-shiretoko-intro.mjs']);
await run('browser-v3','node',['scripts/verify-shiretoko-v3.mjs',resolve(out,'extended')]);
await run('geometry-metrics','node',['scripts/report-shiretoko-v3.mjs',resolve(out,'metrics')]);
await run('captures-v3','node',['scripts/compare-shiretoko-terrain.mjs','release/RECLAIM_Shiretoko_Terrain_Phase1.html',resolve(out,'comparison/v3')]);
if(baselineHtml){
 await run('captures-v2','node',['scripts/compare-shiretoko-terrain.mjs',baselineHtml,resolve(out,'comparison/v2')]);
 await run('compare-pairs','node',['scripts/diff-shiretoko-captures.mjs',resolve(out,'comparison')]);
}
console.log(JSON.stringify({source,checks:records.length,out,baselineProvided:Boolean(baselineHtml)},null,2));
