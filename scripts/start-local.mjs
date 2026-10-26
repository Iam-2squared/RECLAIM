import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,closeSync,existsSync,mkdirSync,openSync,readFileSync} from 'node:fs';
import {get} from 'node:http';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const address='http://127.0.0.1:4177/';
const noOpen=process.argv.includes('--no-open');
const logDirectory=resolve(root,'release/local-server');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=milliseconds=>new Promise(done=>setTimeout(done,milliseconds));

function probe(expectedHash){
 return new Promise(done=>{
  let settled=false;
  const finish=result=>{if(settled)return;settled=true;done(result);};
  const request=get(address,{agent:false,headers:{'Cache-Control':'no-cache'}},response=>{
   const chunks=[];let size=0;
   if(response.statusCode!==200){response.resume();finish({kind:'occupied'});return;}
   response.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){finish({kind:'occupied'});response.destroy();}else chunks.push(chunk);});
   response.on('end',()=>finish({kind:hash(Buffer.concat(chunks))===expectedHash?'game':'occupied'}));
   response.on('error',()=>finish({kind:'occupied'}));
  });
  request.setTimeout(1000,()=>{finish({kind:'occupied'});request.destroy();});
  request.on('error',error=>finish({kind:error.code==='ECONNREFUSED'?'free':'occupied'}));
 });
}

function startPreview(){
 const vite=resolve(root,'node_modules/vite/bin/vite.js');
 if(!existsSync(vite))throw Error('Viteが見つかりません。repoフォルダーでnpm ciを実行してください。');
 mkdirSync(logDirectory,{recursive:true});
 const log=openSync(resolve(logDirectory,'server.log'),'a');
 let child;
 try{child=spawn(process.execPath,[vite,'preview','--host','127.0.0.1','--port','4177','--strictPort'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NO_COLOR:'1'}});}
 finally{closeSync(log);}
 child.unref();return child;
}

async function openBrowser(){
 const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
 const arguments_=process.platform==='win32'?['url.dll,FileProtocolHandler',address]:[address];
 await new Promise((done,fail)=>{const child=spawn(command,arguments_,{detached:true,windowsHide:true,stdio:'ignore'});child.once('error',fail);child.once('spawn',()=>{child.unref();done();});});
}

async function showError(message){
 if(noOpen||process.platform!=='win32')return;
 const code='Add-Type -AssemblyName System.Windows.Forms;[void][System.Windows.Forms.MessageBox]::Show($env:RECLAIM_LOCAL_ERROR,"RECLAIM",0,16)';
 await new Promise(done=>{const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],{windowsHide:true,stdio:'ignore',env:{...process.env,RECLAIM_LOCAL_ERROR:message}});child.once('error',done);child.once('exit',done);});
}

async function main(){
 const index=resolve(root,'dist/index.html');
 if(!existsSync(index))throw Error('配信用ファイルが見つかりません。repoフォルダーでnpm run buildを実行してから開いてください。');
 const expectedHash=hash(readFileSync(index)),current=await probe(expectedHash);
 if(current.kind==='occupied')throw Error('ポート4177は別のアプリ、または別の版のRECLAIMが使用中です。そのアプリを終了してから、もう一度開いてください。');
 let pid=null;
 if(current.kind==='free'){
  const child=startPreview();pid=child.pid;let spawnError=null,exited=false;
  child.once('error',error=>{spawnError=error;});child.once('exit',()=>{exited=true;});
  const deadline=Date.now()+15000;
  for(;;){
   if(spawnError)throw Error(`ローカルサーバーを起動できませんでした。${spawnError.message}`);
   const state=await probe(expectedHash);if(state.kind==='game')break;
   if(state.kind==='occupied')throw Error('ポート4177で別のアプリが応答しました。ほかのアプリを終了してから、もう一度開いてください。');
   if(exited||Date.now()>=deadline)throw Error(`ローカルサーバーを準備できませんでした。ログ: ${resolve(logDirectory,'server.log')}`);
   await delay(120);
  }
 }
 if(!noOpen)await openBrowser();
 console.log(JSON.stringify({url:address,reused:current.kind==='game',opened:!noOpen,pid}));
}

main().catch(async error=>{
 const message=error instanceof Error?error.message:String(error);console.error(message);process.exitCode=1;
 try{mkdirSync(logDirectory,{recursive:true});appendFileSync(resolve(logDirectory,'launcher-error.log'),`${new Date().toISOString()} ${message}\n`);}catch{}
 await showError(message);
});
