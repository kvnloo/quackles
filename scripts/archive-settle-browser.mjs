import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve();
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{
  const original=window.setTimeout;window.__archiveTimerWrites=[];
  window.setTimeout=function(callback,delay,...args){if(typeof callback!=='function')return original(callback,delay,...args);return original(function(...values){
   if(delay!==150)return callback(...values);
   const grid=document.querySelector('#lineage-grid');if(!grid)return callback(...values);
   const observer=new MutationObserver(()=>{});observer.observe(grid,{subtree:true,attributes:true,childList:true,characterData:true});
   try{return callback(...values);}finally{window.__archiveTimerWrites.push(observer.takeRecords().length);observer.disconnect();}
  },delay,...args);};
 });
 await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready="true"]');
 const viewport=page.locator('#lineage-viewport');await viewport.scrollIntoViewIfNeeded();await page.waitForTimeout(800);
 const cdp=await page.context().newCDPSession(page),box=await viewport.boundingBox();
 await cdp.send('Input.synthesizeScrollGesture',{x:box.x+box.width/2,y:Math.max(0,box.y)+Math.min(box.height,600)/2,yDistance:-1600,speed:1440,gestureSourceType:'mouse'});
 await page.waitForTimeout(500);
 const result=await page.evaluate(()=>({writes:window.__archiveTimerWrites,top:document.querySelector('#lineage-viewport').scrollTop,visible:[...document.querySelectorAll('.lineage-card')].filter(n=>!n.hidden).map(n=>Number(n.dataset.index))}));
 console.log(JSON.stringify(result));assert.ok(result.top>1000);assert.ok(result.writes.length>0,'settlement timer exercised');assert.equal(result.writes.reduce((a,b)=>a+b,0),0,'native publication belongs to animation frame, not timer task before resumed scroll');assert.ok(Math.max(...result.visible)>10,'settled native window updated');
}finally{await browser.close();await server.close();}
