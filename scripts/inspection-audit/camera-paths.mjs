#!/usr/bin/env node
/** Camera coherence capture (desktop Chromium; not device evidence): reach the SAME zoom+focus by different paths,
 * wait until truly settled, save the settled hero screenshot per (target, path). Analysis: camera-coherence.py.
 * OUT_DIR(+BASE_PATH) static export; SHOTS=<dir>. Tiles from the local clone. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43800", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo", SHOTS = process.env.SHOTS;
fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const TARGETS = (process.env.TARGETS ? JSON.parse(process.env.TARGETS) : [[2, 0.44, 0.28], [4, 0.44, 0.28], [6, 0.44, 0.28], [8, 0.44, 0.28], [6, 0.7, 0.6]]);
const PATHS = { direct: () => [], ladder: (z) => [[2, 0.5, 0.5], [4, 0.5, 0.5]].filter((s) => s[0] < z), overshoot: () => [[9, 0.5, 0.5]], panafter: (z) => [[z, 0.5, 0.5]] };
async function session(steps, target) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.route("**/quackles-assets/**", async (route) => {
    const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
  await page.waitForTimeout(2200);
  const settle = async () => { let lastD = -1, since = Date.now(), calm = 0;
    for (let i = 0; i < 220; i++) { const st = await page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { d: q.drawCount, moving: c.cameraMoving, dz: Math.abs(c.zoom - c.targetZoom), df: Math.max(Math.abs(c.focusX - c.targetFocusX), Math.abs(c.focusY - c.targetFocusY)) }; });
      if (st.d !== lastD) { lastD = st.d; since = Date.now(); } // converged = the camera has snapped exactly onto its target (invisible creep after cameraMoving=false takes ~650 ms)
      calm = !st.moving && st.dz < 1e-9 && st.df < 1e-9 && Date.now() - since > 900 ? calm + 1 : 0; if (calm >= 6) return; await page.waitForTimeout(80); } };
  for (const [z, x, y] of [...steps, target]) { await page.evaluate(([a, b, c]) => window.__QUACKLES_INSPECTION__.setTarget(a, b, c), [z, x, y]); await settle(); }
  if (process.env.EXTRA_WAIT_MS) await page.waitForTimeout(+process.env.EXTRA_WAIT_MS);
  const png = await page.screenshot();
  // base-only view: hide the detail canvas to measure plate<->detail alignment (the visible warp at sharp lock)
  await page.evaluate(() => { document.querySelector('.sequence-detail').style.visibility = 'hidden'; }); const baseOnly = await page.screenshot(); const info = await page.evaluate(() => { const d = document.querySelector(".sequence-detail"); return { w: window.__QUACKLES_SEQUENCE__.getState().detailWidth, left: d.style.left, top: d.style.top, width: d.style.width, height: d.style.height }; });
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await page.close(); return { png, baseOnly, info };
}
const meta = [];
for (const t of TARGETS) for (const [name, steps] of Object.entries(PATHS)) {
  const s = await session(steps(t[0]), t); const id = `z${t[0]}-f${t[1]}_${t[2]}-${name}`;
  fs.writeFileSync(`${SHOTS}/${id}.png`, s.png); fs.writeFileSync(`${SHOTS}/${id}-baseonly.png`, s.baseOnly); meta.push({ id, target: t, path: name, ...s.info }); console.error("captured", id, s.info.w);
}
fs.writeFileSync(`${SHOTS}/meta.json`, JSON.stringify(meta, null, 1)); await browser.close(); server.kill();
