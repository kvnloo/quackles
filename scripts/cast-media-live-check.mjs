#!/usr/bin/env node
/** Basic-mode cast URLs exist on the DEPLOYED site (network). The Default Media Receiver fetches these itself.
 *   node --import ./scripts/register-ts-resolve.mjs scripts/cast-media-live-check.mjs [siteBase]
 * siteBase defaults to https://kvnloo.github.io/quackles/preview/chromecast. HEADs every theme x a spread of frames
 * (plus the reduced-motion frames): 200, image/webp, https, CORS-readable. */
import fs from "node:fs";
const { parseManifest, spanAt, THEME_IDS } = await import("../lib/sequence/manifest.ts");
const { castMedia } = await import("../lib/cast/media.ts");
const SITE = (process.argv[2] || "https://kvnloo.github.io/quackles/preview/chromecast").replace(/\/$/, "");
const raw = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const manifest = parseManifest(raw, `${SITE}/preview-scene/sequence/manifest.json?v=live`);
const urls = new Map();
for (let theme = 0; theme < THEME_IDS.length; theme++) for (const progress of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) for (const reducedMotion of [false, true]) {
  const media = castMedia(manifest, { progress, theme, reducedMotion });
  urls.set(media.url, media);
}
const bad = [];
await Promise.all([...urls.values()].map(async (media) => {
  const response = await fetch(media.url, { method: "HEAD" }).catch((e) => ({ ok: false, status: String(e), headers: new Headers() }));
  const type = response.headers.get("content-type"), cors = response.headers.get("access-control-allow-origin");
  if (!response.ok || type !== media.contentType || !media.url.startsWith("https://") || cors !== "*") bad.push(`${response.status} ${type} cors=${cors} ${media.url}`);
}));
console.log(`${urls.size} distinct cast stills checked under ${SITE}: ${urls.size - bad.length} ok`);
if (bad.length) { console.log("FAIL\n" + bad.join("\n")); process.exit(1); }
