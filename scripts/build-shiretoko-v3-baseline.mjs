/** Build the actual immutable v3 ancestor, with identical existing dependencies. */
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,lstat,readlink,unlink,symlink,stat,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),source='d8cbf4169f3f4d63708e63f860984eea865f43b8',base=resolve(root,'release/shiretoko-v3-source'),out=resolve(process.argv[2]??'release/shiretoko-phase1-review/v4/baseline');
await mkdir(resolve(root,'release'),{recursive:true});
try{await stat(resolve(base,'.git'));}catch{execFileSync('git',['worktree','add','--detach',base,source],{cwd:root,stdio:'pipe'});}
// Node resolves the existing dependency directory through the ancestor root.
// A node_modules symlink is not ignored by the v3 node_modules/ rule and would
// incorrectly mark the baseline package dirty. Remove only our own known link.
const dependencyLink=resolve(base,'node_modules');
try{const s=await lstat(dependencyLink);if(s.isSymbolicLink()&&await readlink(dependencyLink)===resolve(root,'node_modules'))await unlink(dependencyLink);else if(!s.isDirectory())throw new Error('Unexpected baseline dependency entry');}catch(e){if(e.code!=='ENOENT')throw e;}
// The v3 packager reads a literal node_modules/three/LICENSE path. Keep an
// ignored real directory, linking only the existing unchanged Three package.
await mkdir(dependencyLink,{recursive:true});
try{await stat(resolve(dependencyLink,'three'));}catch{await symlink(resolve(root,'node_modules/three'),resolve(dependencyLink,'three'),'dir');}
const git=(...a)=>execFileSync('git',a,{cwd:base,encoding:'utf8'}).trim();assert.equal(git('rev-parse','HEAD'),source);assert.equal(git('status','--porcelain'),'');
execFileSync('node',['scripts/package-shiretoko-terrain.mjs'],{cwd:base,stdio:'pipe'});
await mkdir(out,{recursive:true});const files=[];
for(const [file,name,expected]of [['RECLAIM_Shiretoko_Terrain_Phase1.html','RECLAIM_Shiretoko_Terrain_Phase1_v3.html','b96f4def99e04c34e63f82dc49cf455a81b03aa40145f22b08535fce3f8e9bb6'],['RECLAIM_Shiretoko_Intro_Demo.html','RECLAIM_Shiretoko_Intro_Demo_v3.html','fc5d89cbd5c8cdc00d33f97f5f544b24fd3fdbe5954bbea337104bc6c4a69379']]){
 const path=resolve(base,'release',file),data=await readFile(path),sha256=createHash('sha256').update(data).digest('hex');assert.equal(sha256,expected);await copyFile(path,resolve(out,name));files.push({file:name,bytes:data.length,sha256});
}
await writeFile(resolve(out,'source.json'),JSON.stringify({source,tree:git('rev-parse','HEAD^{tree}'),workingTree:'clean',files,note:'Exact v3 ancestor built in a detached local worktree using unchanged pinned dependencies; source is not distributed in review archives.'},null,2));
console.log(JSON.stringify({source,out,files}));
