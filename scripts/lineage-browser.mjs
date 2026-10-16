import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { serve } from './lineage-server.mjs';
if(process.env.SCROLL_GATE) throw new Error('SCROLL_GATE cadence admission is retired. Use scripts/frame-work-browser.mjs; see docs/frame-work-v2.md.');
const artifacts=resolve(process.env.ARTIFACTS || join(process.env.TMPDIR || '.', 'lineage-evidence'));
await mkdir(join(artifacts,'screens'),{recursive:true});
const server=await serve();
let browser;
const results=[];
try {
  assert.equal((await fetch(server.url+'/lineage/')).status,200);
  browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-frame-rate-limit']});
  for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:label==='mobile',hasTouch:label==='mobile'});
    await context.addInitScript(()=>{
      window.__cls=0;window.__lcp=0;
      new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true});
      new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
    });
    const page=await context.newPage(), failures=[], scripts=new Map(), requests=[];
    page.on('pageerror',e=>failures.push(e.message));
    page.on('response',async response=>{
      if(response.status()>=400)failures.push(`${response.status()} ${response.url()}`);
      if(/\.m?js(?:\?|$)/.test(response.url()))scripts.set(response.url(),gzipSync(await response.body()).length);
    });
    page.on('request',request=>requests.push(request.url()));
    await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});
    await page.waitForSelector('[data-ready="true"]');
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('.lineage-comparison').count(),5);
    assert.equal(await page.locator('.lineage-accessible a').count(),665,'complete semantic archive retains every version');
    assert.ok(await page.locator('.lineage-card').count()<=40,'paint tree bounded to viewport and overscan');
    assert.ok(await page.locator('.lineage-card-image').count()<=40,'bounded atlas-backed image slots');
    assert.match(await page.locator('#lineage-count').innerText(),/^665 of 665/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok(await page.locator('h1').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect().right<=innerWidth;}),'headline fits without clipped text');
    await page.screenshot({path:join(artifacts,'screens',`${label}-top.png`)});
    const initialRequests=requests.length;
    const initial=await page.evaluate(()=>({lcp:window.__lcp,cls:window.__cls,images:document.images.length}));
    assert.ok(!requests.some(r=>r.includes('/_next/')&&r.endsWith('.js')),'no framework runtime on static island');
    const dataset=JSON.parse(await readFile('public/lineage/'+JSON.parse(await readFile('public/lineage/manifest.json')).dataset));
    const medium=new Set([...dataset.entries,...Object.values(dataset.current)].map(e=>e.thumbs.medium[0]));
    const initialMedium=new Set(requests.filter(r=>medium.has(r.split('/').at(-1))));
    assert.ok(initialMedium.size<=16,'medium images are bounded to five hero states and nearby prefetch');
    assert.ok(await page.locator('.tl-state-artifact img').evaluateAll(nodes=>nodes.every(i=>i.decoding==='async')));
    await page.locator('a[href="#/day/current"]').click();
    await page.waitForSelector('dialog[open]');
    await page.locator('#lineage-detail-image img').evaluate(img=>img.decode());
    assert.ok((await page.locator('#lineage-detail-image img').getAttribute('src')).endsWith(dataset.current.day.thumbs.medium[0]));
    await page.keyboard.press('Escape');
    await page.locator('#timeline').scrollIntoViewIfNeeded();
    await page.locator('#lineage-theme').selectOption('day');
    assert.match(await page.locator('#lineage-count').innerText(),/^331 of 665/);
    await page.locator('select[name="status"]').selectOption('rejected');
    assert.equal(await page.locator('.lineage-status').first().textContent(),'rejected');
    await page.locator('input[name="query"]').fill('doesnotexist');
    assert.ok(await page.locator('#lineage-empty').isVisible());
    await page.locator('#lineage-reset').click();
    await page.locator('#lineage-order').click();
    const newest=await page.locator('.lineage-card').first().getAttribute('data-id');
    await page.locator('#lineage-order').click();
    assert.notEqual(await page.locator('.lineage-card').first().getAttribute('data-id'),newest);
    await page.locator('#lineage-theme').selectOption('day');
    await page.locator('#lineage-viewport').focus();await page.keyboard.press('End');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'day/v330');
    await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'day/v0');
    await page.keyboard.press('Enter');await page.waitForSelector('dialog[open]');
    await page.locator('#lineage-detail-image img').evaluate(img=>img.decode());
    await page.keyboard.press('ArrowRight');
    assert.ok(page.url().endsWith('#/day/v1'));
    await page.locator('#lineage-detail-image img').evaluate(img=>img.decode());
    await page.screenshot({path:join(artifacts,'screens',`${label}-lightbox.png`)});
    await page.keyboard.press('Escape');
    await page.goto('about:blank');
    await page.goto(server.url+'/lineage/#/day/v42',{waitUntil:'networkidle'});
    await page.waitForSelector('dialog[open]');assert.match(await page.locator('#lineage-detail-title').innerText(),/DAY \/ V42/i);
    await page.keyboard.press('Escape');await page.locator('#timeline').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(artifacts,'screens',`${label}-grid.png`)});
    // Real trace, 4x CPU slowdown, mobile viewport. Frame intervals are reported
    // separately from main-thread frame work; headless display cadence is not hardware 120Hz proof.
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,benchmark',transferMode:'ReturnAsStream'});
    const {frameIntervals,loafs}=await page.evaluate(async()=>{
      const viewport=document.querySelector('#lineage-viewport');const times=[],loafs=[];let prior;
      const observer=new PerformanceObserver(list=>loafs.push(...list.getEntries().map(e=>e.toJSON())));
      observer.observe({type:'long-animation-frame',buffered:false});
      await new Promise(resolve=>{let n=0;function tick(t){if(prior!==undefined)times.push(t-prior);prior=t;viewport.scrollTop+=24;if(++n<240)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
      loafs.push(...observer.takeRecords().map(e=>e.toJSON()));observer.disconnect();
      return {frameIntervals:times,loafs};
    });
    const traceDone=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
    await cdp.send('Tracing.end');const {stream}=await traceDone;let trace='';
    while(true){const result=await cdp.send('IO.read',{handle:stream});trace+=result.data;if(result.eof)break;}
    await cdp.send('IO.close',{handle:stream});
    await writeFile(join(artifacts,`${label}-scroll-trace.json`),trace);
    const events=JSON.parse(trace).traceEvents;
    const work=events.filter(e=>e.name==='FireAnimationFrame'&&e.ph==='X'&&typeof e.dur==='number').map(e=>e.dur/1000);
    const p95=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*.95)]||0;
    const jsBytes=[...scripts.values()].reduce((a,b)=>a+b,0);
    assert.ok(jsBytes<=60_000,`route JS ${jsBytes} gzip`);
    assert.ok(await page.locator('.lineage-card').count()<=40,'scroll retains a bounded ring of cards');
    assert.equal(await page.locator('.lineage-accessible a').count(),665,'scroll retains the entire semantic archive');
    assert.deepEqual(failures,[]);
    results.push({label,emulation:true,cpuSlowdown:4,...initial,jsGzipBytes:jsBytes,scriptCount:scripts.size,initialRequests,scrollRafP95Ms:p95(frameIntervals),scrollRafMaxMs:Math.max(...frameIntervals),overBudgetFrames:frameIntervals.filter(t=>t>=8.3).length,frameIntervals,loafs,rafCallbackWorkP95Ms:p95(work),traceCallbacks:work.length,failures});
    await context.close();
  }
  // Process callout is part of the exported page and navigates to the actual route.
  const page=await browser.newPage();await page.goto(server.url+'/process/');
  await page.locator('.process-lineage-callout').scrollIntoViewIfNeeded();
  assert.match(await page.locator('.process-lineage-callout').innerText(),/White r102/);
  await page.screenshot({path:join(artifacts,'screens','process-callout.png')});
  await page.locator('.process-lineage-callout a').click();await page.waitForSelector('[data-ready="true"]');
  await writeFile(join(artifacts,'browser-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(({frameIntervals,loafs,...result})=>({...result,loafCount:loafs.length,frames:frameIntervals.length})),null,2));
  // Cadence remains informational; trace-based admission is a separate repeated experiment.
}finally{await browser?.close();await server.close();}
