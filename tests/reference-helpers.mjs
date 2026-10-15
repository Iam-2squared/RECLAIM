import {expect} from '@playwright/test';
export const referenceMode=async page=>(await page.evaluate(()=>window.__RECLAIM__.snapshot())).menus?.mode==='reference-2d';
export async function referenceReady(page){
 await expect(page.locator('body')).toHaveAttribute('data-menu-presentation','reference-2d');
 await page.locator('.reference-backplate').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
}
export async function compareReference(page,screen,path){
 await referenceReady(page);await page.mouse.move(1000,120);
 const png=await page.screenshot({path});
 return page.evaluate(async({screen,png})=>{
  const image=document.querySelector(`#${screen}-screen .reference-backplate`),actual=new Image();actual.src=png;await actual.decode();
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=864;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);
  const expected=c.getImageData(0,0,1536,864).data;c.clearRect(0,0,1536,864);c.drawImage(actual,0,0);
  const observed=c.getImageData(0,0,1536,864).data;let maxChannelError=0,total=0,differentPixels=0,overOnePixels=0;
  for(let i=0;i<expected.length;i+=4){let changed=false,over=false;for(let j=0;j<3;j++){const d=Math.abs(expected[i+j]-observed[i+j]);total+=d;maxChannelError=Math.max(maxChannelError,d);changed ||= d>0;over ||= d>1;}if(changed)differentPixels++;if(over)overOnePixels++;}
  return {screen,width:1536,height:864,totalPixels:1536*864,differentPixels,overOnePixels,maxChannelError,meanAbsoluteChannelError:total/(1536*864*3),snapshot:window.__RECLAIM__.snapshot()};
 },{screen,png:'data:image/png;base64,'+png.toString('base64')});
}
