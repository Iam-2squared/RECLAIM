import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('the published atlas is a real, responsive, read-only route independent of the campaign', async ({page}) => {
  await page.addInitScript(() => {
    window.__atlasStorageOperations = [];
    for (const name of ['getItem','setItem','removeItem','clear']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (...args) {
        window.__atlasStorageOperations.push(name);
        return original.apply(this,args);
      };
    }
  });
  const errors=[], external=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>{
    const url=request.url();
    if (/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:4173/')) external.push(url);
  });
  const response=await page.goto('/reviews/japan-catalog.html');
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/JAPAN FIELD ATLAS/);
  await expect(page.locator('#prefectures > li.card')).toHaveCount(47);
  await expect(page.locator('#catalog-total')).toHaveText('47');
  await expect(page.locator('#terrain-count')).toHaveText('00');
  await expect(page.locator('#explorable-count')).toHaveText('00');
  await expect(page.locator('#local-count')).toHaveText('01');
  await page.getByRole('button',{name:'北海道',exact:true}).click();
  await expect(page.locator('#prefectures > li.card')).toHaveCount(1);
  await expect(page.locator('#prefectures > li.card')).toContainText('県全域ではありません');
  await page.getByRole('button',{name:'関東',exact:true}).click();
  await expect(page.locator('#prefectures > li.card')).toHaveCount(7);
  await page.getByRole('searchbox',{name:'都道府県を検索'}).fill('東京都');
  await expect(page.locator('#prefectures > li.card')).toHaveCount(1);
  await expect(page.locator('#prefectures > li.card')).toContainText('東京都');
  await page.getByRole('searchbox',{name:'都道府県を検索'}).fill('存在しない');
  await expect(page.locator('#prefectures > li.empty')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'都道府県を検索'}).clear();
  await page.getByRole('button',{name:'全域',exact:true}).click();
  await expect(page.locator('#prefectures > li.card')).toHaveCount(47);
  await mkdir('release/japan-gallery-review',{recursive:true});
  await page.screenshot({path:'release/japan-gallery-review/desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await expect(page.locator('#prefectures > li.card')).toHaveCount(47);
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({path:'release/japan-gallery-review/mobile.png',fullPage:true});
  expect(await page.evaluate(()=>window.__atlasStorageOperations)).toEqual([]);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
