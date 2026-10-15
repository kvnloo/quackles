#!/usr/bin/env node
// Exercise the exported HTML and the browser's real responsive-image selection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';
const directory=path.resolve(process.env.OUT_DIR||'out');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let f=path.join(directory,new URL(req.url,'http://localhost').pathname);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu','--use-angle=swiftshader']});
const results=[],failures=[];
try{
 for(const [name,width,dpr,maxWidth] of [['phone-1x',412,1,480],['phone-3x',412,3,1024],['desktop-1x',1440,1,480]]){
  const context=await browser.newContext({viewport:{width,height:915},deviceScaleFactor:dpr});const page=await context.newPage();const bad=[];page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/process/`,{waitUntil:'networkidle'});
  const hero=page.locator('.process-hero-figure img');await hero.evaluate(i=>i.decode());
  const value=await hero.evaluate(i=>({src:i.currentSrc,srcset:i.srcset,width:i.width,original:i.closest('a').getAttribute('href'),loading:i.loading,priority:i.fetchPriority}));
  // Decode the actual selected resource, rather than img.naturalWidth (density corrected for srcset).
  const selected=path.join(directory,new URL(value.src).pathname);const sharp=(await import('sharp')).default;const meta=await sharp(selected).metadata();
  const row={name,...value,encodedWidth:meta.width,bytes:fs.statSync(selected).size};results.push(row);
  try{assert.ok(value.srcset,'responsive candidates are exposed in HTML');assert.ok(meta.width<=maxWidth,`${name}: unnecessary ${meta.width}px image`);assert.ok(meta.width>=Math.min(1024,value.width*dpr),'do not undersupply source pixels');assert.match(value.original,/\/hero.webp$/,'full-size evidence link stays original');assert.equal(value.loading,'eager');assert.equal(value.priority,'high');assert.deepEqual(bad,[]);}catch(e){failures.push(e.message);}
  await context.close();
 }
 console.log(JSON.stringify({results,failures},null,2));assert.deepEqual(failures,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
