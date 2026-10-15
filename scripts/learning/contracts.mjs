import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const page = 'app/learn/page.tsx';
assert.ok(existsSync(page), 'learning route exists');
const source = readFileSync(page, 'utf8');
assert.ok(!source.includes('"use client"'), 'story ships as static HTML');
const manifest = JSON.parse(readFileSync('public/data/learning/manifest.json'));
for (const file of manifest.files) {
  assert.equal(createHash('sha256').update(readFileSync(`public/${file.path}`)).digest('hex'), file.sha256);
}
const data = JSON.parse(readFileSync(`public/${manifest.explorer}`));
assert.equal(data.filter(row => ['attempt','component-attempt','integration-attempt'].includes(row.kind)).length, manifest.counts.attempts);
assert.equal(new Set(data.map(row => row.id)).size, data.length);
const lessons = JSON.parse(readFileSync('data/learning/curation.json')).lessons;
assert.equal(lessons.length, 6);
for (const lesson of lessons) {
  assert.ok(lesson.evidence.every(id => data.some(row => row.id === id)));
}
for (const file of manifest.files) {
  assert.doesNotMatch(readFileSync(`public/${file.path}`, 'utf8'), /\/mnt\/|\/home\/|\/workspace\/|@session:|github_pat_|Bearer [A-Za-z0-9]/);
}
console.log(JSON.stringify({status:'PASS', files:manifest.files.length, attempts:manifest.counts.attempts, lessons:lessons.length}));
