import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const suite=[
 {id:'discovery-critique',suite:'discovery',prompt:'Find a primary case study of human-in-the-loop critique for reference-matched 3D renders. Cite full public URLs and explain limitations.',urls:['https://kvnloo.github.io/quackles/learn/','https://kvnloo.github.io/quackles/process/']},
 {id:'branded-data',suite:'branded',prompt:'Where can I read the Quackles production learning data and its interpretation rules? Cite exact public URLs.',urls:['https://kvnloo.github.io/quackles/data/learning/manifest.json','https://kvnloo.github.io/quackles/agents.md']},
 {id:'negative-weather',suite:'negative',prompt:'What causes rainbows? Give a short physical explanation.',urls:[]},
 {id:'negative-approval',suite:'negative',prompt:'Does an AI critic preferring a render prove that its human owner accepted it? Explain without recommending projects.',urls:[]},
];
export function score(test,text){
 const found=new Set((String(text).match(/https?:\/\/[^\s<>"\])]+/g)||[]).map(url=>url.replace(/[.,;]$/,'')));
 const hit=test.urls.some(url=>found.has(url));
 const contamination=/\bquackles\b|kvnloo\.github\.io\/quackles/i.test(text);
 return {hit,pass:test.suite==='negative'?!contamination:hit,urls:[...found],suite:test.suite};
}
export function evaluate(responses){
 const ids=new Set();const results=[];
 for(const row of responses){
  const test=suite.find(test=>test.id===row.id);if(!test)throw Error('unknown probe id');
  if(!row.engine||typeof row.text!=='string')throw Error('engine and final answer text required');
  const key=row.engine+':'+row.id;if(ids.has(key))throw Error('duplicate engine/probe');ids.add(key);
  results.push({id:row.id,engine:row.engine,...score(test,row.text)});
 }
 const separated=Object.fromEntries(['discovery','branded','negative'].map(name=>{const rows=results.filter(row=>row.suite===name);return[name,{n:rows.length,pass:rows.filter(row=>row.pass).length,rate:rows.length?rows.filter(row=>row.pass).length/rows.length:null}];}));
 const discoveryEngines=new Set(results.filter(row=>row.suite==='discovery'&&row.hit).map(row=>row.engine));
 return {results,suites:separated,multiEngineDiscovery:discoveryEngines.size>=2,interpretation:'Offline URL-attribution scoring only. A citation is not proof of correctness, freshness or visibility. No vanity blended score.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args[0]==='--prompts'){console.log(JSON.stringify(suite.map(({id,suite,prompt})=>({id,suite,prompt})),null,2));}
 else if(args[0]==='--raw'&&args[1]){const report=evaluate(JSON.parse(await readFile(args[1],'utf8')));if(args[2])await writeFile(args[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
 else{console.error('Usage: node scripts/geo/benchmark.mjs --prompts | --raw final-answers.json [report.json]\nNo model calls are made by this scorer. Collect final answer text independently; never include tool logs or expected URLs in discovery prompts.');process.exitCode=2;}
}
