import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {paintedCoverage} from './home-coverage.mjs';
const root=resolve(process.argv[2]);
for(const mode of ['natural','fault']) {
 const rows=JSON.parse(await readFile(join(root,mode,'r1/touch-feel/rows.json'),'utf8'));
 const samples=rows.filter(r=>r.coveragePixels);
 assert.equal(samples.length,3,'three pixel readbacks required');
 for(const r of samples) {
  const result=paintedCoverage({frame:r.fr,base:r.br,layers:r.coverageV2.layers});
  assert.equal(result.plateFraction>1e-6,mode==='fault','painted rectangle prediction');
  assert.equal(r.coveragePixels.transparent>0,mode==='fault','actual copied canvas alpha');
 }
 console.log(`${mode}: 3/3 predictions match actual pixel readback`);
}
