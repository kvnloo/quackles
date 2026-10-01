#!/usr/bin/env node
// Cast mode selection, basic-mode media (Default Media Receiver), media debounce and error mapping.
// Run: node --import ./scripts/register-ts-resolve.mjs scripts/cast-basic-contracts.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
const C = await import("../lib/cast/config.ts");
const M = await import("../lib/cast/media.ts");
const { parseManifest, spanAt, THEME_IDS } = await import("../lib/sequence/manifest.ts");
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const raw = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const SITE = "https://kvnloo.github.io/quackles/preview/chromecast";
const manifest = parseManifest(raw, `${SITE}/preview-scene/sequence/manifest.json?v=abc1234`);
const view = (o = {}) => ({ progress: 0, theme: 2, zoom: 1, focusX: 0.5, focusY: 0.5, inspecting: false, reducedMotion: false, ...o });

test("mode: placeholder App ID -> basic mode on Google's Default Media Receiver", () => {
  assert.equal(C.DEFAULT_MEDIA_RECEIVER_APP_ID, "CC1AD845");
  assert.deepEqual(C.castMode("", C.CAST_APP_ID_PLACEHOLDER), { kind: "basic", appId: "CC1AD845" });
  assert.deepEqual(C.castMode("", ""), { kind: "basic", appId: "CC1AD845" });
});
test("mode: a registered App ID (config) -> custom receiver with live sync", () => {
  assert.deepEqual(C.castMode("", "A1B2C3D4"), { kind: "custom", appId: "A1B2C3D4" });
});
test("mode: ?castAppId overrides; lower-case accepted; invalid falls back to basic (never hides the button)", () => {
  assert.deepEqual(C.castMode("?castAppId=a1b2c3d4", C.CAST_APP_ID_PLACEHOLDER), { kind: "custom", appId: "A1B2C3D4" });
  assert.deepEqual(C.castMode("?castAppId=zz", C.CAST_APP_ID_PLACEHOLDER), { kind: "basic", appId: "CC1AD845" });
  assert.deepEqual(C.castMode("?castAppId=zz", "A1B2C3D4"), { kind: "custom", appId: "A1B2C3D4" });
  assert.deepEqual(C.castMode("?castAppId=00000000", C.CAST_APP_ID_PLACEHOLDER), { kind: "basic", appId: "CC1AD845" });
  assert.deepEqual(C.castMode("?castAppId=CC1AD845", C.CAST_APP_ID_PLACEHOLDER), { kind: "basic", appId: "CC1AD845" });
});
test("browser gate: Chrome desktop/Android yes; iOS, Edge, Samsung, Firefox, headless no", () => {
  const yes = ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"];
  const no = ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36"];
  for (const ua of yes) assert.equal(C.castCapableBrowser(ua, true), true, ua);
  for (const ua of no) assert.equal(C.castCapableBrowser(ua, true), false, ua);
  assert.equal(C.castCapableBrowser(yes[0], false), false, "no window.chrome");
});

test("media: the current theme + story frame plate, absolute https URL under the site's base path, image/webp", () => {
  for (const [i, id] of THEME_IDS.entries()) {
    for (const progress of [0, 0.12, 0.3, 0.55, 0.999]) {
      const media = M.castMedia(manifest, view({ progress, theme: i }));
      const span = spanAt(manifest, progress, false), frame = span.mix < 0.5 ? span.before : span.after;
      assert.equal(media.url, `${SITE}/preview-scene/sequence/cinematic-proof-v2/${id}/${frame.id}-1024.webp`);
      assert.equal(media.contentType, "image/webp");
      assert.equal(media.key, `${frame.id}/${id}`);
      assert.match(media.title, new RegExp(manifest.themes[i].label));
      assert.ok(media.subtitle.length > 0);
      assert.equal(media.width, 1024);
    }
  }
});
test("media: fractional theme rounds to the theme the phone is closest to; reduced motion uses its own frames", () => {
  assert.match(M.castMedia(manifest, view({ theme: 2.4 })).key, /\/blue$/);
  assert.match(M.castMedia(manifest, view({ theme: 2.6 })).key, /\/dark$/);
  const span = spanAt(manifest, 0.3, true), frame = span.mix < 0.5 ? span.before : span.after;
  assert.equal(M.castMedia(manifest, view({ progress: 0.3, reducedMotion: true })).key, `${frame.id}/blue`);
});
test("media: best available still = the largest image variant (never a tile template)", () => {
  const fake = structuredClone(manifest);
  fake.frames[0].assets.blue = [{ url: "https://x.test/a-512.webp", width: 512, height: 768 }, { url: "https://x.test/a-2048.png", width: 2048, height: 3072 }, { width: 9000, height: 9000, tiles: { tileSize: 256, overlap: 1, columns: 1, rows: 1, urlTemplate: "https://x.test/{x}_{y}.webp" } }];
  const media = M.castMedia(fake, view());
  assert.equal(media.url, "https://x.test/a-2048.png"); assert.equal(media.contentType, "image/png");
});
test("media: contentType from extension", () => {
  assert.equal(M.contentTypeFor("https://a/b.webp?v=1"), "image/webp");
  assert.equal(M.contentTypeFor("https://a/b.JPG"), "image/jpeg");
  assert.equal(M.contentTypeFor("https://a/b.jpeg"), "image/jpeg");
  assert.equal(M.contentTypeFor("https://a/b.png"), "image/png");
  assert.equal(M.contentTypeFor("https://a/b.gif"), "image/gif");
});

test("debounce: first load (connect) is immediate; changes load once after MEDIA_DEBOUNCE_MS of quiet; same key never reloads", () => {
  assert.ok(M.MEDIA_DEBOUNCE_MS >= 250 && M.MEDIA_DEBOUNCE_MS <= 400);
  const d = new M.MediaDebounce();
  assert.equal(d.offer("a", 0, true), "a", "connect loads now");
  assert.equal(d.offer("a", 10), null, "unchanged");
  assert.equal(d.offer("b", 100), null); assert.equal(d.due(300), null);
  assert.equal(d.offer("c", 300), null, "a newer change restarts the quiet period");
  assert.equal(d.due(599), null); assert.equal(d.due(600), "c");
  assert.equal(d.due(2000), null, "loaded once");
  assert.equal(d.offer("c", 2100), null, "same as loaded");
  assert.equal(d.offer("d", 2200), null); assert.equal(d.offer("c", 2300), null, "changed back before it fired");
  assert.equal(d.due(5000), null, "back to what the TV shows: nothing to load");
  assert.ok(d.nextDueAt() === null);
});
test("debounce: rapid theme spam (60 changes/s for 3 s) yields at most one load per quiet period, the final one", () => {
  const d = new M.MediaDebounce(); d.offer("start", 0, true);
  const loads = [];
  for (let t = 0; t < 3000; t += 16) { d.offer(`k${t % 5}`, t); const out = d.due(t); if (out) loads.push(out); }
  for (let t = 3000; t < 4000; t += 16) { const out = d.due(t); if (out) loads.push(out); }
  assert.equal(loads.length, 1, loads.join()); assert.equal(loads[0], `k${2992 % 5}`);
});
test("debounce: force() reloads the current key now (receiver reconnect / resync)", () => {
  const d = new M.MediaDebounce(); d.offer("a", 0, true);
  assert.equal(d.offer("a", 50, true), "a");
});

test("errors: Cast error codes map to a visible message (cancel is the user's choice, stays silent)", () => {
  assert.equal(C.castErrorMessage("cancel"), null);
  for (const code of ["timeout", "receiver_unavailable", "session_error", "load_media_failed", "channel_error", "api_not_initialized", "invalid_parameter", "extension_missing", "extension_not_compatible", "sdk_unavailable", "receiver_silent", "weird"]) {
    const message = C.castErrorMessage(code);
    assert.ok(typeof message === "string" && message.length > 8 && message.length < 120, `${code}: ${message}`);
  }
  assert.match(C.castErrorMessage("receiver_unavailable"), /no cast device|no tv|not found/i);
  assert.match(C.castErrorMessage("timeout"), /respond|time/i);
  assert.match(C.castErrorMessage("load_media_failed"), /image|picture|load/i);
  assert.notEqual(C.castErrorMessage("weird"), C.castErrorMessage("timeout"));
  // Error objects / chrome.cast.Error shapes are accepted too.
  assert.equal(C.castErrorMessage({ code: "timeout" }), C.castErrorMessage("timeout"));
  assert.equal(C.castErrorMessage(new Error("boom")), C.castErrorMessage("weird"));
});
console.log(`${n} passed`);
