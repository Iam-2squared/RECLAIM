import './authored-map.css';

type EmbeddedMap = { htmlGzipBase64: string; previewUrl: string };
type MapWindow = Window & { __terrainSnapshot?: () => { renderCount: number; contextLost: boolean } };
let embeddedCache: EmbeddedMap | null | undefined;

function embeddedMap(): EmbeddedMap | null {
  if(embeddedCache!==undefined)return embeddedCache;
  const node=document.getElementById('reclaim-authored-map');
  if(!node){embeddedCache=null;return null;}
  try {
    const value=JSON.parse(node.textContent??'') as Partial<EmbeddedMap>;
    embeddedCache=typeof value.htmlGzipBase64==='string'&&typeof value.previewUrl==='string'?value as EmbeddedMap:null;
  }catch{embeddedCache=null;}
  return embeddedCache;
}

async function embeddedHtml(data: EmbeddedMap): Promise<string> {
  if(typeof DecompressionStream!=='function')throw new Error('新しいChromeまたはEdgeで開いてください。');
  const binary=atob(data.htmlGzipBase64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** The authored map is loaded only on request and released when its dialog closes. */
export function mountAuthoredMap(host: HTMLElement,onDeploy:()=>void): void {
  const section=document.createElement('section');section.className='authored-map-card';
  section.setAttribute('aria-label','知床の新しい3Dマップ');
  section.innerHTML=`<div class="authored-map-heading"><span>SHIRETOKO / 3D MAP</span><strong>知床の新しいマップ</strong></div><button class="primary-action authored-map-deploy" type="button">このマップに出撃</button><img class="authored-map-preview" alt="岬、湿原、湖、山道が広がる知床マップの俯瞰" width="1280" height="720"><p>始まりの家から庭へ。新しい土道・木道・山道・廃倉庫を実際に歩いて探索できます。</p><button class="secondary-action authored-map-open" type="button">3Dマップを見渡す</button><small>全体表示はドラッグで回転・ホイールで拡大。出撃するとWASDとマウスで探索できます。</small>`;
  const preview=section.querySelector<HTMLImageElement>('img')!;
  preview.src=embeddedMap()?.previewUrl??`${import.meta.env.BASE_URL}home-map/overview.webp`;
  section.querySelector<HTMLButtonElement>('.authored-map-deploy')!.addEventListener('click',onDeploy);
  const button=section.querySelector<HTMLButtonElement>('.authored-map-open')!;
  button.addEventListener('click',()=>openViewer(button,onDeploy));
  host.prepend(section);
}

function openViewer(opener: HTMLButtonElement,onDeploy:()=>void): void {
  if(document.getElementById('authored-map-dialog'))return;
  const dialog=document.createElement('dialog');dialog.id='authored-map-dialog';dialog.className='authored-map-dialog';
  dialog.setAttribute('aria-labelledby','authored-map-title');dialog.dataset.authoredMapState='loading';
  dialog.innerHTML=`<header class="authored-map-toolbar"><div><span>SHIRETOKO / AUTHORED MAP</span><h2 id="authored-map-title">知床</h2></div><p>家・庭・道・廃倉庫を探索</p><button class="primary-action" id="authored-map-deploy" type="button">このマップに出撃</button><button class="secondary-action" id="authored-map-close" type="button">閉じる</button></header><p class="authored-map-load" role="status">3Dマップを読み込み中…</p><iframe class="authored-map-frame" title="知床 高画質3Dマップ" allow="fullscreen"></iframe>`;
  document.body.append(dialog);
  const frame=dialog.querySelector<HTMLIFrameElement>('iframe')!,status=dialog.querySelector<HTMLElement>('[role="status"]')!;
  let closed=false,poll=0,viewerUrl:string|null=null;
  const ready=()=>{if(!closed){clearTimeout(poll);dialog.dataset.authoredMapState='ready';status.hidden=true;}};
  const message=(event:MessageEvent)=>{
    if(event.source===frame.contentWindow&&event.data?.type==='reclaim-authored-map-ready')ready();
  };
  window.addEventListener('message',message);
  const close=()=>{
    if(closed)return;closed=true;clearTimeout(poll);
    window.removeEventListener('message',message);
    frame.remove();dialog.remove();
    if(viewerUrl)URL.revokeObjectURL(viewerUrl);
    document.dispatchEvent(new Event('reclaim-map-visibility'));
    if(opener.isConnected)opener.focus({preventScroll:true});
  };
  dialog.addEventListener('close',close,{once:true});
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
  dialog.querySelector('#authored-map-close')!.addEventListener('click',()=>dialog.close());
  dialog.querySelector('#authored-map-deploy')!.addEventListener('click',()=>{dialog.close();onDeploy();});
  const inspect=()=>{
    if(closed)return;
    try {
      const snapshot=(frame.contentWindow as MapWindow|null)?.__terrainSnapshot?.();
      if(snapshot&&snapshot.renderCount>0&&!snapshot.contextLost){ready();return;}
      const error=frame.contentDocument?.getElementById('message-text');
      if(error?.textContent?.includes('できません')){dialog.dataset.authoredMapState='error';status.textContent=error.textContent;return;}
    }catch{/* The source viewer continues to display its own loading state. */}
    poll=window.setTimeout(inspect,300);
  };
  frame.addEventListener('load',()=>{clearTimeout(poll);inspect();});
  dialog.showModal();
  document.dispatchEvent(new Event('reclaim-map-visibility'));
  dialog.querySelector<HTMLButtonElement>('#authored-map-close')!.focus();
  const embedded=embeddedMap();
  if(embedded)void embeddedHtml(embedded).then(html=>{
    if(closed)return;
    // Keep the full map out of DOM attributes; large srcdoc strings make frame
    // inspection and accessibility traversal unnecessarily expensive.
    // file:// Blob frames may have an opaque origin. A message from this exact
    // child window reports readiness without relying on cross-origin DOM reads.
    const bridge=`<script>(()=>{const check=()=>{const s=window.__terrainSnapshot?.();if(s?.renderCount>0&&!s.contextLost)parent.postMessage({type:'reclaim-authored-map-ready'},'*');else setTimeout(check,300)};check()})();</script>`;
    viewerUrl=URL.createObjectURL(new Blob([html,bridge],{type:'text/html;charset=utf-8'}));
    frame.src=viewerUrl;
  }).catch(error=>{
    if(closed)return;dialog.dataset.authoredMapState='error';status.textContent=`マップを読み込めませんでした。${error instanceof Error?error.message:''}`;
  });
  else frame.src=`${import.meta.env.BASE_URL}home-map/shiretoko.html`;
}
