import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serve} from './lineage-server.mjs';
const server=await serve({directory:process.env.OUT_DIR||'out'});
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto(server.url+'/lineage/',{waitUntil:'networkidle'});await page.waitForSelector('[data-ready=true]');
 const range=page.locator('[data-timeline-range]');await range.press('Home');await page.waitForTimeout(50);
 const start=Number(await page.locator('.tl-instrument').getAttribute('data-position'));
 await range.press('ArrowRight');await page.waitForTimeout(50);
 assert.equal(Number(await page.locator('.tl-instrument').getAttribute('data-position')),start+1,'one key must step exactly one version, including equal timestamps');
 await range.press('ArrowLeft');await page.waitForTimeout(250);
 assert.equal(Number(await page.locator('.tl-instrument').getAttribute('data-position')),start);
 await page.reload({waitUntil:'networkidle'});await page.waitForSelector('[data-ready=true]');
 assert.equal(Number(await page.locator('.tl-instrument').getAttribute('data-position')),start,'equal-time version deep link survives reload');
 console.log('Equal-time versions: exact key stepping and URL roundtrip PASS');
} finally {await browser.close();await server.close();}
