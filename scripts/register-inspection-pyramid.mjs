#!/usr/bin/env node
/** Insert one scene's pyramid into the hero frame. Size comes from source.dzi, not a constant. */
import fs from "node:fs/promises";
import path from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const scene = args.get("scene");
const dziPath = args.get("dzi");
if (!scene || !dziPath) {
  throw new Error("usage: register-inspection-pyramid.mjs --scene=day --dzi=source.dzi [--manifest=...] [--hidden=...]");
}
const manifestPath = path.resolve(args.get("manifest") ?? "public/preview-scene/sequence/manifest.json");
const hiddenPath = path.resolve(args.get("hidden") ?? "public/preview-scene/sequence/hidden-pyramids.json");
const dzi = JSON.parse(await fs.readFile(dziPath, "utf8"));
const [width, height] = dzi.size;
const tileSize = dzi.tileSize;
const format = dzi.format ?? "webp";
if (![width, height, tileSize].every((n) => Number.isSafeInteger(n) && n >= 1)) {
  throw new Error("source.dzi size is not a safe pixel count");
}
const variants = dzi.levels.map((level) => ({
  width: level.size[0],
  height: level.size[1],
  tiles: {
    tileSize,
    overlap: dzi.overlap ?? 0,
    columns: Math.ceil(level.size[0] / tileSize),
    rows: Math.ceil(level.size[1] / tileSize),
    urlTemplate: `/quackles-assets/${scene}/p0000000/gp/${level.level}/{x}_{y}.${format}`,
  },
}));

if (scene === "mushroom") {
  const hidden = await fs.readFile(hiddenPath, "utf8").then(JSON.parse).catch(() => ({}));
  hidden.mushroom = { frameId: "p0000000", variants };
  await fs.writeFile(hiddenPath, `${JSON.stringify(hidden, null, 2)}\n`);
  console.log(JSON.stringify({ scene, file: hiddenPath, levels: variants.length, width, height }));
} else {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const frame = manifest.frames.find((row) => row.id === "p0000000");
  if (!frame?.assets?.[scene]) throw new Error(`hero frame has no ${scene} assets`);
  const keep = frame.assets[scene].filter((variant) => !String(variant.tiles?.urlTemplate ?? "").includes("/p0000000/gp/"));
  frame.assets[scene] = [...keep, ...variants].sort((a, b) => a.width - b.width);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  console.log(JSON.stringify({ scene, file: manifestPath, levels: variants.length, width, height }));
}
