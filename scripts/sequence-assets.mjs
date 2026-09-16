#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.resolve(process.env.MANIFEST || path.join(root, 'public/preview-scene/sequence/manifest.json'));
const out = path.resolve(process.env.ARTIFACTS || path.join(root, '../../outputs/mobile-validation/sequence-assets'));
const sourcePath = path.resolve(process.env.SOURCE_RECEIPT || path.join(root, '../../outputs/cinematic-source-receipt.json'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const raw = await fs.readFile(manifestPath);
const manifest = JSON.parse(raw), sources = JSON.parse(await fs.readFile(sourcePath));
const report = { at: new Date().toISOString(), manifest: manifestPath, manifestSha256: sha256(raw), revision: manifest.id, framesPerTheme: manifest.frames.length, sourceReceipt: sourcePath, checks: [], assets: [], sourceComparisons: [], limitations: ['Sparse pose functionality does not establish smooth motion.', 'Pixel comparisons measure encoding differences from the source and do not judge lighting or art direction.'] };
function check(name, condition, evidence) { report.checks.push({ name, passed: Boolean(condition), evidence }); }
const themes = ['day', 'white', 'blue', 'dark', 'night'];
check('exact five theme order', JSON.stringify(manifest.themes.map(row => row.id)) === JSON.stringify(themes));
check('explicit ordered progress including endpoints', manifest.frames[0].progress === 0 && manifest.frames.at(-1).progress === 1 && manifest.frames.every((row, i, rows) => Number.isFinite(row.progress) && (!i || row.progress > rows[i - 1].progress)));
check('unique frame IDs', new Set(manifest.frames.map(row => row.id)).size === manifest.frames.length);
const tileGroups = [];
for (const frame of manifest.frames) for (const theme of themes) for (const variant of frame.assets[theme]) {
  const urls = 'tiles' in variant ? Array.from({ length: variant.tiles.rows * variant.tiles.columns }, (_, i) => {
    const x = i % variant.tiles.columns, y = Math.floor(i / variant.tiles.columns);
    return { url: variant.tiles.urlTemplate.replaceAll('{x}', String(x)).replaceAll('{y}', String(y)), width: Math.min(variant.tiles.tileSize, variant.width - x * variant.tiles.tileSize), height: Math.min(variant.tiles.tileSize, variant.height - y * variant.tiles.tileSize), x, y };
  }) : [variant];
  if ('tiles' in variant) tileGroups.push({ theme, frame: frame.id, width: variant.width, height: variant.height, tileSize: variant.tiles.tileSize, count: urls.length });
  for (const entry of urls) {
    const url = new URL(entry.url, 'https://sequence.test/preview-scene/sequence/manifest.json');
    const relative = url.pathname.startsWith('/preview-scene/') ? url.pathname.slice(1) : path.posix.join('preview-scene/sequence', entry.url);
    const file = path.resolve(root, 'public', relative);
    assert.ok(file.startsWith(path.join(root, 'public') + path.sep), 'Asset path escaped public directory');
    const row = { theme, frame: frame.id, progress: frame.progress, tierWidth: variant.width, path: file, url: entry.url };
    try {
      const bytes = await fs.readFile(file), metadata = await sharp(bytes).metadata();
      Object.assign(row, { bytes: bytes.length, sha256: sha256(bytes), width: metadata.width, height: metadata.height, passed: metadata.width === entry.width && metadata.height === entry.height && (entry.bytes === undefined || bytes.length === entry.bytes) && (entry.sha256 === undefined || sha256(bytes) === entry.sha256), digestInManifest: Boolean(entry.sha256), bytesInManifest: entry.bytes !== undefined });
      if (!('tiles' in variant)) {
        const source = sources.frames.find(candidate => candidate.theme === theme && candidate.frame === frame.id && candidate.width === variant.width);
        if (source) {
          const sourceBytes = await fs.readFile(source.source);
          const actual = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const native = await sharp(sourceBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          assert.equal(actual.data.length, native.data.length);
          let sum = 0, squared = 0, max = 0;
          const histogram = new Uint32Array(256);
          for (let i = 0; i < actual.data.length; i++) { const d = Math.abs(actual.data[i] - native.data[i]); sum += d; squared += d * d; max = Math.max(max, d); histogram[d]++; }
          let p99 = 0, cumulative = 0;
          for (; p99 < 255; p99++) { cumulative += histogram[p99]; if (cumulative >= actual.data.length * .99) break; }
          const mse = squared / actual.data.length;
          report.sourceComparisons.push({ theme, frame: frame.id, width: variant.width, source: source.source, sourceDigestMatchesReceipt: sha256(sourceBytes) === source.sourceSHA256, meanAbsoluteChannelError: sum / actual.data.length, p99AbsoluteChannelError: p99, maxAbsoluteChannelError: max, psnrDb: mse === 0 ? null : 10 * Math.log10(255 * 255 / mse), geometryHash: source.geometryHash, samples: source.samples, windPhase: source.windPhase });
        }
      }
    } catch (error) { row.passed = false; row.error = error.message; }
    report.assets.push(row);
  }
}
check('all actual asset dimensions and declared digests match', report.assets.every(row => row.passed), { count: report.assets.length });
check('all full frames have declared digest and byte count', report.assets.filter(row => row.width > 512).every(row => row.digestInManifest && row.bytesInManifest));
check('every 1024 frame has verified native source provenance', report.sourceComparisons.filter(row => row.width === 1024 && row.sourceDigestMatchesReceipt).length === manifest.frames.length * 5);
check('source geometry is unchanged across themes and frames', new Set(report.sourceComparisons.map(row => row.geometryHash)).size === 1);
check('deterministic source wind matches each timeline position', report.sourceComparisons.every(row => row.windPhase === manifest.frames.find(frame => frame.id === row.frame).windPhase));
report.resolutionCoverage = themes.map(theme => ({ theme, framesAt2048: manifest.frames.filter(frame => frame.assets[theme].some(variant => variant.width >= 2048)).length, tiled4096Anchors: tileGroups.filter(row => row.theme === theme && row.width === 4096) }));
report.motionAccepted = false;
report.zoomAccepted = false;
report.passed = report.checks.every(row => row.passed);
await fs.mkdir(out, { recursive: true }); await fs.writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, revision: report.revision, framesPerTheme: report.framesPerTheme, assetCount: report.assets.length, nativeComparisons: report.sourceComparisons.length, failures: report.checks.filter(row => !row.passed), report: path.join(out, 'report.json') }, null, 2));
if (!report.passed) process.exitCode = 1;
