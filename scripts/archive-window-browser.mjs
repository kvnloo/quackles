import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve({directory:process.env.OUT_DIR||'out'});
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
const results=[];
try {
 for(const width of [390,780,1440]) {
  const page=await browser.newPage({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});
  await page.waitForSelector('[data-ready="true"]');
  await page.locator('#lineage-viewport').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const count=await page.locator('.lineage-card').count();
  assert.ok(count<=40,`bounded archive paint tree: got ${count} cards`);
  assert.equal(await page.locator('.lineage-accessible a').count(),665,'complete semantic archive');
  const ax=await (await page.context().newCDPSession(page)).send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes.some(n=>!n.ignored&&n.name?.value?.includes('white / v0 ·')),'semantic archive is exposed to assistive technology');
  const rects=await page.locator('.lineage-card').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(a.x+a.w<=b.x+.1||b.x+b.w<=a.x+.1||a.y+a.h<=b.y+.1||b.y+b.h<=a.y+.1,'no overlapping archive slots');}
  if(width===390){const cdp=await page.context().newCDPSession(page),box=await page.locator('#lineage-viewport').boundingBox(),x=box.x+box.width/2,y=Math.max(0,box.y)+300;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let n=1;n<=6;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-n*35}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);assert.ok(await page.locator('#lineage-viewport').evaluate(e=>e.scrollTop)>0,'native touch scroll works');}
  await page.locator('#lineage-viewport').focus();await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'664');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'0');
  await page.keyboard.press('Enter');await page.waitForSelector('dialog[open]');await page.keyboard.press('Escape');
  await page.locator('#lineage-theme').selectOption('day');
  await page.locator('#lineage-viewport').focus();await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'day/v330');
  await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'day/v0');
  await page.locator('#lineage-reset').click();
  await page.locator('#lineage-viewport').evaluate(e=>e.scrollTop=5760);await page.waitForTimeout(300);
  const state=await page.locator('#lineage-viewport').evaluate(e=>({top:e.scrollTop,cards:[...e.querySelectorAll('.lineage-card')].filter(n=>!n.hidden).map(n=>({index:+n.dataset.index,top:n.getBoundingClientRect().top-e.getBoundingClientRect().top,height:n.getBoundingClientRect().height}))}));
  assert.ok(state.cards.some(c=>c.top>=0&&c.top<500),'real visible recycled rows');
  assert.ok(await page.locator('.lineage-card').count()<=40);
  assert.deepEqual(errors,[]);results.push({width,count,state,errors});await page.close();
 }
 if(process.env.ARTIFACTS){await mkdir(process.env.ARTIFACTS,{recursive:true});await writeFile(process.env.ARTIFACTS+'/archive-window.json',JSON.stringify(results,null,2));}
 console.log('PASS bounded archive, all accessible versions, keyboard and filtered End/Home',JSON.stringify(results));
} finally {await browser.close();await server.close();}
