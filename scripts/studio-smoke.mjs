import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('out');
const artifacts=process.env.ARTIFACTS || 'artifacts/studio';
await mkdir(artifacts,{recursive:true});
await stat(resolve(root,'studio/index.html')); // route must exist in the static export
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {
    let name=decodeURIComponent(new URL(req.url,'http://local').pathname);
    if(name.endsWith('/')) name+='index.html';
    const file=resolve(root,'.'+name);
    if(!file.startsWith(root+sep)) throw Error('outside root');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/studio/`;
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.getByRole('heading',{name:'Robot theme studio'}).waitFor();
  await page.locator('[data-scene-ready="true"]').waitFor({timeout:120000});
  assert.equal(await page.locator('canvas').count(),1);
  for (const name of ['Day','White','Blue','Dark','Night']) assert.equal(await page.getByRole('button',{name,exact:true}).count(),1);
  const before=await page.locator('canvas').evaluate(c=>c.toDataURL());
  await page.getByRole('button',{name:'Blue',exact:true}).click();
  await page.waitForFunction(old=>document.querySelector('canvas').toDataURL()!==old,before);
  await page.getByLabel('Theme name').fill('Smoke saved blue');
  await page.getByRole('button',{name:'Save locally',exact:true}).click();
  await page.getByRole('button',{name:'Day',exact:true}).click();
  await page.getByRole('button',{name:'Load saved',exact:true}).click();
  assert.equal(await page.getByLabel('Theme name').inputValue(),'Smoke saved blue');
  const jsonDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  await (await jsonDownload).saveAs(`${artifacts}/theme.json`);
  const exported=JSON.parse(await readFile(`${artifacts}/theme.json`,'utf8'));
  assert.equal(exported.name,'Smoke saved blue');
  await page.getByRole('button',{name:'Day',exact:true}).click();
  await page.getByLabel('Import theme JSON').setInputFiles(`${artifacts}/theme.json`);
  await page.waitForFunction(()=>document.querySelector('input:not([type])')?.value==='Smoke saved blue');
  assert.equal(await page.getByLabel('Theme name').inputValue(),'Smoke saved blue');
  const pngDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export PNG',exact:true}).click();
  await (await pngDownload).saveAs(`${artifacts}/hero.png`);
  const png=await readFile(`${artifacts}/hero.png`);
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.ok(png.length>10000);
  // This input is a real export, not fabricated generation output.
  for (const slot of ['shell','stone','print','poster','background']) {
    await page.getByLabel('Texture slot').selectOption(slot);
    const untextured=await page.locator('canvas').evaluate(c=>c.toDataURL());
    await page.getByLabel('Upload texture').setInputFiles(`${artifacts}/hero.png`);
    await page.getByRole('button',{name:'Clear texture',exact:true}).waitFor();
    await page.waitForFunction(old=>document.querySelector('canvas').toDataURL()!==old,untextured);
    await page.locator('[data-scene-ready="true"]').waitFor();
    await page.getByRole('button',{name:'Clear texture',exact:true}).click();
    await page.locator('[data-scene-ready="true"]').waitFor();
  }
  await page.getByLabel('Texture slot').selectOption('shell');
  await page.screenshot({path:`${artifacts}/studio-desktop.png`,fullPage:true});
  // Deterministic UI replay, not another paid generation. Use recorded real output when supplied.
  const replay=process.env.STUDIO_REPLAY_IMAGE ? await readFile(process.env.STUDIO_REPLAY_IMAGE) : png;
  let submitted=0, uploaded=false;
  let releaseDetection, detectionStarted;
  const detectionGate=new Promise(resolve=>{releaseDetection=resolve;});
  const detectionSeen=new Promise(resolve=>{detectionStarted=resolve;});
  let gateFirstDetection=true;
  await page.route('http://127.0.0.1:18188/**',async route=>{
    const request=route.request(); const path=new URL(request.url()).pathname;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'};
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
    let data;
    if(path.startsWith('/object_info')) {
      if(gateFirstDetection) {gateFirstDetection=false;detectionStarted();await detectionGate;}
      data={CodexChatGPTImage:{},SaveImage:{},LoadImage:{}};
    }
    else if(path==='/upload/image') {uploaded=true;assert.ok(request.postDataBuffer().length>10000);data={name:'hero.png'};}
    else if(path==='/prompt') {
      submitted++;
      const graph=request.postDataJSON().prompt;
      assert.equal(graph['1'].class_type,'CodexChatGPTImage');
      assert.deepEqual(graph['1'].inputs.image,['3',0]);
      assert.equal(graph['1'].inputs.size,'1024x1536');
      data={prompt_id:'ui-replay'};
    } else if(path==='/history/ui-replay') data={'ui-replay':{status:{completed:true},outputs:{'2':{images:[{filename:'recorded.png'}]}}}};
    else if(path==='/view') return route.fulfill({status:200,contentType:'image/png',headers,body:replay});
    else throw Error(`Unexpected replay request: ${path}`);
    return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(data)});
  });
  await page.getByLabel('Harness URL').fill('http://127.0.0.1:18188');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await detectionSeen;
  await page.getByLabel('Harness URL').fill('http://127.0.0.1:18189');
  const staleResponse=page.waitForResponse(r=>r.url().endsWith(':18188/object_info/CodexChatGPTImage'));
  releaseDetection(); await (await staleResponse).finished();
  // Let the returned body and React commit settle after the explicitly gated response.
  await page.waitForTimeout(300);
  assert.equal(await page.getByText('Connected: ChatGPT subscription',{exact:true}).count(),0,'stale detection must not reconnect an old URL');
  await page.getByLabel('Harness URL').fill('http://127.0.0.1:18188');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByText('Connected: ChatGPT subscription',{exact:true}).waitFor();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Restyle hero',exact:true}).click();
  await page.getByAltText('Harness generated result').waitFor({timeout:60000});
  assert.equal(submitted,1);assert.equal(uploaded,true);
  await page.getByAltText('Harness generated result').evaluate(img=>img.decode());
  const resultDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download result',exact:true}).click();
  await (await resultDownload).saveAs(`${artifacts}/ui-result.png`);
  assert.deepEqual(await readFile(`${artifacts}/ui-result.png`),replay);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${artifacts}/studio-restyle-replay.png`,fullPage:true});
  await page.getByRole('button',{name:'Apply to Robot shell',exact:true}).click();
  await page.getByRole('button',{name:'Clear texture',exact:true}).waitFor();
  await page.locator('[data-scene-ready="true"]').waitFor();
  await page.getByRole('button',{name:'Clear texture',exact:true}).click();
  await page.locator('[data-scene-ready="true"]').waitFor();
  if(process.env.STUDIO_LIVE_DETECT==='1') {
    await page.unroute('http://127.0.0.1:18188/**');
    await page.getByLabel('Harness URL').fill('http://127.0.0.1:8188');
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    try {await page.getByText('Connected: ChatGPT subscription',{exact:true}).waitFor({timeout:10000});}
    catch(e) {console.error('LIVE DETECT',await page.getByRole('status').allTextContents());throw e;}
    await page.locator('aside').screenshot({path:`${artifacts}/live-comfy-connection.png`});
  }
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:`${artifacts}/studio-dark.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${artifacts}/studio-mobile.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  await writeFile(`${artifacts}/smoke.json`,JSON.stringify({classification:'EMULATION: headless Chromium + SwiftShader, not real GPU evidence',url,checks:['static route','GLB decoded','five preset controls','live preset pixels','local save/load','JSON export/import','PNG export','five texture slots upload/clear with pixel changes','restyle UI via mocked HTTP replay','reference upload and one submission','result download byte equality','apply generated texture','responsive layout','no page errors'],replay:process.env.STUDIO_REPLAY_IMAGE || 'exported hero fixture (not generated)',liveDetection:process.env.STUDIO_LIVE_DETECT==='1',pngBytes:png.length,errors},null,2));
  console.log('PASS /studio static smoke (EMULATION)',artifacts);
} finally {await browser?.close(); await new Promise(r=>server.close(r));}
