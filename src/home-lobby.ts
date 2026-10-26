import './home-lobby.css';
import { HomeLobbyScene } from './home-lobby-scene';
import { homeBackdrop } from './home-regions';
import type { Home } from './home';
import type { CampaignStore } from './campaign/index';
import type { Preferences } from './state';

type Character = 'jonesy'|'ramirez';
const KEY = 'reclaim.lobby.v1';
const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id)! as T;
const text = (id:string,value:string) => { const node=el(id); if(node.textContent!==value)node.textContent=value; };

/** Local roster presentation. It never creates a network party or changes campaign progress. */
export class HomeLobby {
  readonly scene: HomeLobbyScene;
  readonly resizeObserver: ResizeObserver;
  character: Character = 'jonesy';
  region = 'shiretoko';
  active = false;
  private objectiveKey = '';
  private disposed = false;
  private readonly mapVisibility=()=>this.refresh(this.active);
  constructor(readonly home:Home, readonly campaign:CampaignStore, readonly preferences:()=>Preferences, readonly announce:(s:string)=>void) {
    let size = 4;
    try {
      const saved=JSON.parse(localStorage.getItem(KEY)??'null');
      if(saved?.character==='ramirez')this.character='ramirez';
      if(Number.isInteger(saved?.partySize)&&saved.partySize>=1&&saved.partySize<=4)size=saved.partySize;
    } catch { /* Defaults are usable when storage is blocked. */ }
    home.setPartySize(size as 1|2|3|4);
    this.scene=new HomeLobbyScene(el('lobby-stage'),{
      onLoad:()=>{ el('lobby-loading').hidden=true; this.positionLabels(); },
      onLayout:()=>this.positionLabels(),
      onError:()=>{ el('lobby-loading').hidden=false; text('lobby-loading','キャラクターを表示できませんでした。設定と出撃前の確認は引き続き操作できます。'); },
    });
    el<HTMLSelectElement>('home-character-select').value=this.character;
    el('home-character-select').addEventListener('change',()=>{
      this.character=el<HTMLSelectElement>('home-character-select').value==='ramirez'?'ramirez':'jonesy';
      this.persist(); this.refresh(this.active); this.announce(`${this.character==='jonesy'?'ジョンジー':'ラミレス'}をロビーに表示します。`);
    });
    for(let i=1;i<4;i++)el(`party-add-${i}`).addEventListener('click',()=>{home.setPartySize((i+1) as 2|3|4);this.persist();this.refresh(this.active);});
    for(const id of ['solo-button','squad-button'])el(id).addEventListener('click',()=>{this.persist();this.refresh(this.active);});
    el('home-lobby-tab').addEventListener('click',()=>{home.close(false);this.refresh(this.active);});
    el('reference-equipment').addEventListener('click',()=>home.open('weapons',el('reference-equipment')));
    el('reference-destination').addEventListener('click',()=>home.open('map',el('reference-destination')));
    el('panel-backdrop').addEventListener('click',()=>home.close());
    this.resizeObserver=new ResizeObserver(()=>this.positionLabels());
    this.resizeObserver.observe(el('lobby-stage'));
    document.addEventListener('reclaim-map-visibility',this.mapVisibility);
  }
  private persist() {
    try { localStorage.setItem(KEY,JSON.stringify({version:1,character:this.character,partySize:this.home.partySize})); }
    catch { this.announce('ロビーの設定を保存できませんでした。この画面では選択を維持します。'); }
  }
  refresh(active:boolean) {
    if(this.disposed)return;
    this.active=active;
    this.scene.setActive(active&&!document.getElementById('authored-map-dialog'));
    if(!active)return;
    const prefs=this.preferences();
    this.scene.setReducedMotion(prefs.reducedMotion);
    this.scene.setQuality(prefs.quality);
    this.scene.setCharacter(this.character);
    this.scene.setFormation(this.home.partySize);
    this.region=this.campaign.value.checkpoint?.areaId??'shiretoko';
    this.scene.setRegion(this.region);
    const backdrop=homeBackdrop(this.region);
    const screen=el('home-screen');screen.dataset.region=this.region;
    screen.style.setProperty('--lobby-sky',backdrop.sky);
    screen.style.setProperty('--lobby-deep',backdrop.deep);
    screen.style.setProperty('--lobby-image',backdrop.image?`url(${JSON.stringify(backdrop.image)})`:'none');
    text('lobby-region-name',backdrop.name);text('lobby-launch-region',backdrop.name);
    text('lobby-region-code',backdrop.code);text('lobby-region-caption',backdrop.code);text('lobby-news-region',backdrop.news);
    text('lobby-completed-count',String(this.campaign.value.completedAreaIds.length));
    text('lobby-party-count',this.home.partySize===1?'ソロ':`${this.home.partySize}人編成`);
    const objectives=[
      {title:'木造の家で目を覚ます',done:this.campaign.value.introStep>=1},
      {title:'ラジオの通信を聞く',done:this.campaign.value.introStep>=3},
      {title:'小型ドローンを退ける',done:this.campaign.value.droneDefeated},
    ];
    const key=JSON.stringify(objectives);
    if(key!==this.objectiveKey){this.objectiveKey=key;el('lobby-objectives').innerHTML=objectives.map(o=>`<li data-done="${o.done}">${o.title}<span>${o.done?'✓':'—'}</span></li>`).join('');}
    text('lobby-next-objective',objectives.find(o=>!o.done)?.title??'次の道へ、進もう。');
    el('home-lobby-tab').setAttribute('aria-current',this.home.panel?'false':'page');
    this.positionLabels();
  }
  positionLabels() {
    if(!this.scene||!this.active||this.disposed)return;
    const host=el('lobby-stage'),container=el('home-screen');
    const bounds=host.getBoundingClientRect(),parent=container.getBoundingClientRect();
    const slots=this.scene.anchors();
    const nav=el('home-nav').getBoundingClientRect();
    const tools=document.querySelector<HTMLElement>('.squad-tools')!.getBoundingClientRect();
    const centers=slots.map(slot=>bounds.left-parent.left+slot.x*bounds.width);
    slots.forEach((slot,index)=>{
      const label=this.home.labels[index];if(!label)return;
      label.hidden=!slot.active;
      const nearest=Math.min(...centers.filter((_,i)=>i!==index).map(x=>Math.abs(x-centers[index])));
      label.style.setProperty('--label-width',`${Math.max(42,Math.min(190,nearest-12))}px`);
      if(index>0){const name=label.querySelector('strong');if(name)name.textContent=slot.character.toUpperCase();}
      label.title=label.querySelector('strong')?.textContent??'';
      const size=label.getBoundingClientRect();
      const left=Math.max(size.width/2+8,Math.min(parent.width-size.width/2-8,centers[index]));
      let top=Math.max(nav.bottom-parent.top+8+size.height,bounds.top-parent.top+slot.headY*bounds.height-9);
      if(left+size.width/2>tools.left-parent.left&&left-size.width/2<tools.right-parent.left&&top>tools.top-parent.top&&top-size.height<tools.bottom-parent.top)top=tools.bottom-parent.top+8+size.height;
      label.style.left=`${left}px`;label.style.top=`${top}px`;
      if(index>0){const add=el(`party-add-${index}`);add.hidden=slot.active||Boolean(this.home.panel);add.style.left=`${centers[index]}px`;add.style.top=`${bounds.top-parent.top+(slot.headY+slot.footY)*.5*bounds.height}px`;}
    });
  }
  snapshot() { return {...this.scene.snapshot(),partySize:this.home.partySize,character:this.character,region:this.region}; }
  dispose() { this.disposed=true;document.removeEventListener('reclaim-map-visibility',this.mapVisibility);this.resizeObserver.disconnect();this.scene.dispose(); }
}
