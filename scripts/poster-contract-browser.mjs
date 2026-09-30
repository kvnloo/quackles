#!/usr/bin/env node
/** Poster contract (#41 item 7): Hermes-poster structure adapted to Microduck. Desktop 1440x900 + phone 412x915
 * Chromium (not device evidence). Asserts: official Hermes Agent + Pollen Microduck links (target=_blank rel=noopener);
 * MICRODUCK at most once at headline level; poster structure elements present; /process is a real static page that
 * links back; no hero text over the robot box (x .33-.9, y .26-.8 of .poster-frame); text contrast >= 4.5:1 against
 * the plate pixels actually behind each text line, in all five themes. OUT_DIR(+BASE_PATH), SHOTS_DIR+SHOTS_TAG to
 * save full-viewport screenshots per viewport/theme. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "48200", base = process.env.BASE_PATH || "";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const SHOTS = process.env.SHOTS_DIR, TAG = process.env.SHOTS_TAG || "shot";
const THEMES = ["day", "white", "blue", "dark", "night"];
const ROBOT = { x0: 0.33, x1: 0.9, y0: 0.26, y1: 0.8 };
const HERMES = "https://hermes-agent.nousresearch.com/", POLLEN = "https://pollen-robotics.com/microduck/";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const failures = [], report = {};
const fail = (msg) => failures.push(msg);
const route = async (page) => page.route("**/quackles-assets/**", async (r) => {
  const f = path.join(ASSETS, new URL(r.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
  if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
  await r.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
});
// Text-glyph rects (Range client rects), computed color, and effective opacity for every visible hero text node.
const TEXT_SCOPE = ".site-nav, .hero-copy";
function collectText(scope) {
  const eff = (el) => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none") return 0; o *= +s.opacity; } return o; };
  const out = [];
  for (const root of document.querySelectorAll(scope)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (el.closest(".sr-only,[aria-hidden=true]")) continue; // decorative marks are exempt (WCAG 1.4.3)
      if (eff(el) < 0.5) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) out.push({ text: n.textContent.trim().slice(0, 24), color: getComputedStyle(el).color, rect: [r.left, r.top, r.right, r.bottom] });
    }
  }
  const f = document.querySelector(".poster-frame").getBoundingClientRect();
  return { frame: [f.left, f.top, f.width, f.height], texts: out };
}
// Decode a PNG in-page and return mean background colour per rect (device px scaled by dpr).
async function sampleBackgrounds(page, png, rects) {
  return page.evaluate(async ({ b64, rects }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0); const s = img.width / innerWidth;
    return rects.map(([l, t, r, b]) => {
      const x = Math.max(0, Math.floor(l * s)), y = Math.max(0, Math.floor(t * s)), w = Math.max(1, Math.ceil((r - l) * s)), h = Math.max(1, Math.ceil((b - t) * s));
      const d = g.getImageData(x, y, Math.min(w, c.width - x), Math.min(h, c.height - y)).data; const lum = [];
      for (let i = 0; i < d.length; i += 4) lum.push([d[i], d[i + 1], d[i + 2]]);
      return lum;
    });
  }, { b64: png.toString("base64"), rects });
}
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [hi, lo] = [Math.max(a, b), Math.min(a, b)]; return (hi + 0.05) / (lo + 0.05); };
const parseRGB = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);

for (const [vp, size, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 412, height: 915 }, true]]) {
  const ctx = await browser.newContext({ viewport: size, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); await route(page);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}${base}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
  const r = (report[vp] = { themes: {} });
  if (vp === "desktop") {
    // Structure + links (theme independent).
    const s = await page.evaluate(() => {
      const vis = (e) => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const st = getComputedStyle(x); if (st.display === "none" || st.visibility === "hidden" || +st.opacity < 0.05) return false; } return true; };
      const links = [...document.querySelectorAll("a[href]")].filter(vis).map((a) => ({ href: a.href, text: a.textContent.trim(), target: a.target, rel: a.rel, cls: a.className }));
      const headline = [...document.querySelectorAll(".wordmark, h1, h2, h3, .hero-kicker, [role=heading]")].filter(vis).filter((e) => /microduck/i.test(e.textContent)).map((e) => e.className || e.tagName);
      const q = (sel) => { const e = document.querySelector(sel); return e && vis(e) ? e.innerText.replace(/\s+/g, " ").trim() : null; };
      return { links, headline, wordmark: q(".site-nav .wordmark"), cta: q(".site-nav .nav-cta"), kicker: q(".hero-copy .hero-kicker"), kickerRule: !!document.querySelector(".hero-copy .hero-kicker i"), h1: q(".hero-copy h1"), label: q(".hero-copy .hero-label"), note: q(".hero-copy .hero-note"), right: q(".hero-copy .hero-right-lead"), sub: q(".hero-copy .hero-right-sub"), globe: !!document.querySelector(".hero-copy .hero-globe svg"), year: q(".hero-copy .hero-year"), navCount: document.querySelectorAll(".site-nav nav a").length, info: document.querySelector(".site-nav a.nav-info")?.getAttribute("href") ?? null };
    });
    r.structure = s;
    for (const [name, url] of [["Hermes Agent", HERMES], ["Pollen Microduck", POLLEN]]) {
      const hits = s.links.filter((l) => l.href === url);
      if (!hits.length) fail(`missing visible ${name} link ${url}`);
      for (const l of hits) if (l.target !== "_blank" || !/\bnoopener\b/.test(l.rel)) fail(`${name} link needs target=_blank rel=noopener (${l.target}/${l.rel})`);
    }
    for (const l of s.links.filter((l) => l.target === "_blank")) if (!/\bnoopener\b/.test(l.rel)) fail(`external link missing noopener: ${l.href}`);
    if (s.headline.length > 1) fail(`MICRODUCK appears ${s.headline.length}x at headline level: ${s.headline.join(", ")}`);
    const want = { wordmark: /\S/, cta: /\S/, kicker: /^01 \S+/, h1: /A MORE OPEN INTELLIGENCE/, label: /FOR EVERYONE$/, note: /° N .*° [EW]/, right: /A BRIGHTER TOMORROW/, sub: /^OPEN USEFUL BEAUTIFUL$/, year: /2026/ };
    for (const [k, re] of Object.entries(want)) if (!s[k] || !re.test(s[k])) fail(`structure ${k}: ${JSON.stringify(s[k])} !~ ${re}`);
    if (!s.globe) fail("structure: globe icon missing");
    if (!s.kickerRule) fail("structure: kicker rule (01 LABEL ——) missing");
    if (s.navCount < 4) fail(`structure: nav has ${s.navCount} links (<4)`);
    if (!s.info || !/\/process\/?$/.test(s.info) || (base && !s.info.startsWith(base))) fail(`structure: info link to process page missing/unscoped: ${s.info}`);
    // /process: real static page (in export), links back home and to both official sites.
    const procFile = path.join(dir, base, "process", "index.html");
    if (!fs.existsSync(procFile)) fail(`static export lacks ${procFile}`);
    const pp = await ctx.newPage(); const resp = await pp.goto(`http://127.0.0.1:${port}${base}/process/`, { waitUntil: "load" });
    const proc = await pp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? null, links: [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.getAttribute("href"), abs: a.href, target: a.target, rel: a.rel })) }));
    r.process = { status: resp?.status(), h1: proc.h1, links: proc.links.length };
    if (resp?.status() !== 200 || !proc.h1) fail(`/process not served as a page (status ${resp?.status()}, h1 ${proc.h1})`);
    else {
      const home = `http://127.0.0.1:${port}${base}/`;
      if (!proc.links.some((l) => l.abs === home)) fail("/process has no link back to the poster");
      for (const url of [HERMES, POLLEN]) if (!proc.links.some((l) => l.abs === url && l.target === "_blank" && /noopener/.test(l.rel))) fail(`/process missing ${url}`);
    }
    await pp.close();
  }
  for (const theme of THEMES) {
    await page.evaluate((id) => window.__QUACKLES_SEQUENCE__.setTheme(id), theme);
    await page.waitForTimeout(1400);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${TAG}-${vp}-${theme}.png`) });
    const { frame: [fx, fy, fw, fh], texts } = await page.evaluate(collectText, TEXT_SCOPE);
    const box = [fx + ROBOT.x0 * fw, fy + ROBOT.y0 * fh, fx + ROBOT.x1 * fw, fy + ROBOT.y1 * fh];
    const overlaps = texts.filter((t) => t.rect[0] < box[2] && t.rect[2] > box[0] && t.rect[1] < box[3] && t.rect[3] > box[1]).map((t) => t.text);
    // Hide glyphs only (keep DOM backgrounds) and sample what sits behind each text line.
    await page.addStyleTag({ content: `.site-nav *, .hero-copy *, .site-nav, .hero-copy { color: transparent !important; text-shadow: none !important; } .hero-globe, .crop-cross { visibility: hidden !important; }` }).then((h) => page.evaluate((el) => el.id = "__poster_probe", h));
    await page.waitForTimeout(100);
    const png = await page.screenshot();
    await page.evaluate(() => document.getElementById("__poster_probe")?.remove());
    const pixels = await sampleBackgrounds(page, png, texts.map((t) => t.rect));
    const contrasts = texts.map((t, i) => {
      const fg = L(parseRGB(t.color)); const ls = pixels[i].map(L).sort((a, b) => a - b);
      // Worst of the 10th/90th luminance percentile keeps plate grain from dominating but catches busy backdrops.
      const p = (q) => ls[Math.min(ls.length - 1, Math.floor(q * ls.length))];
      return { text: t.text, ratio: +Math.min(ratio(fg, p(0.1)), ratio(fg, p(0.9))).toFixed(2) };
    });
    const low = contrasts.filter((c) => c.ratio < 4.5);
    const min = contrasts.reduce((m, c) => (c.ratio < m.ratio ? c : m), { ratio: Infinity });
    r.themes[theme] = { texts: texts.length, overlaps, minContrast: min, low: low.slice(0, 6) };
    if (!texts.length) fail(`${vp}/${theme}: no hero text found`);
    if (overlaps.length) fail(`${vp}/${theme}: text over robot box: ${[...new Set(overlaps)].join(" | ")}`);
    if (low.length) fail(`${vp}/${theme}: ${low.length} text lines < 4.5:1 (min ${min.text} ${min.ratio})`);
  }
  if (errors.length) fail(`${vp}: page errors ${errors.join("; ")}`);
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await browser.close(); server.kill();
if (failures.length) { console.error("FAIL\n- " + [...new Set(failures)].join("\n- ")); process.exit(1); }
console.log("PASS poster contract");
