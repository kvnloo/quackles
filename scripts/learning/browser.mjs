import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const out = resolve(process.env.OUT_DIR || 'out');
const artifacts = resolve(process.env.ARTIFACTS || join(process.env.TMPDIR || '.', 'learning-proof'));
await mkdir(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml','.txt':'text/plain','.md':'text/plain'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); const path=resolve(out,'.'+pathname+(pathname.endsWith('/')?'index.html':'')); if(!path.startsWith(out+'/'))throw Error('path');let bytes=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');if(/gzip/.test(req.headers['accept-encoding']||'')&&['.html','.js','.css','.json'].includes(extname(path))){bytes=gzipSync(bytes);res.setHeader('Content-Encoding','gzip');}res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}${process.env.NEXT_PUBLIC_BASE_PATH||''}/learn/`;
let browser;
try{
 assert.equal((await fetch(url)).status,200);
 browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
 const receipts=[];
 for(const mobile of [false,true]){
  const viewport=mobile?{width:390,height:844}:{width:1440,height:1000};
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();const errors=[];const scripts=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.request().resourceType()==='script')scripts.push(r.url());});
  await page.addInitScript(()=>{window.__events=[];window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId)window.__events.push(e.duration);}).observe({type:'event',buffered:true,durationThreshold:16});});
  const cdp=await context.newCDPSession(page);if(mobile)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(url,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.learn-lesson').count(),6);
  assert.equal(await page.locator('#learn-results details').count(),10);
  await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-top.png`)});
  await page.locator('#learn-load').click();await page.waitForFunction(()=>document.querySelector('#learn-status').textContent.includes('matching records'));
  const count=await page.locator('#learn-status').innerText();const manifest=JSON.parse(await readFile('public/data/learning/manifest.json','utf8'));const expected=JSON.parse(await readFile('public/'+manifest.explorer,'utf8')).length;assert.ok(count.startsWith(expected+' matching records'));
  await page.selectOption('#learn-method','conservative-review');assert.equal(await page.locator('#learn-results details').count(),5);
  await page.selectOption('#learn-scene','day');assert.equal(await page.locator('#learn-results details').count(),1);
  await page.selectOption('#learn-outcome','kept');assert.equal(await page.locator('#learn-results details').count(),0);
  await page.selectOption('#learn-method','geometry-fit');assert.equal(await page.locator('#learn-results details').count(),1);
  await page.locator('#learn-results summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#learn-results details[open]').count(),1);
  await page.locator('#learn-results img').evaluate(image=>image.decode());
  await page.locator('#explorer').scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-explorer.png`)});
  for(const image of await page.locator('.learn-lesson img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(image=>image.decode()); assert.ok(await image.evaluate(image=>image.naturalWidth>0)); }
  await page.locator('.learn-lesson').first().scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-lesson.png`)});
  await page.locator('#analysis').scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-analysis.png`)});
  assert.equal(await page.locator('#analysis .learn-rate').count(),6);
  const perf=await page.evaluate(()=>({cls:window.__cls,events:window.__events,renderMs:Number(document.querySelector('#explorer').dataset.renderMs),viewport:innerWidth,width:document.documentElement.scrollWidth}));
  assert.equal(perf.cls,0,'no layout shift');assert.ok(perf.width<=perf.viewport,'no overflow');assert.ok(perf.renderMs<100);assert.ok(perf.events.every(n=>n<100),'observed interaction durations under 100ms');
  assert.equal(scripts.length,1,'only progressive enhancement JS loads');assert.ok(scripts[0].endsWith('/learn/explorer.js'));assert.deepEqual(errors,[]);
  receipts.push({emulation:mobile?'mobile 390px, 4x CPU':'desktop',...perf,scripts,count});await context.close();
 }
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const page=await nojs.newPage();await page.goto(url);await page.locator('#learn-results summary').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#learn-results details[open]').count(),1);await nojs.close();
 const jsGzip=gzipSync(await readFile('public/learn/explorer.js')).length;assert.ok(jsGzip<=80000);
 await writeFile(join(artifacts,'browser.json'),JSON.stringify({status:'PASS',routeJsGzipBytes:jsGzip,noJavaScript:'native disclosures PASS',receipts},null,2));
 console.log(JSON.stringify({status:'PASS',routeJsGzipBytes:jsGzip,receipts}));
 if(process.env.LIGHTHOUSE==='1'){
  const args=['--yes','lighthouse',url,'--chrome-path=/usr/bin/chromium','--chrome-flags=--headless --no-sandbox --disable-gpu','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output=html',`--output-path=${join(artifacts,'lighthouse')}`,'--quiet'];
  await new Promise((resolve,reject)=>{const child=spawn('npx',args,{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Lighthouse '+code)));});
  const lhr=JSON.parse(await readFile(join(artifacts,'lighthouse.report.json'),'utf8'));
  const measured={lcp:lhr.audits['largest-contentful-paint'].numericValue,cls:lhr.audits['cumulative-layout-shift'].numericValue,tbt:lhr.audits['total-blocking-time'].numericValue,scores:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,v.score]))};
  await writeFile(join(artifacts,'budgets.json'),JSON.stringify({routeJsGzipBytes:jsGzip,...measured},null,2));console.log(JSON.stringify(measured));
  assert.ok(measured.lcp<2000,'mobile LCP <2s');assert.equal(measured.cls,0);
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
