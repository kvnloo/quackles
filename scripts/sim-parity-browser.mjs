#!/usr/bin/env node
/** Parity REPORT + CONTRACT: the live robot at a story pose vs the authored p1000000 plate, per theme.
 * For each of the five themes and each candidate pose (poseAt(1) = shipped EXPLODED_STORY_PROGRESS, and the old
 * poseAt(0.84)), captures the plate, the live render at the same frame, and a robot-only live render over a key
 * colour, then reports:
 *   - silhouette IoU: plate robot mask (dE76 from the plate backdrop) vs live robot mask (non-key pixels),
 *   - robot dE: mean per-pixel CIE76 dE plate vs live inside the mask intersection (+ dE of the mean colours),
 *   - background dE: same, outside the union of both masks.
 * Screenshots + report.json go to ARTIFACTS (default /mnt/zer0models/project-artifacts/quackles/overnight/sim).
 * GATE=1 (npm run test:sim-parity) turns the report into a contract on poseAt(1): every theme must meet PARITY_GATE
 * (robot dE, background dE, silhouette IoU) or the run exits 1 with the failures listed.
 * OUT_DIR (+BASE_PATH) or TARGET_URL; PORT; ASSETS. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import sharp from "sharp";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "49440", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const ART = process.env.ARTIFACTS || "/mnt/zer0models/project-artifacts/quackles/overnight/sim";
const THEMES = ["day", "white", "blue", "dark", "night"];
const POSES = (process.env.POSES || "1,0.84").split(",").map(Number);
const PLATE_THRESHOLD = Number(process.env.PLATE_DE || 14);
const GATE = process.env.GATE === "1";
/** Contract at poseAt(1), CIE76 dE on sRGB 8-bit captures (swiftshader, 1280x860, DPR 1).
 *  backgroundDE <= 5: the backdrop is a flat camera-ray colour in every plate, so only encoding error remains; 5 dE is
 *    below what reads as "a different grey" side by side (JND ~2.3; 5 = barely noticeable at a seam).
 *  robotMeanColourDE <= 5: dE of the mean robot colour — what the grade (light colour, exposure, tone curve) controls.
 *    A wrong key colour or tone curve costs 8-24 here (baseline); a matched grade lands at 1.4-4.5.
 *  robotDE (per-pixel mean in the mask intersection): TARGET 12 is reported, not gated — lighting/tone alone bottoms
 *    out at 16-25 (texture/material + Cycles GI/area shadows vs raster; the theme-invariant zebra print buys ~2), and
 *    night's robot is only its additive glow, which the live rig has no mask for. The gate is a no-regression ceiling
 *    (measured + ~1.5).
 *  Night: robot colour terms are not gated (glow asset missing); backdrop and IoU are.
 *  silhouetteIoU: geometry is not this contract's subject, but it must not regress below the baseline (-0.02 slack). */
const ROBOT_DE_TARGET = 12;
const PARITY_GATE = {
  day: { robotDE: 25, robotMeanColourDE: 5, backgroundDE: 5, silhouetteIoU: 0.45 },
  white: { robotDE: 18, robotMeanColourDE: 5, backgroundDE: 5, silhouetteIoU: 0.88 },
  blue: { robotDE: 26.5, robotMeanColourDE: 5, backgroundDE: 5, silhouetteIoU: 0.95 },
  dark: { robotDE: 20, robotMeanColourDE: 5, backgroundDE: 5, silhouetteIoU: 0.40 },
  night: { robotDE: null, robotMeanColourDE: null, backgroundDE: 5, silhouetteIoU: 0.29 },
};
fs.mkdirSync(ART, { recursive: true });
const server = process.env.TARGET_URL ? null : spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, server ? 1500 : 0));
const origin = process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })).newPage();
await page.route("**/quackles-assets/**", async (route) => {
  const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
});

// ---- colour math -----------------------------------------------------------------------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LUT = Float64Array.from({ length: 256 }, (_, i) => lin(i));
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
function lab(r, g, b) {
  const R = LUT[r], G = LUT[g], B = LUT[b];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
async function rgba(buffer) { const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
function labs(img) { const out = new Array(img.w * img.h); for (let i = 0; i < out.length; i++) out[i] = lab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]); return out; }
function dilate(mask, w, h, r) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = 1; }
  return out;
}
const median = (values) => { const s = values.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

async function metrics(plateBuf, liveBuf, keyBuf, excludeBuf) {
  const plate = await rgba(plateBuf), live = await rgba(liveBuf), key = await rgba(keyBuf), ui = await rgba(excludeBuf);
  const { w, h } = plate; const n = w * h;
  const P = labs(plate), L = labs(live);
  // Live robot mask: robot-only render over pure magenta.
  const liveMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const r = key.data[i * 4], g = key.data[i * 4 + 1], b = key.data[i * 4 + 2]; liveMask[i] = Math.abs(r - 255) + g + Math.abs(b - 255) > 60 ? 1 : 0; }
  // UI mask (HUD/nav): pixels that differ between the key render and a key render with the canvas hidden are the
  // robot; pixels non-magenta in the canvas-hidden render are UI chrome -> excluded everywhere.
  const exclude = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const r = ui.data[i * 4], g = ui.data[i * 4 + 1], b = ui.data[i * 4 + 2]; exclude[i] = Math.abs(r - 255) + g + Math.abs(b - 255) > 60 ? 1 : 0; }
  // Plate backdrop estimate: median Lab of plate pixels well away from the live robot.
  const far = dilate(liveMask, w, h, 24);
  const bg = [[], [], []];
  for (let i = 0; i < n; i += 3) if (!far[i] && !exclude[i]) for (let c = 0; c < 3; c++) bg[c].push(P[i][c]);
  const backdrop = bg.map(median);
  const plateMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) plateMask[i] = !exclude[i] && dE(P[i], backdrop) > PLATE_THRESHOLD ? 1 : 0;
  let inter = 0, union = 0, robotSum = 0, bgSum = 0, bgN = 0;
  const mp = [0, 0, 0], ml = [0, 0, 0], bp = [0, 0, 0], bl = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (exclude[i]) continue;
    const a = plateMask[i], b = liveMask[i];
    if (a || b) union++;
    if (a && b) { inter++; robotSum += dE(P[i], L[i]); for (let c = 0; c < 3; c++) { mp[c] += P[i][c]; ml[c] += L[i][c]; } }
    if (!a && !b) { bgN++; bgSum += dE(P[i], L[i]); for (let c = 0; c < 3; c++) { bp[c] += P[i][c]; bl[c] += L[i][c]; } }
  }
  const mean = (v, k) => v.map((x) => x / Math.max(1, k));
  let plateOnly = 0, liveOnly = 0; for (let i = 0; i < n; i++) if (!exclude[i]) { if (plateMask[i] && !liveMask[i]) plateOnly++; if (liveMask[i] && !plateMask[i]) liveOnly++; }
  return {
    silhouetteIoU: +(inter / Math.max(1, union)).toFixed(3),
    platePx: plateMask.reduce((a, b) => a + b, 0), livePx: liveMask.reduce((a, b) => a + b, 0), plateOnlyPx: plateOnly, liveOnlyPx: liveOnly,
    robotDE: +(robotSum / Math.max(1, inter)).toFixed(1), robotMeanColourDE: +dE(mean(mp, inter), mean(ml, inter)).toFixed(1),
    backgroundDE: +(bgSum / Math.max(1, bgN)).toFixed(1), backgroundMeanColourDE: +dE(mean(bp, bgN), mean(bl, bgN)).toFixed(1),
    plateBackdropLab: backdrop.map((v) => +v.toFixed(1)),
  };
}

const R = { url: origin, plateThresholdDE: PLATE_THRESHOLD, viewport: [1280, 860], themes: {} };
try {
  await page.goto(new URL("?sim=1", origin).href, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setProgress(1));
  await page.waitForFunction(() => window.__QUACKLES_SIM__?.getState?.().liveReady, null, { timeout: 120000 });
  await page.addStyleTag({ content: ".story-overlays,.hero-copy,.scene-hud,.inspection-viewfinder,[data-testid=sim-enter]{visibility:hidden!important}" });
  const frame = page.locator(".poster-frame");
  const shotTo = async (name) => { const buf = await frame.screenshot(); fs.writeFileSync(path.join(ART, `${name}.png`), buf); return buf; };
  const settle = async (ms = 2500) => { await page.evaluate(() => window.__QUACKLES_INVALIDATE__?.()); await page.waitForTimeout(ms); };
  for (const theme of THEMES) {
    await page.evaluate((t) => window.__QUACKLES_SEQUENCE__.setTheme(t), theme);
    await page.waitForFunction((t) => window.__QUACKLES_SEQUENCE__.getState().rendered?.themes?.join() === t, theme, { timeout: 30000 });
    await page.evaluate(() => window.__QUACKLES_SIM__.debug.live(0, 1));
    await settle(1500);
    const plate = await shotTo(`parity-${theme}-plate-p1000000`);
    R.themes[theme] = {};
    for (const p of POSES) {
      const tag = `pose${String(p).replace(".", "")}`;
      await page.evaluate((v) => window.__QUACKLES_SIM__.debug.live(1, v), p);
      await settle();
      const live = await shotTo(`parity-${theme}-live-${tag}`);
      // Robot-only over a key colour, then the same with the canvas hidden (UI chrome mask).
      await page.evaluate(() => { document.querySelector(".poster-frame").style.background = "#ff00ff"; document.querySelector(".sequence-player").style.opacity = "0"; window.__QUACKLES_SIM__.debug.robotOnly(true); });
      await settle();
      const key = await shotTo(`parity-${theme}-mask-${tag}`);
      await page.evaluate(() => window.__QUACKLES_SIM__.debug.live(0));
      await settle(600);
      const chrome = await frame.screenshot();
      await page.evaluate(() => { window.__QUACKLES_SIM__.debug.robotOnly(false); document.querySelector(".poster-frame").style.background = ""; document.querySelector(".sequence-player").style.opacity = ""; });
      R.themes[theme][tag] = await metrics(plate, live, key, chrome);
      // Side-by-side for review: plate | live | difference.
      const [a, b] = await Promise.all([sharp(plate).raw().toBuffer({ resolveWithObject: true }), sharp(live).raw().toBuffer({ resolveWithObject: true })]);
      const diff = Buffer.alloc(a.data.length);
      for (let i = 0; i < diff.length; i++) diff[i] = Math.min(255, Math.abs(a.data[i] - b.data[i]) * 2);
      await sharp({ create: { width: a.info.width * 3, height: a.info.height, channels: a.info.channels, background: "#000" } })
        .composite([{ input: plate, left: 0, top: 0 }, { input: live, left: a.info.width, top: 0 }, { input: diff, raw: { width: a.info.width, height: a.info.height, channels: a.info.channels }, left: a.info.width * 2, top: 0 }])
        .png().toFile(path.join(ART, `parity-${theme}-compare-${tag}.png`));
      console.error(theme, tag, JSON.stringify(R.themes[theme][tag]));
    }
    await page.evaluate(() => window.__QUACKLES_SIM__.debug.live(null, 1));
  }
  R.summary = Object.fromEntries(POSES.map((p) => { const tag = `pose${String(p).replace(".", "")}`; const rows = THEMES.map((t) => R.themes[t][tag]); return [tag, { meanIoU: +(rows.reduce((s, r) => s + r.silhouetteIoU, 0) / rows.length).toFixed(3), meanRobotDE: +(rows.reduce((s, r) => s + r.robotDE, 0) / rows.length).toFixed(1), meanBackgroundDE: +(rows.reduce((s, r) => s + r.backgroundDE, 0) / rows.length).toFixed(1) }]; }));
  if (GATE) {
    const failures = [];
    for (const theme of THEMES) {
      const m = R.themes[theme].pose1, g = PARITY_GATE[theme];
      if (!m) { failures.push(`${theme}: poseAt(1) not measured`); continue; }
      if (g.robotDE !== null && m.robotDE > g.robotDE) failures.push(`${theme}: robot dE ${m.robotDE} > ${g.robotDE}`);
      if (g.robotMeanColourDE !== null && m.robotMeanColourDE > g.robotMeanColourDE) failures.push(`${theme}: robot mean-colour dE ${m.robotMeanColourDE} > ${g.robotMeanColourDE}`);
      if (m.backgroundDE > g.backgroundDE) failures.push(`${theme}: background dE ${m.backgroundDE} > ${g.backgroundDE}`);
      if (m.silhouetteIoU < g.silhouetteIoU) failures.push(`${theme}: silhouette IoU ${m.silhouetteIoU} < ${g.silhouetteIoU}`);
    }
    const unmetTarget = THEMES.filter((t) => !(R.themes[t].pose1?.robotDE <= ROBOT_DE_TARGET)).map((t) => `${t}: robot dE ${R.themes[t].pose1?.robotDE} (target ${ROBOT_DE_TARGET})`);
    R.gate = { thresholds: PARITY_GATE, pass: failures.length === 0, failures, robotDETarget: ROBOT_DE_TARGET, unmetTarget };
    if (unmetTarget.length) console.error(`sim parity: per-pixel robot target not met (reported, not gated):\n  ${unmetTarget.join("\n  ")}`);
  }
} catch (error) {
  R.error = error.message.split("\n")[0];
}
fs.writeFileSync(path.join(ART, "parity-report.json"), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await browser.close(); server?.kill();
if (R.gate && !R.gate.pass) console.error(`sim parity FAILED:\n  ${R.gate.failures.join("\n  ")}`);
if (R.error || (R.gate && !R.gate.pass)) process.exit(1);
