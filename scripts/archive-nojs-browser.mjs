import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve(),browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']}),results=[];
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},javaScriptEnabled:false});await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});
 const state=await page.evaluate(()=>({pairs:document.querySelectorAll('.lineage-comparison').length,links:document.querySelectorAll('.lineage-preview[href]').length,fallback:document.querySelector('noscript').textContent,overflow:document.documentElement.scrollWidth>innerWidth,dataset:document.querySelector('noscript a').href}));
 assert.equal(state.pairs,5);assert.equal(state.links,10);assert.match(state.fallback,/complete public dataset/);assert.equal(state.overflow,false);const data=await(await page.request.get(state.dataset)).json();assert.equal(data.entries.length,665);results.push({width,...state});await page.close();
}if(process.env.ARTIFACTS){await mkdir(process.env.ARTIFACTS,{recursive:true});await writeFile(process.env.ARTIFACTS+'/no-js.json',JSON.stringify(results,null,2));}console.log('PASS no-JS 390/1440: five pairs, ten links, complete 665-version dataset, no overflow');}finally{await browser.close();await server.close();}
