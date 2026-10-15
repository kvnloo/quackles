import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve();
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});
  await page.waitForSelector('[data-ready="true"]');
  assert.equal(await page.locator('.lineage-section').count(),Math.ceil(665/4),'two-row chunks bound reveal work');
  assert.equal(await page.locator('.lineage-card').count(),665);
  assert.ok(await page.locator('.lineage-section').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).contain==='strict' && n.children.length<=30)));
  assert.ok(await page.locator('.lineage-section').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).contentVisibility==='auto')), 'offscreen sections skip rendering');
  assert.ok(await page.locator('.lineage-card').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).transform==='none' && getComputedStyle(n).willChange==='auto')), 'cards must not own transform/compositing layers');
  for(const width of [390,780,1440]) {
    await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
    const geometry=await page.locator('.lineage-card').evaluateAll(nodes=>nodes.slice(0,35).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++) {
      const a=geometry[i],b=geometry[j];assert.ok(a.x+a.w<=b.x+.1||b.x+b.w<=a.x+.1||a.y+a.h<=b.y+.1||b.y+b.h<=a.y+.1,'cards must not overlap');
    }
  }
  await page.locator('#lineage-viewport').focus();await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),await page.locator('.lineage-card').last().getAttribute('data-id'));
  console.log('Native chunk culling, retained keyboard targets and responsive geometry PASS');
} finally {await browser.close();await server.close();}
