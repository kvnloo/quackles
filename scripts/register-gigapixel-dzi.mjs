#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function args(argv) {
  const result = new Map();
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    result.set(key.slice(2), argv[i + 1]);
    i++;
  }
  return result;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function attribute(xml, name) {
  const match = xml.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"),
  );
  if (!match) throw new Error(`DZI is missing ${name}`);
  return match[1];
}

function levelDimensions(width, height, maxLevel, level) {
  const divisor = 2 ** (maxLevel - level);
  return {
    width: Math.ceil(width / divisor),
    height: Math.ceil(height / divisor),
  };
}

function assetPrefix(value) {
  const normalized = value.replace(/\\/g, "/").replace(/\/$/, "");
  // The runtime manifest intentionally keeps sequence assets same-origin.
  // A root-relative path can point at a separately deployed Pages/R2 asset
  // surface without copying the recovered Gigapixel pyramid into this repo.
  if (!normalized.startsWith("/"))
    throw new Error("--asset-url-base must be a same-origin root-relative path");
  if (normalized.includes("{x}") || normalized.includes("{y}"))
    throw new Error("--asset-url-base must point to the tile pyramid root");
  return normalized;
}

const values = args(process.argv);
const dziPath = path.resolve(required(values, "dzi"));
const assetUrlBase = assetPrefix(required(values, "asset-url-base"));
const manifestPath = path.resolve(
  values.get("manifest") ?? "public/preview-scene/sequence/manifest.json",
);
const frameId = values.get("frame") ?? "p0000000";
const theme = values.get("theme") ?? "blue";

const xml = await fs.readFile(dziPath, "utf8");
const width = Number(attribute(xml, "Width"));
const height = Number(attribute(xml, "Height"));
const tileSize = Number(attribute(xml, "TileSize"));
const overlap = Number(attribute(xml, "Overlap"));
const format = attribute(xml, "Format").toLowerCase();
if (![width, height, tileSize, overlap].every(Number.isFinite))
  throw new Error("Invalid numeric DZI metadata");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const frame = manifest.frames?.find((row) => row.id === frameId);
if (!frame) throw new Error(`Manifest frame not found: ${frameId}`);
const variants = frame.assets?.[theme];
if (!Array.isArray(variants))
  throw new Error(`Manifest theme not found: ${theme}`);

const baseWidth = Math.max(
  ...variants
    .filter((variant) => "url" in variant)
    .map((variant) => variant.width),
);
const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));

const pyramid = [];
for (let level = 0; level <= maxLevel; level++) {
  const size = levelDimensions(width, height, maxLevel, level);
  if (size.width <= baseWidth) continue;
  pyramid.push({
    width: size.width,
    height: size.height,
    tiles: {
      tileSize,
      overlap,
      columns: Math.ceil(size.width / tileSize),
      rows: Math.ceil(size.height / tileSize),
      urlTemplate: `${assetUrlBase}/${level}/{x}_{y}.${format}`,
    },
  });
}

frame.assets[theme] = [
  ...variants.filter(
    (variant) =>
      !("tiles" in variant) ||
      !String(variant.tiles?.urlTemplate ?? "").startsWith(
        `${assetUrlBase}/`,
      ),
  ),
  ...pyramid,
].sort((a, b) => a.width - b.width);

await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
console.log(
  JSON.stringify(
    {
      frame: frameId,
      theme,
      inspectedDzi: dziPath,
      assetUrlBase,
      copiedAssetBytes: 0,
      width,
      height,
      megapixels: Number(((width * height) / 1e6).toFixed(3)),
      tileSize,
      overlap,
      levelsRegistered: pyramid.map((variant) => ({
        width: variant.width,
        height: variant.height,
        columns: variant.tiles.columns,
        rows: variant.tiles.rows,
        urlTemplate: variant.tiles.urlTemplate,
      })),
      manifest: manifestPath,
      note:
        "The DZI descriptor and tile pyramid were read-only inputs; no master or tile data was copied or modified.",
    },
    null,
    2,
  ),
);
