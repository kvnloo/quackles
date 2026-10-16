import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve();
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
try {
  const page=await browser.newPage();
  await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready=true]');
  await page.waitForSelector('.tl-instrument[data-position]');
  const slider=page.getByRole('slider',{name:'Project time'});await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();await page.mouse.move(box.x+box.width-8,box.y+16);await page.mouse.down();
  const result=await page.evaluate(()=>{
    const range=document.querySelector('[data-timeline-range]'),before=[...document.querySelectorAll('.tl-state-artifact img')].map(i=>i.src);
    window.__timelineTape=true;
    function tick(){if(!window.__timelineTape)return;range.value=range.min;range.dispatchEvent(new Event('input',{bubbles:true}));requestAnimationFrame(tick);}requestAnimationFrame(tick);
    return {before};
  });
  await page.waitForFunction(()=>/blue.*v0/i.test(document.querySelector('[data-timeline-range]').getAttribute('aria-valuetext')));
  const screenshot=await page.locator('.tl-state-slot').first().screenshot();
  const grayRatio=Number(execFileSync('python3',['-c',"import io,sys;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB');pixels=list(im.crop((20,70,im.width-20,min(180,im.height-20))).get_flattened_data());print(sum(p==(227,227,222) for p in pixels)/len(pixels))"],{input:screenshot}).toString());
  assert.ok(grayRatio>.99,'the not-yet-preserved day slot must visibly clear during sustained drag, not retain the old scene');
  assert.deepEqual(await page.locator('.tl-state-artifact img').evaluateAll(nodes=>nodes.map(i=>i.src)),result.before,'medium images must not swap during continuous input; canvas supplies the live preview');
  await page.evaluate(()=>window.__timelineTape=false);await page.mouse.up();
  await page.waitForTimeout(250);
  assert.notDeepEqual(await page.locator('.tl-state-artifact img').evaluateAll(nodes=>nodes.map(i=>i.src)),result.before);
  const captionChanges=await page.evaluate(async()=>{
    const range=document.querySelector('[data-timeline-range]');let changes=0,frames=0;
    const observer=new MutationObserver(()=>changes++);observer.observe(document.querySelector('[data-timeline-caption]'),{childList:true});
    const started=performance.now();
    await new Promise(resolve=>{function tick(){range.value=frames%2?range.max:range.min;range.dispatchEvent(new Event('input',{bubbles:true}));if(++frames<37)requestAnimationFrame(tick);else requestAnimationFrame(resolve);}requestAnimationFrame(tick);});
    observer.disconnect();return {changes,elapsed:performance.now()-started};
  });
  assert.ok(captionChanges.changes<=Math.ceil(captionChanges.elapsed/120)+1,`reading caption is time-throttled independently of display cadence: ${JSON.stringify(captionChanges)}`);
  await page.waitForTimeout(250);assert.match(await page.locator('[data-timeline-caption]').innerText(),/blue.*v0/i);
  console.log('Canvas feedback remains immediate while medium-image publication settles PASS');
} finally {await browser.close();await server.close();}
