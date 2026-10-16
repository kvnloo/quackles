import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve({directory:process.env.OUT_DIR||'out'}),browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready="true"]');await page.locator('[data-timeline-range]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.tl-canvas').dataset.assetsReady==='true',null,{timeout:60000});await page.waitForTimeout(1200);
 const result=await page.evaluate(async()=>{
  const range=document.querySelector('[data-timeline-range]'),caption=document.querySelector('[data-timeline-caption]');let changes=0,frames=0;
  const observer=new MutationObserver(r=>changes+=r.length);observer.observe(caption,{childList:true,characterData:true,subtree:true});
  const nativeRAF=window.requestAnimationFrame;window.requestAnimationFrame=cb=>nativeRAF.call(window,ts=>setTimeout(()=>cb(ts),160)); // Delayed frame delivery; not a performance sample.
  await new Promise(resolve=>{function tick(){range.value=frames%2?range.max:range.min;range.dispatchEvent(new Event('input',{bubbles:true}));if(++frames<8)requestAnimationFrame(tick);else requestAnimationFrame(resolve);}requestAnimationFrame(tick);});observer.disconnect();window.requestAnimationFrame=nativeRAF;return {changes,frames};
 });assert.equal(result.changes,0,'a long frame is not idle: native details wait for quiet frames after the input stream');await page.waitForTimeout(600);assert.ok((await page.locator('[data-timeline-caption]').innerText()).length>0);console.log('PASS delayed scheduling does not publish native details during continuous input',result);
}finally{await browser.close();await server.close();}
