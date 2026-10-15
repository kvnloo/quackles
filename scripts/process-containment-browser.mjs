#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright-core';
const directory=path.resolve(process.env.OUT_DIR||'out');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let f=path.join(directory,new URL(req.url,'http://localhost').pathname);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
try{
 for(const width of [412,1440]){
  const page=await browser.newPage({viewport:{width,height:915}});
  await page.addInitScript(()=>{window.__skipped={};addEventListener('contentvisibilityautostatechange',e=>{if(e.target.matches('.process-chapter'))window.__skipped[e.target.id]=e.skipped;},{capture:true});});
  await page.goto(`http://127.0.0.1:${server.address().port}/process/`,{waitUntil:'networkidle'});
  const skipped=await page.evaluate(()=>Object.values(window.__skipped).filter(Boolean).length);
  console.log(JSON.stringify({width,skipped}));assert.ok(skipped>=5,'browser skips offscreen chapter rendering');
  // The native fragment jump must reveal and position a previously skipped chapter.
  await page.locator('.process-contents a[href="#night"]').click();await page.waitForTimeout(150);
  const target=page.locator('#night');await target.locator('h2').waitFor({state:'visible'});
  const box=await target.boundingBox();assert.ok(box.y>=0&&box.y<100,`fragment target at ${box.y}`);
  assert.equal(await page.evaluate(()=>window.__skipped.night),false);
  const details=target.locator('details').first();await details.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await details.evaluate(e=>e.open),true);await details.locator('.process-dive-body').waitFor({state:'visible'});
  await page.emulateMedia({media:'print'});
  assert.ok(await page.locator('#loop h2').isVisible(),'printing includes offscreen chapter content');
  await page.close();
 }
 console.log('PASS offscreen skip, fragment reveal, keyboard disclosure, print visibility');
}finally{await browser.close();await new Promise(r=>server.close(r));}
