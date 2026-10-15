import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
import {analyzeTrace,distribution,gateRun} from './frame-work.mjs';
// Config is private input: [{name,directory,route,selector,ready,bad?}].
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const out=resolve(process.env.ARTIFACTS||join(process.env.TMPDIR||'.','frame-work-v2'));
const repeats=Number(process.env.REPEATS||10);
await mkdir(out,{recursive:true});
const args=['--no-sandbox','--disable-dev-shm-usage','--enable-gpu-rasterization',`--use-angle=${process.env.ANGLE||'gl'}`];
const pin=execFileSync('taskset',['-pc',String(process.pid)],{encoding:'utf8'}).trim();
// Require an explicit pinned CPU set; don't silently compare uncontrolled runs.
assert.ok(process.env.FRAME_WORK_PIN,'Set FRAME_WORK_PIN to the taskset CPU list used for this run');
const actualCpus=JSON.parse(execFileSync('python3',['-c','import os,json; print(json.dumps(sorted(os.sched_getaffinity(0))))'],{encoding:'utf8'}));
assert.deepEqual(actualCpus,process.env.FRAME_WORK_PIN.split(',').map(Number).sort((a,b)=>a-b),'pin must match actual inherited affinity');
const executablePath=process.env.CHROME||'/usr/bin/chromium';
const traceCategories='devtools.timeline,blink.user_timing,benchmark'+(process.env.TRACE_STACKS==='1'?',disabled-by-default-devtools.timeline.stack':'');
const browser=await chromium.launch({executablePath,headless:true,args});
const browserCDP=await browser.newBrowserCDPSession();
const gpu=await browserCDP.send('SystemInfo.getInfo');
const runs=[],servers=[];
try {
  for(const variant of config) {
    servers.push(await serve({directory:variant.directory}));
    variant.htmlSha256=createHash('sha256').update(await readFile(join(variant.directory,(variant.route||'/lineage/'),'index.html'))).digest('hex');
  }
  await writeFile(join(out,'environment.json'),JSON.stringify({version:await browser.version(),executablePath,traceCategories,args,gpu,pin,config,repeats,classification:'headless mobile emulation; not physical 120Hz'},null,2));
  for(let repeat=0;repeat<repeats;repeat++) {
    // AB / BA counterbalance; negative control participates in interleaving.
    const order=config.map((_,i)=>i);if(repeat%2)order.reverse();
    for(const index of order) {
      const v=config[index], label=`${String(repeat).padStart(2,'0')}-${v.name}`;
      const loadBefore=(await readFile('/proc/loadavg','utf8')).trim();
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
      try {
        const page=await context.newPage(), errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
        await page.goto(servers[index].url+(v.route||'/lineage/'),{waitUntil:'networkidle'});
        await page.waitForSelector(v.ready||'[data-ready="true"]');
        const selector=v.selector||'#lineage-viewport';
        await page.locator(selector).scrollIntoViewIfNeeded();
        await page.evaluate(async(selector)=>{
          await document.fonts.ready;const el=document.querySelector(selector);el.scrollTop=0;
          await Promise.all([...document.images].filter(i=>i.complete&&i.naturalWidth).map(i=>i.decode().catch(()=>{})));
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        },selector);
        if(v.bad) await page.evaluate(()=>{
          const el=document.createElement('div');el.id='fw-bad';el.style.cssText='position:absolute;top:0;width:100px';el.textContent='forced layout negative control';document.body.append(el);
        });
        const cdp=await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await cdp.send('Tracing.start',{categories:traceCategories,transferMode:'ReturnAsStream'});
        // Native scroll input: setting scrollTop in rAF can itself force layout
        // after asynchronous image loads, falsely blaming the page for the harness.
        const box=await page.locator(selector).boundingBox();
        await page.evaluate(({selector,bad})=>{
          if(!PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))throw new Error('LoAF unsupported');
          const el=document.querySelector(selector),times=[],loafs=[];let prev,raf;
          const observer=new PerformanceObserver(l=>loafs.push(...l.getEntries().map(e=>e.toJSON())));
          observer.observe({type:'long-animation-frame'});
          const begin=el.scrollTop;
          function tick(t) {
            if(prev!==undefined)times.push(t-prev);prev=t;
            if(bad){const b=document.querySelector('#fw-bad');for(let i=0;i<20;i++){b.style.width=`${100+i%2}px`;void b.offsetWidth;}}
            raf=requestAnimationFrame(tick);
          }
          performance.mark('fw:start');raf=requestAnimationFrame(tick);
          window.__fwStop=async()=>{
            await new Promise(r=>requestAnimationFrame(r));cancelAnimationFrame(raf);performance.mark('fw:end');
            await new Promise(r=>setTimeout(r,100));
            loafs.push(...observer.takeRecords().map(e=>e.toJSON()));observer.disconnect();
            const start=performance.getEntriesByName('fw:start').at(-1).startTime,end=performance.getEntriesByName('fw:end').at(-1).startTime;
            return {times,loafs:loafs.filter(e=>e.startTime<end&&e.startTime+e.duration>start),scrollDistance:el.scrollTop-begin};
          };
        },{selector,bad:!!v.bad});
        await cdp.send('Input.synthesizeScrollGesture',{x:box.x+box.width/2,y:Math.max(0,box.y)+Math.min(box.height,600)/2,yDistance:-5760,speed:1440,gestureSourceType:'mouse'});
        const sample=await page.evaluate(()=>window.__fwStop());
        const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');
        const {stream}=await done;let trace='';
        for(;;){const r=await cdp.send('IO.read',{handle:stream});trace+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});
        await writeFile(join(out,`${label}.trace.json`),trace);
        const measured=analyzeTrace(JSON.parse(trace).traceEvents);
        const run={label,variant:v.name,repeat,loadBefore,loadAfter:(await readFile('/proc/loadavg','utf8')).trim(),pin,...measured,...sample,cadenceInformational:distribution(sample.times),errors};
        run.gate=gateRun(run);
        runs.push(run);await writeFile(join(out,`${label}.json`),JSON.stringify(run,null,2));
        await appendFile(join(out,'runs.jsonl'),JSON.stringify({label,work:run.work,forcedLayouts:run.forcedLayouts.length,loafs:run.loafs.length,gate:run.gate,loadBefore})+'\n');
        console.log(label,JSON.stringify({work:run.work,frames:run.frameCount,forcedLayouts:run.forcedLayouts.length,loafs:run.loafs.length,gate:run.gate}));
      }finally{await context.close();}
    }
  }
  const persisted=await Promise.all(runs.map(r=>readFile(join(out,`${r.label}.json`),'utf8').then(JSON.parse)));
  const summary=config.map(v=>{
    const r=persisted.filter(r=>r.variant===v.name), p95=distribution(r.map(r=>r.work.p95)),max=distribution(r.map(r=>r.work.max));
    return {variant:v.name,negativeControl:!!v.bad,n:r.length,p95,max,stable:p95.iqr<=.5&&p95.iqr/Math.max(p95.median,.1)<=.25,allPass:r.every(r=>r.gate.pass),allFail:r.every(r=>!r.gate.pass),forcedLayouts:r.reduce((s,r)=>s+r.forcedLayouts.length,0),loafs:r.reduce((s,r)=>s+r.loafs.length,0),cadenceInformational:distribution(r.map(r=>r.cadenceInformational.p95))};
  });
  const validated=repeats>=10&&summary.filter(s=>!s.negativeControl).every(s=>s.stable)&&summary.some(s=>s.negativeControl&&s.forcedLayouts>0&&s.allFail);
  await writeFile(join(out,'summary.json'),JSON.stringify({validated,summary},null,2));
  console.log(JSON.stringify({validated,summary},null,2));
  if(!validated||summary.some(s=>!s.negativeControl&&!s.allPass))process.exitCode=1;
}finally{await browser.close();for(const s of servers)await s.close();}
