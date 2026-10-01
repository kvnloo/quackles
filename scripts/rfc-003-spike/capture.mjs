#!/usr/bin/env node
// RFC-003 spike capture driver: full-frame parity captures, zoomed detail captures and phone-profile frame timing.
// usage: ASSETS=<export dir> OUT=<capture dir> node capture.mjs [frames|zoom|timing|all]
// Run through /home/kvn/zer0/quackles-work/slot.sh browser.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT, PORT = process.env.PORT || "49603", what = process.argv[2] || "all";
fs.mkdirSync(OUT, { recursive: true });
const server = spawn("node", [path.join(HERE, "serve.mjs")], { env: { ...process.env, PORT }, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/chromium", headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan",
    "--disable-vulkan-surface", "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const report = fs.existsSync(path.join(OUT, "capture.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "capture.json"))) : {};
const save = () => fs.writeFileSync(path.join(OUT, "capture.json"), JSON.stringify(report, null, 1));

async function shot(name, params, o = {}) {
  for (let i = 0; ; i++) {  // a fresh context occasionally comes up with a lost WebGL context; retry those
    const st = await shotOnce(name, params, o);
    if (st.info && st.info.gpu) return st;
    if (i === 2) throw new Error(`${name}: no WebGL context after 3 tries`);
    console.warn(name, "lost context, retrying");
  }
}
async function shotOnce(name, params, { w = 1024, h = 1536, dpr = 1, mobile = false, throttle = 0, timeout = 120000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.error(name, m.text()); });
  if (throttle) { const s = await ctx.newCDPSession(page); await s.send("Emulation.setCPUThrottlingRate", { rate: throttle }); }
  const qs = new URLSearchParams({ w, h, dpr, ...params });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/index.html?${qs}`);
  await page.waitForFunction(() => window.__rfc003 && (window.__rfc003.ready || window.__rfc003.error), null, { timeout });
  const st = await page.evaluate(() => { const s = window.__rfc003; return { error: s.error, info: s.info, vt: s.vt, frames: s.frames, gpuMs: s.gpuMs }; });
  st.wallMs = Date.now() - t0;
  if (st.error) throw new Error(`${name}: ${st.error}`);
  if (!params.anim) {
    await page.waitForTimeout(300);
    const url = await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
  }
  await ctx.close();
  console.log(name, JSON.stringify({ info: st.info, vt: st.vt, wallMs: st.wallMs }));
  return st;
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };

try {
  if (what === "frames" || what === "all") {
    for (const [name, p] of [["mask", { mode: "mask" }], ["density", { mode: "density" }], ["bake-2k", { mode: "bake", res: "2k" }], ["bake-4k", { mode: "bake", res: "4k" }],
      ["bake-8k", { mode: "bake", res: "8k" }], ["pbr", { mode: "pbr" }]]) report[name] = { info: (await shot(name, p)).info };
    save();
  }
  if (what === "zoom" || what === "all") {
    // 8x zoom rects (normalised plate coords, 2:3 like the canvas) on the robot's macro hotspots.
    const ZOOMS = { head: [0.43, 0.27, 0.125, 0.125], body: [0.60, 0.455, 0.125, 0.125] };
    for (const [z, r] of Object.entries(ZOOMS)) {
      const zoom = r.join(",");
      for (const [name, p] of [["bake-2k", { mode: "bake", res: "2k" }], ["bake-8k", { mode: "bake", res: "8k" }],
        ["vt", { mode: "bake", res: "2k", vt: "1" }], ["mask", { mode: "mask" }], ["pbr", { mode: "pbr" }]]) {
        const st = await shot(`zoom-${z}-${name}`, { ...p, zoom });
        report[`zoom-${z}-${name}`] = { zoom: r, info: st.info, vt: st.vt, wallMs: st.wallMs };
      }
    }
    save();
  }
  if (what === "timing" || what === "all") {
    // Phone profile used by the repo's mobile suites: 430x932 CSS px, DPR 2, touch, + 4x CPU throttle.
    for (const [name, p] of [["bake-2k", { mode: "bake", res: "2k" }], ["bake-8k", { mode: "bake", res: "8k" }], ["vt", { mode: "bake", res: "2k", vt: "1" }], ["pbr", { mode: "pbr" }]]) {
      const st = await shot(`timing-${name}`, { ...p, anim: "1", frames: "300" }, { w: 430, h: 932, dpr: 2, mobile: true, throttle: 4, timeout: 300000 });
      const f = st.frames.slice(30), g = st.gpuMs.slice(30);
      report[`timing-${name}`] = { info: st.info, rafP50: pct(f, 50), rafP95: pct(f, 95), rafMax: Math.max(...f),
        over8_33: f.filter((x) => x > 1000 / 120 + 0.25).length, n: f.length,
        gpuP50: g.length ? pct(g, 50) : null, gpuP95: g.length ? pct(g, 95) : null };
      console.log(name, JSON.stringify(report[`timing-${name}`]));
    }
    save();
  }
} finally { await browser.close(); server.kill(); }
