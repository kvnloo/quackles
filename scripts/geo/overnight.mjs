import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { evaluate } from './benchmark.mjs';
// Bounded, read-only scoring of separately collected answers. Never launches an agent.
const args=process.argv.slice(2);
if(args.length<2){console.error('Usage: node scripts/geo/overnight.mjs INPUT_DIR OUTPUT_DIR [rounds=3] [intervalSeconds=2400]\nINPUT_DIR/round-N.json must contain real final answers: [{id,engine,text}]. Missing rounds fail closed.');process.exit(2);}
const input=resolve(args[0]), output=resolve(args[1]), rounds=Number(args[2]??3), interval=Number(args[3]??2400);
if(!Number.isInteger(rounds)||rounds<1||rounds>48||!Number.isFinite(interval)||interval<0||interval>86400)throw Error('invalid bounds');
await mkdir(output,{recursive:true});
for(let n=1;n<=rounds;n++){
 if(n>1)await new Promise(resolve=>setTimeout(resolve,interval*1000));
 const responses=JSON.parse(await readFile(join(input,`round-${n}.json`),'utf8'));
 const report=evaluate(responses);
 await writeFile(join(output,`round-${n}.json`),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({round:n,suites:report.suites,multiEngineDiscovery:report.multiEngineDiscovery}));
}
