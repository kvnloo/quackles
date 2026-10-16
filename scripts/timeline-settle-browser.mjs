import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve();
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready=true]');
  const result=await page.evaluate(async()=>{
    const range=document.querySelector('[data-timeline-range]'),images=()=>[...document.querySelectorAll('.tl-state-artifact img')].map(i=>i.src);
    const before=images();let frames=0;
    await new Promise(resolve=>{function tick(){range.value=range.min;range.dispatchEvent(new Event('input',{bubbles:true}));if(++frames<36)requestAnimationFrame(tick);else requestAnimationFrame(resolve);}requestAnimationFrame(tick);});
    return {before,during:images(),caption:document.querySelector('[data-timeline-caption]').textContent};
  });
  assert.match(result.caption,/blue.*v0/i);
  assert.deepEqual(result.during,result.before,'medium images must not swap during continuous input, including repeated artifact positions');
  await page.waitForTimeout(250);
  assert.notDeepEqual(await page.locator('.tl-state-artifact img').evaluateAll(nodes=>nodes.map(i=>i.src)),result.before);
  console.log('Canvas feedback remains immediate while medium-image publication settles PASS');
} finally {await browser.close();await server.close();}
