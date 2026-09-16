#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright-core')); }
catch { ({chromium}=require(process.env.PLAYWRIGHT_PATH || '/home/kvn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const dir = path.resolve(process.argv[2]);
const report = JSON.parse(await fs.readFile(path.join(dir, 'report.json'), 'utf8'));
const renderer = report.initial?.canvas?.map(canvas => canvas.renderer).filter(Boolean).join('; ') || 'Renderer unavailable';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
const style = `*{box-sizing:border-box}body{background:#13151a;color:#e7e8ed;font:14px system-ui;margin:0;padding:24px}h1{font-size:22px}p{color:#b7becf}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;background:#20242d;padding:6px}img{width:100%;display:block}figcaption{padding:8px 0;font-size:12px}a{color:inherit}`;
const panels = [];
for (const theme of [...new Set(report.visualSamples.map(x => x.theme))]) {
  const samples = report.visualSamples.filter(x => x.theme === theme);
  for (let offset = 0; offset < samples.length; offset += 25) {
    const chunk = samples.slice(offset, offset + 25);
    const name = `contact-${theme.toLowerCase()}-${Math.floor(offset / 25) + 1}`;
    const html = `<!doctype html><meta charset="utf-8"><title>Quackles ${theme} scroll frames</title><style>${style}</style><h1>${theme} · deterministic scroll inspection</h1><p>${chunk.length} sampled positions · screenshots taken separately from timing · ${report.label}</p><div class="grid">${chunk.map(x => `<figure><img src="${x.image}"><figcaption>${(x.progress * 100).toFixed(2)}% · E ${(x.state?.explode ?? 0).toFixed(2)} · J ${(x.state?.jump ?? 0).toFixed(2)}</figcaption></figure>`).join('')}</div>`;
    await fs.writeFile(path.join(dir, `${name}.html`), html);
    await page.goto(`file://${path.join(dir, `${name}.html`)}`);
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
    panels.push({ theme, image: `${name}.png`, html: `${name}.html` });
  }
}
const overview = report.visualSamples.filter(x => x.theme === 'White').filter((x, i, all) => i % Math.max(1, Math.round((all.length - 1) / 10)) === 0);
const html = `<!doctype html><meta charset="utf-8"><title>Quackles mobile validation</title><style>${style}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{text-align:left;padding:9px;border-bottom:1px solid #343944}.grid{grid-template-columns:repeat(4,1fr)}</style><h1>Quackles · mobile validation evidence</h1><p>Browser emulation evidence; physical Galaxy S25 120 Hz remains unverified.</p><p>${renderer}</p><p>Build: <code>${report.buildId}</code><br>Source: ${report.sourceRevision || "See served document hash"}<br>Served HTML SHA256: <code>${report.servedDocument?.sha256 || "unavailable"}</code></p><p>${report.performanceNote || "Visual samples establish sampled appearance and state only. See the separately recorded timing runs and host-load caveats."}</p><p>Idle median ${report.idle.p50.toFixed(2)} ms. ${report.visualSamples.length} deterministic captures${report.prototype ? ' at selected prototype checkpoints' : ''}. Timing runs exclude screenshots.</p><table><tr><th>Viewport / pass</th><th>P95 / P99</th><th>Max</th><th>Missed intervals</th><th>React commits</th></tr>${report.timings.map(x=>`<tr><td>${x.viewport.width}×${x.viewport.height} / ${x.direction}</td><td>${x.statistics.p95.toFixed(1)} / ${x.statistics.p99.toFixed(1)} ms</td><td>${x.statistics.max.toFixed(1)} ms</td><td>${x.statistics.missedIntervals}/${x.statistics.samples}</td><td>${x.reactCommits}</td></tr>`).join('')}</table><div class="grid">${overview.map(x => `<figure><a href="${x.image}"><img src="${x.image}"></a><figcaption>Scroll ${(x.progress*100).toFixed(1)}%</figcaption></figure>`).join('')}</div><h2>All sampled frames</h2><ul>${panels.map(x => `<li><a href="${x.html}">${x.html}</a> · <a href="${x.image}">contact sheet PNG</a></li>`).join('')}</ul><p><a href="report.json">Raw per-frame trace and scene state</a></p>`;
await fs.writeFile(path.join(dir,'index.html'),html);
await page.goto(`file://${path.join(dir,'index.html')}`);
await page.screenshot({ path: path.join(dir,'overview.png'), fullPage: true });
await browser.close();
console.log(JSON.stringify({ directory: dir, contactSheets: panels }));
