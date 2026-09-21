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
  const match = xml.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
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

const values = args(process.argv);
const dziPath = path.resolve(required(values, "dzi"));
const manifestPath = path.resolve(
  values.get("manifest") ?? "public/preview-scene/sequence/manifest.json",
);
const frameId = values.get("frame") ?? "p0000000";
const theme = values.get("theme") ?? "blue";
const outputBase = path.resolve(
  values.get("output") ?? "public/preview-scene/gigapixel/blue-p0-200mp",
);

const xml = await fs.readFile(dziPath, "utf8");
const width = Number(attribute(xml, "Width"));
const height = Number(attribute(xml, "Height"));
const tileSize = Number(attribute(xml, "TileSize"));
const overlap = Number(attribute(xml, "Overlap"));
const format = attribute(xml, "Format").toLowerCase();
if (![width, height, tileSize, overlap].every(Number.isFinite))
  throw new Error("Invalid numeric DZI metadata");

const sourceTiles = path.join(
  path.dirname(dziPath),
  `${path.basename(dziPath, path.extname(dziPath))}_files`,
);
const outputTiles = `${outputBase}_files`;
await fs.access(sourceTiles);

await fs.mkdir(path.dirname(outputBase), { recursive: true });
await fs.rm(outputTiles, { recursive: true, force: true });
await fs.cp(sourceTiles, outputTiles, { recursive: true });
await fs.copyFile(dziPath, `${outputBase}.dzi`);

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const frame = manifest.frames?.find((row) => row.id === frameId);
if (!frame) throw new Error(`Manifest frame not found: ${frameId}`);
const variants = frame.assets?.[theme];
if (!Array.isArray(variants)) throw new Error(`Manifest theme not found: ${theme}`);

const baseWidth = Math.max(
  ...variants.filter((variant) => "url" in variant).map((variant) => variant.width),
);
const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
const relativeTiles = path
  .relative(path.dirname(manifestPath), outputTiles)
  .split(path.sep)
  .join("/");

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
      urlTemplate: `${relativeTiles}/${level}/{x}_{y}.${format}`,
    },
  });
}

const prefix = `${relativeTiles}/`;
frame.assets[theme] = [
  ...variants.filter(
    (variant) =>
      !("tiles" in variant) ||
      !String(variant.tiles?.urlTemplate ?? "").startsWith(prefix),
  ),
  ...pyramid,
].sort((a, b) => a.width - b.width);

await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
console.log(
  JSON.stringify(
    {
      frame: frameId,
      theme,
      source: dziPath,
      copiedDzi: `${outputBase}.dzi`,
      copiedTiles: outputTiles,
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
    },
    null,
    2,
  ),
);
