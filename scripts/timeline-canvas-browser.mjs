import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const artifacts=resolve(process.env.ARTIFACTS||join(process.env.TMPDIR,'timeline-canvas'));await mkdir(artifacts,{recursive:true});
const receipts=[];
const server=await serve({directory:process.env.OUT_DIR||'out'});
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
try {
  for(const backend of ['webgl2','canvas2d']) {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  if(backend==='canvas2d')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  const glErrors=[];
  page.on('console',message=>{if(/GL_INVALID|GL_OUT_OF_MEMORY/.test(message.text()))glErrors.push(message.text());});
  page.on('pageerror',error=>console.error(error));
  await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready=true]');
  assert.equal(await page.locator('.tl-instrument canvas').count(),1,'one sprite canvas replaces DOM ticks and animated thumbnails');
  assert.equal(await page.locator('.tl-tick').count(),0);
  assert.equal(await page.locator('.tl-instrument img').count(),5);
  assert.ok(await page.locator('.tl-instrument *').count()<160,'bounded timeline DOM');

  await page.locator('[data-timeline-range]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.tl-canvas').dataset.assetsReady==='true',null,{timeout:60000});
  const receipt=await page.locator('canvas').evaluate(n=>({renderer:n.dataset.renderer,gl:n.dataset.gl,instances:n.dataset.instances,width:n.width,height:n.height}));
  assert.equal(Number(receipt.instances),665);
  assert.equal(receipt.renderer,backend);
  assert.equal(receipt.width,await page.locator('canvas').evaluate(n=>Math.round(n.getBoundingClientRect().width*2)),'DPR2 backing surface');
  assert.ok(receipt.width>0 && receipt.height>0);
  await page.locator('[data-timeline-range]').press('Home');await page.waitForTimeout(250);
  assert.match(await page.locator('[data-timeline-caption]').innerText(),/blue.*v0/i);
  const accessible=page.getByRole('slider',{name:'Project time'});
  assert.equal(await accessible.getAttribute('aria-valuenow'),await page.locator('.tl-instrument').getAttribute('data-time'));
  assert.ok(await accessible.getAttribute('aria-valuetext'));
  await page.locator('[data-timeline-range]').press('End');await page.waitForTimeout(250);
  assert.match(await page.locator('[data-timeline-count]').innerText(),/665 \/ 665/);
  assert.deepEqual(glErrors,[],'no GL errors before context loss');
  if(backend==='webgl2'){
    await page.locator('canvas').evaluate(n=>{window.__lose=n.getContext('webgl2').getExtension('WEBGL_lose_context');window.__lose.loseContext();});
    await page.waitForFunction(()=>document.querySelector('canvas').dataset.ready==='false');
    await page.evaluate(()=>window.__lose.restoreContext());
    await page.waitForFunction(()=>document.querySelector('canvas').dataset.ready==='true');
  }
  await page.locator('canvas').screenshot({path:join(artifacts,backend+'.png')});
  assert.deepEqual(glErrors,[]);
  receipts.push({...receipt,contextRestored:backend==='webgl2'});
  console.log(JSON.stringify(receipt));
  await page.close();
  }
  await writeFile(join(artifacts,'renderers.json'),JSON.stringify(receipts,null,2));
} finally {await browser.close();await server.close();}
