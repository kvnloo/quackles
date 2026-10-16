import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve({directory:process.env.OUT_DIR||'out'});
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
try{
 const transfers=[];
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 page.on('response',r=>{if(/atlas\..*webp/.test(r.url()))transfers.push(r.body().then(b=>({name:r.url(),bytes:b.length})));});
 await page.addInitScript(()=>{window.startupTasks=[];new PerformanceObserver(list=>window.startupTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
 await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});
 await page.waitForSelector('[data-ready="true"]');
 const before=await page.evaluate(()=>({tasks:window.startupTasks,atlas:performance.getEntriesByType('resource').filter(e=>/atlas\..*webp/.test(e.name)).map(e=>({name:e.name,bytes:e.transferSize})),cards:document.querySelectorAll('.lineage-accessible a').length}));
 await mkdir(process.env.ARTIFACTS,{recursive:true});await writeFile(process.env.ARTIFACTS+'/startup.json',JSON.stringify(before,null,2));
 assert.equal(before.cards,665);
 assert.equal(before.atlas.length,0,'offscreen timeline must not fetch atlas pages during initial archive startup');
 await page.locator('[data-timeline-range]').evaluate(n=>{n.value=n.min;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>/blue.*v0/i.test(document.querySelector('[data-timeline-caption]').textContent));
 assert.equal(await page.locator('.tl-state-artifact').first().getAttribute('data-active'),'false','native state clears even before atlas preparation');
 await page.locator('.tl-instrument').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.tl-canvas')?.dataset.assetsReady==='true',null,{timeout:60000});
 const after=await page.evaluate(()=>({atlas:performance.getEntriesByType('resource').filter(e=>/atlas\..*webp/.test(e.name)).map(e=>({name:e.name,bytes:e.transferSize})),renderer:document.querySelector('.tl-canvas').dataset.renderer}));
 after.atlas=await Promise.all(transfers);
 await writeFile(process.env.ARTIFACTS+'/progressive.json',JSON.stringify(after,null,2));
 assert.ok(after.atlas.length>0);assert.ok(after.atlas.reduce((s,e)=>s+e.bytes,0)<=3_010_000);console.log({before,after});
}finally{await browser.close();await server.close();}
