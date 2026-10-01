// usage: node run-bench.mjs <port> <file-url-path> <outjson> [shot.png]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [port, file, outp, shot] = process.argv.slice(2);
const browser = await puppeteer.launch({executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-unsafe-swiftshader=false', '--disable-gpu-vsync', '--disable-frame-rate-limit']});
const profiles = [
  {name: 'phone-390x844@3-cpu4x', w: 390, h: 844, dpr: 3, cpu: 4, mobile: true},
  {name: 'phone-390x844@2-cpu4x', w: 390, h: 844, dpr: 2, cpu: 4, mobile: true},
  {name: 'desktop-1280x800@1', w: 1280, h: 800, dpr: 1, cpu: 1, mobile: false},
];
const out = {file, profiles: {}};
const page0 = await browser.newPage();
await page0.goto(`http://127.0.0.1:${port}/bench.html?mode=ksplat&file=${file}`);
await page0.waitForFunction('window.RESULT && window.RESULT.done', {timeout: 600000});
out.ksplat = await page0.evaluate('window.RESULT'); await page0.close();
for (const p of profiles) {
  const page = await browser.newPage();
  await page.setViewport({width: p.w, height: p.h, deviceScaleFactor: p.dpr, isMobile: p.mobile, hasTouch: p.mobile});
  const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', {rate: p.cpu});
  await page.goto(`http://127.0.0.1:${port}/bench.html?file=${file}&frames=240`);
  await page.waitForFunction('window.RESULT && window.RESULT.done', {timeout: 600000});
  out.profiles[p.name] = await page.evaluate('window.RESULT');
  if (shot && p.dpr === 2) await page.screenshot({path: shot});
  console.log(p.name, JSON.stringify(out.profiles[p.name]));
  await page.close();
}
fs.writeFileSync(outp, JSON.stringify(out, null, 1));
await browser.close();
