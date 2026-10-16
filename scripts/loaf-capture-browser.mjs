import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {captureLoafs} from './loaf-capture.mjs';
assert.ok(process.env.CHROME,'Explicit browser binary required');
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.addInitScript({content:`window.__captureLoafs=${captureLoafs.toString()};`});
 await page.goto('data:text/html,<title>LoAF capture contract</title>');
 const result=await page.evaluate(async()=>{
  let serializations=0;
  const proto=PerformanceLongAnimationFrameTiming.prototype,original=proto.toJSON;
  proto.toJSON=function(){serializations++;return original.call(this);};
  const capture=window.__captureLoafs(),start=performance.now();
  await new Promise(resolve=>requestAnimationFrame(()=>{const t=performance.now();while(performance.now()-t<120){/* intentional long-frame control */}requestAnimationFrame(resolve);}));
  const end=performance.now();await new Promise(r=>setTimeout(r,150));
  const hotSerializations=serializations,entries=capture.finish(start,end);
  proto.toJSON=original;
  return {hotSerializations,serializations,entries};
 });
 assert.equal(result.hotSerializations,0);
 assert.ok(result.entries.length>=1,'real long frame captured');
 assert.ok(result.entries.some(e=>e.scripts.some(s=>s.duration>=100)),'script attribution retained');
 assert.equal(result.serializations,result.entries.length);
 console.log(JSON.stringify(result));
} finally {await browser.close();}
