import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const manifest=JSON.parse(readFileSync('public/lineage/manifest.json'));
const bytes=readFileSync(`public/lineage/${manifest.dataset}`);
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
assert.ok(manifest.dataset.includes(manifest.sha256.slice(0,16)));
const data=JSON.parse(bytes);
assert.equal(data.schema,1);assert.equal(data.entries.length,665);assert.equal(manifest.versions,665);
assert.doesNotMatch(bytes.toString(),/\/home\/|\/mnt\/|\/workspace\/|file:|token=|secret|original_path|occurrences|git_path/i);
const seen=new Set(), thumbs=new Map(),medium=new Map();
for(const e of [...data.entries,...Object.values(data.current),...Object.values(data.references)]) {
  assert.ok(['day','white','blue','dark','night'].includes(e.theme));
  for(const [size,tuple] of Object.entries(e.thumbs)) {
    assert.match(tuple[0],/^[a-f0-9]{24}\.webp$/);assert.ok(tuple[1]>0&&tuple[2]>0&&tuple[2]<=1024);
    (size==='medium'?medium:thumbs).set(tuple[0],tuple[3]);
    if(process.env.LINEAGE_ASSETS){const image=readFileSync(join(process.env.LINEAGE_ASSETS,'lineage/v1',tuple[0]));assert.equal(image.length,tuple[3]);assert.ok(tuple[0].startsWith(createHash('sha256').update(image).digest('hex').slice(0,24)));}
  }
}
for(const e of data.entries){const id=e.theme+'/'+e.version;assert.ok(!seen.has(id));seen.add(id);assert.deepEqual(Object.keys(e).sort(),['theme','version','date','dateSource','phase','status','hash','caption','thumbs'].sort());}
for(const [theme,count] of Object.entries(data.counts)) {
  const entries=data.entries.filter(e=>e.theme===theme);
  assert.equal(entries.length,count);assert.equal(entries[0].version,'v0');
  assert.ok(seen.has(theme+'/'+data.current[theme].version));
}
assert.equal(data.entries.find(e=>e.theme==='blue'&&e.version==='v0').date,'2026-09-15T03:33:45+00:00');
assert.equal([...thumbs.values()].reduce((a,b)=>a+b,0),manifest.thumbnailBytes);
assert.ok(manifest.thumbnailBytes<=25_000_000);
assert.equal([...medium.values()].reduce((a,b)=>a+b,0),manifest.mediumBytes);
assert.ok(statSync('public/lineage/viewer.mjs').size<60_000);
console.log(`PASS: ${seen.size} unique versions; allowlisted schema; content hashes; ${manifest.thumbnailBytes} thumbnail bytes`);
