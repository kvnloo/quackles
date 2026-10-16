import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
assert.ok(existsSync('public/lineage/viewer.mjs'), 'lineage viewer module exists');
const { filterEntries, windowRange, parseHash } = await import('../public/lineage/viewer.mjs');
const entries = [
  {theme:'day',version:'v0',date:'2026-09-15T00:00:00Z',phase:'Calibration',status:'rejected',caption:'Day · r1',hash:'a'},
  {theme:'blue',version:'v0',date:'2026-09-14T00:00:00Z',phase:'Plate',status:'kept',caption:'Blue',hash:'b'},
  {theme:'day',version:'v1',date:'2026-09-16T00:00:00Z',phase:'Calibration',status:'kept',caption:'Day · r2',hash:'c'},
];
assert.deepEqual(filterEntries(entries, {}), [entries[1],entries[0],entries[2]]);
assert.deepEqual(filterEntries(entries, {theme:'day',status:'kept',phase:'Calibration',query:'r2',newest:true}), [entries[2]]);
assert.deepEqual(filterEntries(entries, {query:'not found'}), []);
assert.deepEqual(filterEntries(entries, {newest:true}), [entries[2],entries[0],entries[1]]);
assert.deepEqual(parseHash('#/day/v42'), {theme:'day',version:'v42'});
assert.deepEqual(parseHash('#/day/current'), {theme:'day',version:'current'});
assert.equal(parseHash('#/../private'), null);
assert.equal(parseHash('#/day/v42junk'), null);
for (const count of [0,1,665]) for (const cols of [2,5]) for (const top of [0,400,50000]) {
  const range = windowRange(count,cols,top,800,400);
  assert.ok(range.start>=0 && range.end<=count && range.end>=range.start);
  assert.ok(range.end-range.start<=cols*6, 'DOM bounded to viewport + two rows');
}
console.log('PASS: filtering, order, deep links, bounded windows');
