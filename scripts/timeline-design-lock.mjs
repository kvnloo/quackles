import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const artifacts=resolve(process.env.ARTIFACTS);
await mkdir(artifacts,{recursive:true});
const baseline=await serve({directory:process.env.BASELINE_OUT});
const candidate=await serve({directory:process.env.OUT_DIR||'out'});
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});
const receipts=[],failures=[];
const targets=[['public',baseline.url+'/lineage/',candidate.url+'/lineage/']];
if(process.env.LOCAL_BEFORE&&process.env.LOCAL_AFTER)targets.push(['local',pathToFileURL(process.env.LOCAL_BEFORE).href,pathToFileURL(process.env.LOCAL_AFTER).href]);
const selectors=['.tl-top','.tl-readout','.tl-range','.tl-endpoints','.tl-lanes','.tl-preview','.tl-state-heading','.tl-state-row','.tl-stream-row','.tl-stream-artifact','.tl-details','.tl-state-artifact img','.tl-readout time','.tl-readout p','[data-timeline-count]'];
try{
 for(const [surface,before,after] of targets)for(const width of [1440,390]){
  const pages=[];
  for(const [label,url] of [['before',before],['after',after]]){
   const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
   await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('[data-timeline-range]');
   await page.evaluate(()=>document.fonts.ready);
   await page.locator('[data-timeline-range]').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>{const c=document.querySelector('.tl-canvas');return !c||c.dataset.assetsReady===undefined||c.dataset.assetsReady==='true';},null,{timeout:60000});
   const range=await page.locator('[data-timeline-range]').evaluate(n=>({min:Number(n.min),max:Number(n.max)}));
   pages.push({page,label,range});
  }
  for(const [checkpoint,fraction] of [['start',0],['middle',.5],['end',1]]){
   const time=pages[0].range.min+(pages[0].range.max-pages[0].range.min)*fraction;
   const pair=[];
   for(const {page,label} of pages){
    await page.locator('[data-timeline-range]').evaluate((n,time)=>{n.value=time;n.dispatchEvent(new Event('input',{bubbles:true}));},time);
    await page.waitForTimeout(700);
    await page.locator('.tl-instrument img[src]').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode().catch(()=>{}))));
    await page.evaluate(()=>{document.activeElement?.blur();const n=document.querySelector('.tl-instrument');window.scrollTo(0,n.getBoundingClientRect().top+scrollY-20);});
    const geometry=await page.locator('.tl-instrument').evaluate((host,selectors)=>{
     const r=host.getBoundingClientRect();return {width:r.width,height:r.height,position:host.dataset.position,text:host.querySelector('[data-timeline-caption]').textContent,regions:Object.fromEntries(selectors.map(s=>[s,[...host.querySelectorAll(s)].map(n=>{const b=n.getBoundingClientRect();return {x:b.x-r.x,y:b.y-r.y,w:b.width,h:b.height};})]))};
    },selectors);
    const name=`${surface}-${width}-${checkpoint}-${label}`;
    await page.locator('.tl-instrument').screenshot({path:join(artifacts,name+'.png'),animations:'disabled'});
    receipts.push({name,time,...geometry});pair.push(geometry);
   }
   try{assert.deepEqual(pair[1],pair[0],`${surface}/${width}/${checkpoint}: locked layout, labels and selection`);}catch(error){failures.push(error.message);}
  }
  for(const {page} of pages)await page.close();
 }
 await writeFile(join(artifacts,'geometry.json'),JSON.stringify({receipts,failures},null,2));
 assert.deepEqual(failures,[],failures.join('\n'));
}finally{await browser.close();await baseline.close();await candidate.close();}
