import { expect } from '@playwright/test';
export const snapshot = page => page.evaluate(() => window.__RECLAIM__.snapshot());
export const rects = page => page.evaluate(() => {
 const rect = e => { if(!e?.getClientRects().length)return null; const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
 const selectors = ['#home-nav','#nav-items','#back-title','.home-footnote','.launch-area','#start-button','#lobby-stage','#home-panel','.panel-header','#panel-content','#panel-footer','#panel-close','#campaign-map'];
 return Object.fromEntries(selectors.map(s=>[s,rect(document.querySelector(s))]));
});
export const intersects = (a,b) => Boolean(a&&b&&Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5);
export function contained(inner,outer){expect(inner).not.toBeNull();expect(outer).not.toBeNull();expect(inner.x).toBeGreaterThanOrEqual(outer.x-1);expect(inner.y).toBeGreaterThanOrEqual(outer.y-1);expect(inner.right).toBeLessThanOrEqual(outer.right+1);expect(inner.bottom).toBeLessThanOrEqual(outer.bottom+1);}
export async function fourFits(page) {
 const menus=(await snapshot(page)).menus;
 if(menus?.mode==='reference-2d'||menus?.mode==='mobile-reference-2d'){
  await expect(page.locator('#home-screen .reference-backplate')).toBeVisible();
  await expect(page.locator('#squad-button')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.sample-label:visible')).toHaveCount(3);
  const frame=await page.locator('#home-screen').boundingBox(),outer={x:frame.x,y:frame.y,right:frame.x+frame.width,bottom:frame.y+frame.height};
  const samples=await page.locator('.sample-label:visible').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const sample of samples)contained(sample,outer);
  for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++)expect(intersects(samples[i],samples[j])).toBe(false);
  // Mobile has intentional vertical scrolling; verify the real action is reachable.
  if(menus.mode==='mobile-reference-2d')await page.locator('#start-button').scrollIntoViewIfNeeded();
  await expect(page.locator('#start-button')).toBeInViewport({ratio:1});
  // info.render.calls describes the LAST Three frame, which may belong to the
  // unchanged narrow layout. The actual frame counter must not advance here.
  const frameCount=(await snapshot(page)).renderClock.rendererFrames;
  await page.waitForTimeout(50);
  expect((await snapshot(page)).renderClock.rendererFrames).toBe(frameCount);
  return;
 }
 await expect(page.locator('body')).toHaveAttribute('data-renderer','webgl');
 let coherent;
 await expect.poll(async()=>{
  // Take a coherent DOM/render sample; a toolbar resize can span several frames.
  coherent = await page.evaluate(()=>{
   const r=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
   const stage=r(document.querySelector('#lobby-stage')),s=window.__RECLAIM__.snapshot().render,fit=s.stage;
   const labels=[...document.querySelectorAll('.survivor-label')].filter(n=>!n.hidden).map(r);
   const obstacles=['.home-footnote','.launch-area','.lobby-heading','.squad-tools'].map(q=>document.querySelector(q)).filter(n=>n.getClientRects().length).map(r);
   const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
   const fits=s.homeCamera&&Math.abs(fit.left-stage.x)<1&&Math.abs(fit.top-stage.y)<1&&Math.abs(fit.width-stage.width)<1&&Math.abs(fit.height-stage.height)<1&&s.formation.filter(s=>s.visible).length===4&&s.bounds.length===4&&s.bounds.every(b=>b.left>=stage.x-1&&b.right<=stage.right+1&&b.top>=stage.y-1&&b.bottom<=stage.bottom+1&&obstacles.every(o=>!overlap({x:b.left,y:b.top,right:b.right,bottom:b.bottom},o)))&&labels.length===4&&labels.every(b=>b.x>=stage.x-1&&b.right<=stage.right+1&&b.y>=stage.y-1&&b.bottom<=stage.bottom+1)&&labels.every((a,i)=>labels.slice(i+1).every(b=>!overlap(a,b))&&obstacles.every(b=>!overlap(a,b)));
   return {fits,stage,labels,obstacles};
  });
  return coherent.fits;
 }).toBe(true);
 const {stage,labels,obstacles}=coherent;
 expect(labels).toHaveLength(4);
 for(const label of labels)contained(label,stage);
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)expect(intersects(labels[i],labels[j])).toBe(false);
 for(const label of labels)for(const obstacle of obstacles)expect(intersects(label,obstacle)).toBe(false);
}
export async function sheetFits(page) {
 const view=page.viewportSize(),r=await rects(page),viewport={x:0,y:0,right:view.width,bottom:view.height};
 contained(r['#home-panel'],viewport);contained(r['#panel-close'],r['#home-panel']);
 expect(r['#home-panel'].width/view.width).toBeGreaterThan(.85);
 expect(r['#home-panel'].height/view.height).toBeGreaterThan(.85);
 expect(r['#panel-content'].height).toBeGreaterThanOrEqual(view.height<440?140:300);
 expect(intersects(r['.panel-header'],r['#panel-content'])).toBe(false);
 expect(intersects(r['#panel-footer'],r['#panel-content'])).toBe(false);
 await expect(page.locator('#home-panel')).toHaveAttribute('aria-modal','true');
 await expect(page.locator('#start-button')).toBeDisabled();
 expect(await page.locator('#panel-title').evaluate(n=>{const r=n.getBoundingClientRect();return document.querySelector('#home-panel').contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 expect(await page.locator('#home-nav').evaluate(n=>n.inert&&n.getAttribute('aria-hidden')==='true')).toBe(true);
}
export async function scrollEnd(page) {
 await page.locator('#panel-content').evaluate(n=>{n.scrollTop=n.scrollHeight;});
 const end=await page.locator('#panel-content').evaluate(n=>({remaining:n.scrollHeight-n.clientHeight-n.scrollTop,body:n.getBoundingClientRect().bottom,last:n.lastElementChild?.getBoundingClientRect().bottom,overflow:getComputedStyle(n.parentElement).overflow}));
 expect(end.remaining).toBeLessThanOrEqual(1);expect(end.last).toBeLessThanOrEqual(end.body+1);expect(end.overflow).toBe('hidden');
 await expect(page.locator('#panel-close')).toBeInViewport({ratio:1});
}
