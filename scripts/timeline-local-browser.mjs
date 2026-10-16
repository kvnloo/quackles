import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
try{
 for(const backend of ['webgl2','canvas2d']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  if(backend==='canvas2d')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await page.goto(pathToFileURL(join(process.env.LOCAL_REVIEW_DIR,'index.html')).href,{waitUntil:'load'});
  await page.waitForSelector('[data-timeline-range]');
  assert.equal(await page.locator('.tl-instrument canvas').count(),1,'local HITL must use the shared atlas renderer');
  await page.waitForSelector('canvas[data-ready=true]',{timeout:60000});
  assert.equal(await page.locator('canvas').getAttribute('data-renderer'),backend);
  await page.waitForFunction(()=>/665 \/ 665/.test(document.querySelector('[data-timeline-count]').textContent));
  await page.getByRole('slider',{name:'Project time'}).press('Home');
  await page.waitForFunction(()=>/blue.*v0/i.test(document.querySelector('[data-timeline-caption]').textContent));
  assert.match(await page.locator('[data-timeline-caption]').innerText(),/blue.*v0/i);
  await page.getByRole('slider',{name:'Project time'}).press('End');await page.waitForTimeout(300);
  assert.match(await page.locator('[data-timeline-count]').innerText(),/665 \/ 665/);
  assert.equal(await page.locator('#project-timeline .card').count(),665);
  assert.equal(await page.locator('img[data-role=latest]').count(),5);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log(JSON.stringify({backend,protocol:'file:',networkRequests:network.length,archiveCards:665}));await page.close();
 }
}finally{await browser.close();}
