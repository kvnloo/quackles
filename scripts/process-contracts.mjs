import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';

assert.ok(existsSync('content/process.ts'), 'process story must be maintained as structured chapter data');
const { chapters } = await import('../content/process.ts');
const { processImages } = await import('../content/process-images.ts');
assert.ok(chapters.length >= 8 && chapters.length <= 12, 'high-level story has 8-12 chapters');
assert.equal(new Set(chapters.map(c => c.id)).size, chapters.length, 'unique chapter anchors');
assert.equal(chapters.find(c => c.id === 'night').status, 'In progress');
const used = new Set(['hero']);
for (const c of chapters) {
  assert.ok(c.title && c.intro && c.image && c.dives.length, `${c.id}: complete chapter`);
  used.add(c.image);
  for (const d of c.dives) {
    assert.ok(d.title && d.paragraphs.length && d.source, `${c.id}: sourced deep dive`);
    for (const image of d.images || []) used.add(image);
  }
}
for (const id of used) assert.ok(processImages[id], `${id}: referenced image exists`);
let bytes = 0;
for (const [id, image] of Object.entries(processImages)) {
  assert.ok(used.has(id), `${id}: no unreferenced assets`);
  assert.ok(image.alt && image.caption && image.width > 0 && image.height > 0);
  assert.ok(image.width <= 1600 && /^\/process\/images\/[a-z0-9-]+\.webp$/.test(image.src));
  bytes += statSync(`public${image.src}`).size;
}
assert.ok(bytes <= 25_000_000, 'added images stay below 25 MB');
const serialized = JSON.stringify({ chapters, processImages });
assert.doesNotMatch(serialized, /\/mnt\/|\/home\/|\/workspace\/|@session:|store_va|localhost|127\.0\.0\.1/);
console.log(`PASS: ${chapters.length} chapters, ${used.size} images, ${bytes} image bytes; complete public-safe content`);
