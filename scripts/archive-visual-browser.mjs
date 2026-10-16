import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {serve} from './lineage-server.mjs';
const out=process.env.ARTIFACTS;await mkdir(out,{recursive:true});
const roots=JSON.parse(process.env.VISUAL_VARIANTS),servers=await Promise.all(roots.map(r=>serve({directory:r.directory})));
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--enable-gpu-rasterization','--use-angle=gl']});const results=[];
try{for(const width of [390,1440])for(const top of [0,5760,1000000])for(let v=0;v<roots.length;v++){
 const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
 await page.goto(servers[v].url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready="true"]');
 await page.locator('#lineage-viewport').scrollIntoViewIfNeeded();await page.waitForTimeout(600);
 await page.locator('#lineage-viewport').evaluate((e,top)=>e.scrollTop=top,top);await page.waitForTimeout(900);
 await page.locator('#lineage-viewport').evaluate(async e=>{const r=e.getBoundingClientRect();await Promise.all([...e.querySelectorAll('img')].filter(i=>{const b=i.getBoundingClientRect();return b.bottom>r.top&&b.top<r.bottom;}).map(i=>{i.loading='eager';return i.decode();}));});
 await page.evaluate(()=>Promise.all([...document.images].filter(i=>i.complete&&i.naturalWidth).map(i=>i.decode().catch(()=>{}))));
 const geometry=await page.locator('#lineage-viewport').evaluate(e=>{const box=e.getBoundingClientRect();const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x-box.x,y:r.y-box.y,width:r.width,height:r.height}};return {width:box.width,height:box.height,top:e.scrollTop,scrollHeight:e.scrollHeight,cards:[...e.querySelectorAll('.lineage-card')].filter(n=>!n.hidden&&n.getBoundingClientRect().bottom>box.top&&n.getBoundingClientRect().top<box.bottom).map(n=>({id:n.dataset.id,rect:rect(n),text:n.textContent,children:[...n.children].map(rect)})).sort((a,b)=>a.rect.y-b.rect.y||a.rect.x-b.rect.x)};});
 const name=`${width}-${top}-${roots[v].name}`;await page.locator('#lineage-viewport').screenshot({path:out+'/'+name+'.png'});results.push({name,variant:roots[v].name,width,top,geometry});
 if(process.env.LIVE_SHOTS&&await page.locator('.lineage-grid-canvas').count()){
  await page.evaluate(()=>{const e=document.querySelector('#lineage-viewport');window.__visualScroll=setInterval(()=>e.dispatchEvent(new Event('scroll')),30);});await page.waitForTimeout(500);
  await page.locator('#lineage-viewport').screenshot({path:out+'/'+name+'-live.png'});await page.evaluate(()=>clearInterval(window.__visualScroll));
 }
 await page.close();
}await writeFile(out+'/geometry.json',JSON.stringify(results,null,2));console.log('captured',results.length);}finally{await browser.close();for(const s of servers)await s.close();}
