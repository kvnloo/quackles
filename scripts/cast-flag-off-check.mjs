#!/usr/bin/env node
/** Flag-off parity + first-load JS for the Chromecast feature (docs/CAST.md).
 *
 *   node scripts/cast-flag-off-check.mjs <base-out> <flag-off-out> [<cast-on-out>]
 *
 * base-out:     `next build` of the base commit (e.g. origin/dev), flag-off-out: this branch with NEXT_PUBLIC_CAST=0.
 * Both must be built with the same NEXT_PUBLIC_BUILD_SHA / NEXT_PUBLIC_BUILD_TIME / base path. Next's random build
 * id is the only thing normalised. Exit 1 if any file differs (added, removed or changed).
 * With a third tree (NEXT_PUBLIC_CAST=1) it also reports the first-load JS delta of "/" and the receiver route.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [baseDir, offDir, onDir] = process.argv.slice(2);
if (!baseDir || !offDir) { console.error("usage: cast-flag-off-check.mjs <base-out> <flag-off-out> [<cast-on-out>]"); process.exit(2); }

const buildId = (dir) => fs.readdirSync(path.join(dir, "_next/static")).find((name) => !["chunks", "css", "media"].includes(name));
function walk(dir, root = dir, out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else out.set(path.relative(root, full), full);
  }
  return out;
}
function normalised(dir) {
  const id = buildId(dir);
  const files = new Map();
  for (const [rel, full] of walk(dir)) {
    const key = rel.split(id).join("BUILD_ID");
    const bytes = fs.readFileSync(full);
    files.set(key, bytes.includes(id) ? Buffer.from(bytes.toString("latin1").split(id).join("BUILD_ID"), "latin1") : bytes);
  }
  return files;
}

const base = normalised(baseDir), off = normalised(offDir);
const diffs = [];
for (const [key, bytes] of base) {
  if (!off.has(key)) diffs.push(`removed ${key}`);
  else if (!bytes.equals(off.get(key))) diffs.push(`changed ${key}`);
}
for (const key of off.keys()) if (!base.has(key)) diffs.push(`added   ${key}`);
console.log(`flag-off parity: ${base.size} files compared, ${diffs.length} differ`);
for (const line of diffs.slice(0, 40)) console.log("  " + line);

function firstLoadJs(dir, route) {
  const html = fs.readFileSync(path.join(dir, route, "index.html"), "utf8");
  const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]))];
  let raw = 0, gz = 0;
  for (const src of srcs) {
    const rel = src.slice(src.indexOf("/_next/") + 1);
    const bytes = fs.readFileSync(path.join(dir, rel));
    raw += bytes.length; gz += zlib.gzipSync(bytes, { level: 9 }).length;
  }
  return { scripts: srcs.length, raw, gz };
}
const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
const report = { parity: diffs.length === 0, differing: diffs.length, home: { base: firstLoadJs(baseDir, "."), off: firstLoadJs(offDir, ".") } };
if (onDir) {
  report.home.on = firstLoadJs(onDir, ".");
  report.receiver = firstLoadJs(onDir, "cast-receiver");
  const d = (a, b) => `${b - a >= 0 ? "+" : ""}${kb(b - a)}`;
  console.log(`first-load JS "/": off ${kb(report.home.off.raw)} (${kb(report.home.off.gz)} gz) -> cast on ${kb(report.home.on.raw)} (${kb(report.home.on.gz)} gz): ${d(report.home.off.raw, report.home.on.raw)} raw, ${d(report.home.off.gz, report.home.on.gz)} gz`);
  console.log(`first-load JS "/cast-receiver/": ${kb(report.receiver.raw)} (${kb(report.receiver.gz)} gz)`);
}
console.log(`first-load JS "/" base vs off: ${report.home.base.raw} vs ${report.home.off.raw} bytes`);
console.log(JSON.stringify(report));
process.exit(diffs.length ? 1 : 0);
