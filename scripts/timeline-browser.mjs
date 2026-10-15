import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const artifacts=resolve(process.env.ARTIFACTS||join(process.env.TMPDIR,'.timeline-functional'));await mkdir(artifacts,{recursive:true});
const server=await serve({directory:process.env.OUT_DIR||'out'});
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
const results=[];
try {
  for(const [profile,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:profile==='mobile',hasTouch:profile==='mobile',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready="true"]');
    assert.equal(await page.locator('[data-timeline-range]').count(),1,'timeline scrubber missing');
    const range=page.locator('[data-timeline-range]');await range.press('Home');await page.waitForTimeout(250);
    assert.match(await page.locator('[data-timeline-caption]').innerText(),/blue.*v0/i);
    assert.equal(await page.locator('.tl-lane').count(),5);assert.equal(await page.locator('.tl-tick').count(),665);
    const first=await page.locator('[data-timeline-count]').innerText();
    await range.press('End');await page.waitForTimeout(250);
    assert.match(await page.locator('[data-timeline-count]').innerText(),/665 \/ 665/);
    assert.equal(await page.locator('.tl-state-artifact[data-active=true]').count(),5);
    assert.equal(await page.locator('.tl-state-artifact').count(),5);
    assert.equal(await page.locator('.tl-stream-artifact').count(),6);
    assert.ok(await page.locator('.tl-stream-artifact[data-active=true]').evaluateAll(nodes=>nodes.every(n=>Date.parse(n.dataset.date)<=Number(document.querySelector('.tl-instrument').dataset.time))));
    const lastFirst=await page.locator('.tl-stream-artifact').first().getAttribute('data-position');
    await page.locator('[data-timeline-earlier]').click();assert.notEqual(await page.locator('.tl-stream-artifact').first().getAttribute('data-position'),lastFirst);
    await page.locator('[data-timeline-later]').click();assert.equal(await page.locator('.tl-stream-artifact').first().getAttribute('data-position'),lastFirst);
    await page.reload({waitUntil:'networkidle'});await page.waitForSelector('[data-ready=true]');
    assert.match(await page.locator('[data-timeline-count]').innerText(),/665 \/ 665/);
    await page.locator('[data-timeline-range]').press('Home');await page.waitForTimeout(100);
    const initial=await page.locator('.tl-instrument').getAttribute('data-time');await range.press('Shift+ArrowRight');await page.waitForTimeout(100);
    assert.ok(Number(await page.locator('.tl-instrument').getAttribute('data-time'))>Number(initial));
    await range.press('Home');await page.locator('[data-timeline-play]').click();await page.waitForTimeout(1000);await page.locator('[data-timeline-play]').click();
    assert.notEqual(await page.locator('[data-timeline-count]').innerText(),first);
    await range.press('End');await page.waitForTimeout(150);
    await page.locator('#lineage-theme').selectOption('night');
    assert.match(await page.locator('[data-timeline-count]').innerText(),/119 \/ 119/);
    assert.equal(await page.locator('.tl-state-artifact[data-active=true]').count(),1);
    await page.locator('#lineage-reset').click();
    await page.locator('.tl-details').evaluate(n=>n.open=true);
    const night=page.locator('.tl-milestone').filter({hasText:'Night v2 begins'});await night.click();await page.waitForTimeout(150);
    assert.match(await page.locator('[data-timeline-caption]').innerText(),/Night v2/i);
    const tick=page.locator('.tl-tick').first();await tick.focus();await tick.press('ArrowRight');assert.match(await page.locator('.tl-preview').innerText(),/v\d/);
    await range.scrollIntoViewIfNeeded();
    const box=await range.boundingBox();
    if(profile==='mobile') {
      const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-10,y:box.y+box.height/2}]});
      for(let i=0;i<=20;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width-10-(box.width-10)*i/20,y:box.y+box.height/2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {await page.mouse.move(box.x+box.width-8,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x,box.y+box.height/2,{steps:24});await page.mouse.up();}
    await page.waitForTimeout(250);assert.equal(await page.locator('[data-timeline-count]').innerText(),first);
    assert.equal(await page.locator('.tl-stream-artifact').first().evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
    await page.screenshot({path:join(artifacts,profile+'-timeline.png'),fullPage:false});
    // A short real frame sequence documents the time sweep without changing the traced workload.
    for(let i=0;i<6;i++) {await range.evaluate((n,p)=>{n.value=Number(n.min)+(Number(n.max)-Number(n.min))*p;n.dispatchEvent(new Event('input',{bubbles:true}));},i/5);await page.waitForTimeout(220);await page.screenshot({path:join(artifacts,`${profile}-scrub-${i}.png`)});}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.goto(server.url+'/lineage/#/t/2026-10-14T20:00:00Z',{waitUntil:'networkidle'});await page.waitForTimeout(250);
    assert.ok(Number(await page.locator('.tl-instrument').getAttribute('data-time'))<=Date.parse('2026-10-14T20:00:00Z'));
    assert.deepEqual(errors,[]);results.push({profile,keyboard:true,touch:profile==='mobile',filters:true,milestones:true,deepLinks:true,reducedMotion:true,errors});await context.close();
  }
  await writeFile(join(artifacts,'functional.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();await server.close();}
