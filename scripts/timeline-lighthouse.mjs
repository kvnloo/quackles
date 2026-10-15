import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {serve} from './lineage-server.mjs';
const artifacts=resolve(process.env.ARTIFACTS||join(process.env.TMPDIR,'timeline-lighthouse'));
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(process.env.TMPDIR,'timeline-lh-profile-'));
const server=await serve();
try {
  const code=await new Promise((yes,no)=>{
    const child=spawn('npx',['--no-install','lighthouse',server.url+'/lineage/','--quiet',`--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage --user-data-dir=${profile}`,'--output=json','--output=html',`--output-path=${join(artifacts,'lineage')}`],{stdio:'inherit',env:{...process.env,CHROME_PATH:process.env.CHROME}});
    child.once('error',no);child.once('exit',yes);
  });
  if(code)throw new Error(`Lighthouse exited ${code}`);
  const report=JSON.parse(await readFile(join(artifacts,'lineage.report.json'),'utf8'));
  const result={scores:Object.fromEntries(Object.entries(report.categories).map(([k,v])=>[k,v.score])),lcp:report.audits['largest-contentful-paint'].numericValue,cls:report.audits['cumulative-layout-shift'].numericValue,blocking:report.audits['total-blocking-time'].numericValue,runtimeError:report.runtimeError||null,classification:'mobile headless emulation; local asset mirror'};
  await writeFile(join(artifacts,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await server.close();await rm(profile,{recursive:true,force:true});}
