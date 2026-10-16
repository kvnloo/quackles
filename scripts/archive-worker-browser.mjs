import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve({directory:process.env.OUT_DIR||'out'}),browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{window.archiveProbe={mainRasters:0,workerResults:[]};const O=OffscreenCanvas;window.OffscreenCanvas=class extends O{constructor(...args){super(...args);window.archiveProbe.mainRasters++;}};const W=Worker;window.Worker=class extends W{constructor(...args){super(...args);this.addEventListener('message',event=>{if(Number.isInteger(event.data.index))window.archiveProbe.workerResults.push({index:event.data.index,error:event.data.error||null,image:!!event.data.image});});}};});
 await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready="true"]');await page.locator('#lineage-viewport').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.archiveProbe.workerResults.filter(r=>r.image).length>=10);
 const cdp=await page.context().newCDPSession(page),box=await page.locator('#lineage-viewport').boundingBox();await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await cdp.send('Input.synthesizeScrollGesture',{x:box.x+box.width/2,y:Math.max(0,box.y)+250,yDistance:-5760,speed:1440,gestureSourceType:'mouse'});
 const result=await page.evaluate(()=>window.archiveProbe);assert.ok(result.workerResults.length>=30,'worker prepares new rows during actual travel');assert.deepEqual(result.workerResults.filter(r=>r.error),[],'real webfonts load in Worker; local() fallback faces are not network fonts');assert.equal(result.mainRasters,0,'prepared scrolling does no main-thread text rasterization');
 if(process.env.ARTIFACTS){await mkdir(process.env.ARTIFACTS,{recursive:true});await writeFile(process.env.ARTIFACTS+'/archive-worker.json',JSON.stringify(result,null,2));}console.log('PASS archive Worker font loading, ongoing bounded-row preparation and zero main-thread label rasterization');
}finally{await browser.close();await server.close();}
