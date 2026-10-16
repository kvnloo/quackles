import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OWNER_REVIEW_BROWSER_MODULE);
const browser = await chromium.launch({executablePath:process.env.OWNER_REVIEW_CHROME,headless:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.argv[2]);
  await page.waitForSelector('body[data-ready=true]');
  if(process.argv[3]!=='quote-only'){
  await page.locator('#candidate-image').evaluate(img => img.decode());
  const pixel = await page.locator('#candidate-image').evaluate(img => {
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const context=canvas.getContext('2d');context.drawImage(img,0,0);
    return [img.naturalWidth,img.naturalHeight,...context.getImageData(0,0,1,1).data];
  });
  assert.deepEqual(pixel,[5,8,255,0,0,255]);
  }
  await page.getByRole('button',{name:'From chat',exact:false}).click();
  await page.waitForFunction(() => document.getElementById('quote').textContent.includes('Synthetic example: keep this edge.'));
  assert.match(await page.locator('#history-status').textContent(), /from chat.*2026-01-02/i);
  assert.equal(await page.locator('#aspect').inputValue(), 'edges');
  if(process.argv[3]==='quote-only')assert.equal(await page.locator('#judge-mode').inputValue(),'');
  assert.equal(await page.locator('#pair').isChecked(),true);
  assert.equal(await page.locator('#other').inputValue(),'B');
  assert.match(await page.locator('#preference').textContent(),/Right preferred/);
  assert.equal(await page.locator('[data-verdict=accept]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#stars [aria-pressed=true]').count(),0);
  assert.equal(await page.locator('#save').isEnabled(),true);
  await page.locator('#title').click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Saved accept'));
  await page.getByRole('button',{name:'Element evidence',exact:false}).click();
  assert.equal(await page.locator('[data-verdict=direction]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#binding').isVisible(),false);
  assert.equal(await page.locator('#save').isEnabled(),true);
  await page.locator('#title').click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Saved direction'));
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
