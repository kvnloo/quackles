import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from './lineage-server.mjs';
// Install the evidence tool outside the app: npm install --prefix "$TMPDIR/lineage-audit" lighthouse.
const modules=process.env.AUDIT_MODULES;
if(!modules)throw new Error('Set AUDIT_MODULES to the external audit node_modules directory');
const {default:lighthouse}=await import(pathToFileURL(resolve(modules,'lighthouse/core/index.js')));
const {launch}=await import(pathToFileURL(resolve(modules,'chrome-launcher/dist/index.js')));
const artifacts=resolve(process.env.ARTIFACTS||join(process.env.TMPDIR||'.','lineage-evidence'));
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(process.env.TMPDIR || artifacts,'lineage-chrome-'));
const server=await serve();let chrome;
try{
  chrome=await launch({chromePath:process.env.CHROME||'/usr/bin/chromium',chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage'],userDataDir:profile});
  const result=await lighthouse(server.url+'/lineage/',{port:chrome.port,output:['json','html'],logLevel:'error',onlyCategories:['performance','accessibility'],formFactor:'mobile',throttlingMethod:'simulate'});
  await writeFile(join(artifacts,'lighthouse.json'),result.report[0]);
  await writeFile(join(artifacts,'lighthouse.html'),result.report[1]);
  const {lhr}=result;
  const numbers={lighthouseVersion:lhr.lighthouseVersion,emulation:true,assetMirror:'local same-origin asset-repository mirror; not deployed CDN',performance:lhr.categories.performance.score,accessibility:lhr.categories.accessibility.score,LCPms:lhr.audits['largest-contentful-paint'].numericValue,CLS:lhr.audits['cumulative-layout-shift'].numericValue,TBTms:lhr.audits['total-blocking-time'].numericValue,settings:lhr.configSettings.throttling};
  await writeFile(join(artifacts,'lighthouse-numbers.json'),JSON.stringify(numbers,null,2));
  console.log(JSON.stringify(numbers,null,2));
  assert.ok(numbers.LCPms<2000,'LCP <2s simulated mobile');assert.equal(numbers.CLS,0,'CLS zero');
}finally{await chrome?.kill();await server.close();await rm(profile,{recursive:true,force:true});}
