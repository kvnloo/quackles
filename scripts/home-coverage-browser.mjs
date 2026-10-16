// Run the existing verifier journey unchanged, adding painted-layer samples to
// each legacy row. QV_TOOL supplies the verifier checkout; no machine paths ship.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {coverageSnapshot,coverageReadback} from './home-coverage.mjs';
assert.ok(process.env.QV_TOOL&&process.env.TMPDIR,'QV_TOOL and TMPDIR required');
const tool=resolve(process.env.QV_TOOL),temp=await mkdtemp(join(process.env.TMPDIR,'coverage-v2-'));
let source=await readFile(join(tool,'harness.mjs'),'utf8');
for(const relative of ['./lib/env.mjs','./journeys.mjs'])source=source.replace(`from "${relative}"`,`from "${pathToFileURL(join(tool,relative)).href}"`);
let sampler=await readFile(join(tool,'lib/sampler.js'),'utf8');
assert.ok(sampler.includes('QV.rows.push(r);'),'recognized sampler seam');
sampler=`const coverageSnapshot=${coverageSnapshot.toString()};\n`+sampler.replace('QV.rows.push(r);','r.coverageV2=coverageSnapshot(); QV.rows.push(r);');
if(process.env.QV_COVERAGE_PIXELS==='1'){
 sampler=`const coverageReadback=${coverageReadback.toString()};\n`+sampler.replace('QV.rows.push(r);',`if(r.z>1.3&&r.dv&&r.dW>1024&&(QV.pixelCount||0)<3&&!(r.dr[0]<=r.fr[0]+1&&r.dr[1]<=r.fr[1]+1&&r.dr[0]+r.dr[2]>=r.fr[0]+r.fr[2]-1&&r.dr[1]+r.dr[3]>=r.fr[1]+r.fr[3]-1)){r.coveragePixels=coverageReadback();QV.pixelCount=(QV.pixelCount||0)+1;} QV.rows.push(r);`);
}
if(process.env.QV_COVERAGE_FAULT==='1')sampler+=`\naddEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='.sequence-floor,.sequence-underlay{visibility:hidden!important}';document.head.append(style);});`;
const old='const SAMPLER = fs.readFileSync(new URL("./lib/sampler.js", import.meta.url), "utf8");';
assert.ok(source.includes(old),'recognized harness sampler');
source=source.replace(old,`const SAMPLER = ${JSON.stringify(sampler)};`);
source=source.replace('fs.rmSync(out, { recursive: true, force: true });','if (fs.existsSync(out)) throw new Error("Refusing to overwrite a prior measurement: " + out);');
await writeFile(join(temp,'harness.mjs'),source);
const result=spawnSync(process.execPath,[...process.execArgv,join(temp,'harness.mjs'),...process.argv.slice(2)],{stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
