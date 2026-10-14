// EMULATION only: isolated headless Chromium; no desktop or ComfyUI process control.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const artifacts=resolve(process.env.ARTIFACTS || '/mnt/zer0models/project-artifacts/quackles/process/theme-engine/v2');
await mkdir(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
async function serve(root) {
 root=resolve(root);
 const server=createServer(async(req,res)=>{
  try {
   let name=decodeURIComponent(new URL(req.url,'http://local').pathname);if(name.endsWith('/'))name+='index.html';
   const path=resolve(root,'.'+name);if(!path.startsWith(root+sep))throw Error('Outside root');
   const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,url:`http://127.0.0.1:${server.address().port}/`};
}
const owned=[];let browser;
const errors=[],checks=[];
try {
 const candidate=await serve(process.env.EDITOR_OUT || 'out');owned.push(candidate.server);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
 // Real shipped detail assets; this is URL routing, not generated fixture imagery.
 await context.route('**/quackles-assets/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   try {await route.fulfill({response:await route.fetch({url:'https://kvnloo.github.io'+path,timeout:20000})});}
   catch {await route.abort();}
 });
 async function ready(page,url) {
  await page.goto(url);await page.waitForFunction(()=>window.__QUACKLES_SEQUENCE__?.getState().ready);
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
 }
 if(process.env.BASELINE_OUT) {
  const baseline=await serve(process.env.BASELINE_OUT);owned.push(baseline.server);
  const page=await context.newPage();await ready(page,baseline.url);
  await page.screenshot({path:`${artifacts}/baseline-normal.png`});await page.close();
 }
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await ready(page,candidate.url);
 assert.equal((await page.request.get(candidate.url+'studio/')).status(),404);
 await page.screenshot({path:`${artifacts}/home-normal.png`});
 const toggleBox=await page.locator('.editor-toggle').boundingBox();
 await writeFile(`${artifacts}/edit-toggle-box.json`,JSON.stringify(toggleBox));
 // Comparison deliberately excludes only the newly requested Edit control.
 await page.locator('.editor-toggle').evaluate(e=>e.style.visibility='hidden');
 await page.screenshot({path:`${artifacts}/home-normal-without-toggle.png`});
 await page.locator('.editor-toggle').evaluate(e=>e.style.visibility='');
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.waitForSelector('.poster-frame[data-editing=true]');
 const point=await page.evaluate(async()=>{
  const manifest=await (await fetch('/editor/blue/parts.json')).json();
  const img=await createImageBitmap(await (await fetch('/editor/blue/mask.png')).blob());
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
  const ids=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const part=manifest.parts.find(p=>p.id===1),[x,y,w,h]=part.bbox;
  let best=null,dist=Infinity;
  for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)if(ids[(cy*c.width+cx)*4]===1){const d=(cx-x-w/2)**2+(cy-y-h/2)**2;if(d<dist){dist=d;best={x:cx/c.width,y:cy/c.height};}}
  const rect=document.querySelector('.poster-frame').getBoundingClientRect();return {x:rect.x+best.x*rect.width,y:rect.y+best.y*rect.height};
 });
 await page.mouse.move(point.x,point.y);await page.waitForTimeout(100);
 await page.screenshot({path:`${artifacts}/edit-hover.png`});
 await page.mouse.click(point.x,point.y);
 await page.waitForFunction(()=>window.__QUACKLES_INSPECTION__.getState().zoom>1.1);
 assert.equal(await page.locator('#editor-part').inputValue(),'1');
 await page.mouse.move(1250,200);await page.waitForTimeout(1200);
 await page.screenshot({path:`${artifacts}/edit-selected.png`});
 checks.push('real indexed mask pointer hit','existing inspection camera target','panel selected head');
 await page.getByLabel('Tint colour').fill('#78bba0');
 await page.waitForFunction(()=>document.querySelector('.editor-plate-edits')?.getContext('2d').getImageData(0,0,1024,1536).data.some((v,i)=>i%4===3&&v>0));
 await page.getByRole('button',{name:'Show before',exact:true}).click();
 assert.equal(await page.locator('.editor-plate-edits').evaluate(e=>getComputedStyle(e).visibility),'hidden');
 await page.getByRole('button',{name:'Show after',exact:true}).click();
 await page.screenshot({path:`${artifacts}/edit-tone.png`});
 await page.waitForFunction(()=>document.querySelector('.editor-message')?.textContent==='Saved on this device');
 await page.reload();await page.waitForSelector('.editor-plate-edits');
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.waitForSelector('.poster-frame[data-editing=true]');
 await page.getByLabel('Part',{exact:true}).selectOption('1');
 assert.equal(await page.getByLabel('Tint colour').inputValue(),'#78bba0');checks.push('instant tint','before/after','IndexedDB reload');
 if(!process.argv.includes('--live')) {
  await page.waitForFunction(()=>document.querySelector('.editor-connection')?.textContent.includes('connected ·'));
  await page.locator('.editor-connection').click();
  await page.getByLabel('Local endpoint').fill('http://127.0.0.1:1');
  assert.equal(await page.locator('.editor-connection').textContent(),'ComfyUI not connected','Changing an endpoint must invalidate old detection');
  await page.getByLabel('Local endpoint').fill('http://127.0.0.1:8188');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.editor-connection')?.textContent.includes('connected ·'));
  await page.locator('.editor-connection').click();checks.push('endpoint changes invalidate connection');
 }
 if(process.argv.includes('--live')) {
  try {await stat(`${artifacts}/generation-attempt.json`);throw Error('Existing attempt: inspect before any resubmission.');}catch(e){if(e.code!=='ENOENT')throw e;}
  const queue=await (await fetch('http://127.0.0.1:8188/queue')).json();assert.equal(queue.queue_running.length+queue.queue_pending.length,0,'Do not interrupt another job');
  await page.getByRole('button',{name:'Revert part',exact:true}).click();
  await page.locator('#editor-prompt').fill('Change only the robot head outer shell to subtle pale sage satin ceramic. Keep the black eye, internal mechanics, all edges, shape and highlights unchanged. No new geometry or text.');
  await page.waitForFunction(()=>document.querySelector('.editor-connection')?.textContent.includes('ChatGPT'));
  await writeFile(`${artifacts}/generation-attempt.json`,JSON.stringify({classification:'REAL ComfyUI ChatGPT edit from EMULATION home editor',submissions:1,startedAt:new Date().toISOString()},null,2),{flag:'wx'});
  const submitted=page.waitForResponse(r=>r.url()==='http://127.0.0.1:8188/prompt' && r.request().method()==='POST');
  await page.getByRole('button',{name:'Generate image edit',exact:true}).click();
  const response=await submitted,queued=await response.json();
  await writeFile(`${artifacts}/generation-request.json`,response.request().postData());
  await writeFile(`${artifacts}/generation-queued.json`,JSON.stringify(queued,null,2));
  await page.getByRole('button',{name:'Apply to robot head',exact:true}).waitFor({timeout:620000});
  const history=await (await fetch(`http://127.0.0.1:8188/history/${queued.prompt_id}`)).json();assert.equal(history[queued.prompt_id].status.completed,true);
  await writeFile(`${artifacts}/generation-history.json`,JSON.stringify(history,null,2));
  await page.getByRole('button',{name:'Apply to robot head',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.editor-message')?.textContent==='Saved on this device');
  await page.waitForTimeout(800);await page.screenshot({path:`${artifacts}/edit-generated.png`});
  const stored=await page.evaluate(async()=>{
   const db=await new Promise((res,rej)=>{const r=indexedDB.open('quackles.plate-editor.v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
   const get=(store,key)=>new Promise(res=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result)});
   const json=await get('themes','blue'),theme=JSON.parse(json),edit=theme.partEdits['1'],blob=await get('patches',edit.patchKey);
   const encoded=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(blob)});db.close();return {theme,patch:encoded};
  });
  await writeFile(`${artifacts}/generated-theme.json`,JSON.stringify(stored.theme,null,2));
  await writeFile(`${artifacts}/generated-patch.png`,Buffer.from(stored.patch.split(',')[1],'base64'));
  checks.push('one REAL ChatGPT submission','history completed read-back','generated patch apply and IndexedDB blob read-back');
 }
 await page.getByRole('button',{name:'Revert part',exact:true}).click();
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__QUACKLES_INSPECTION__.getState().zoom===1);
 assert.equal(await page.locator('.editor-panel').count(),0);checks.push('revert','Escape returns home');
 for(const id of ['day','white','blue','dark','night']) {
  await page.getByTestId(`theme-${id}`).click();await page.waitForTimeout(500);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.waitForSelector('.poster-frame[data-editing=true]');
  await page.getByLabel('Part',{exact:true}).selectOption('1');await page.waitForTimeout(300);
  await page.screenshot({path:`${artifacts}/edit-${id}.png`});await page.keyboard.press('Escape');
 }
 checks.push('five theme masks load and select');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.waitForSelector('.poster-frame[data-editing=true]');
 await page.getByLabel('Part',{exact:true}).selectOption('1');await page.waitForTimeout(500);
 await page.screenshot({path:`${artifacts}/edit-mobile.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await writeFile(`${artifacts}/smoke.json`,JSON.stringify({classification:'EMULATION: headless Chromium + SwiftShader; not real GPU proof',checks,errors,live:process.argv.includes('--live')},null,2));
 console.log('PASS home editor smoke (EMULATION)',checks);
} finally {await browser?.close();await Promise.all(owned.map(server=>new Promise(r=>server.close(r))));}
