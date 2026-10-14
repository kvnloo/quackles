import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ComfyAdapter} from '../lib/harness/comfy.ts';
import {OpenAIAdapter, OllamaAdapter, probeHarnesses} from '../lib/harness/other.ts';
const reply = v => new Response(JSON.stringify(v), {headers:{'Content-Type':'application/json'}});
const info = {CodexChatGPTImage:{input:{required:{}}}, SaveImage:{}, LoadImage:{}};
test('Comfy detects ChatGPT first and posts an uploaded reference then reads history', async () => {
  const calls=[];
  const fetcher=async (url, init={}) => {
    calls.push([String(url),init]);
    if (String(url).endsWith('/object_info')) return reply(info);
    if (String(url).endsWith('/upload/image')) return reply({name:'hero.png',subfolder:'studio'});
    if (String(url).endsWith('/prompt')) return reply({prompt_id:'one'});
    if (String(url).includes('/history/')) return reply({one:{status:{completed:true},outputs:{'2':{images:[{filename:'out.png',subfolder:'',type:'output'}]}}}});
    return new Response(new Blob(['png'],{type:'image/png'}));
  };
  const adapter=new ComfyAdapter('http://127.0.0.1:8188', {fetcher,pollMs:0});
  assert.equal((await adapter.detect()).available,true);
  const out=await adapter.editImage({prompt:'blue ceramic',refs:[new Blob(['reference'],{type:'image/png'})],size:'1024x1536'});
  assert.equal(out.backend,'chatgpt');
  assert.equal(out.blob.type,'image/png');
  const graph=JSON.parse(calls.find(([u])=>u.endsWith('/prompt'))[1].body).prompt;
  assert.equal(graph['1'].class_type,'CodexChatGPTImage');
  assert.equal(graph['1'].inputs.prompt,'blue ceramic');
  assert.deepEqual(graph['1'].inputs.image,['3',0]);
  assert.equal(graph['3'].inputs.image,'studio/hero.png');
});
test('Comfy detects unavailable hosts and rejects execution errors without retrying a generation',async()=>{
  const offline=new ComfyAdapter('http://localhost:8188',{fetcher:async()=>{throw Error('offline')}});
  assert.equal((await offline.detect()).available,false);
  let posts=0;
  const broken=new ComfyAdapter('http://localhost:8188',{pollMs:0,fetcher:async(url)=>{
    if(url.endsWith('/object_info')) return reply(info);
    if(url.endsWith('/prompt')) { posts++; return reply({prompt_id:'one'}); }
    return reply({one:{status:{status_str:'error',messages:[['execution_error',{exception_message:'node failed'}]]}}});
  }});
  await assert.rejects(()=>broken.generateImage({prompt:'x',refs:[],size:'1024x1024'}),/node failed/);
  assert.equal(posts,1);
});
test('OpenAI custom URL supports JSON generation and multipart reference edits',async()=>{
  const calls=[];
  const a=new OpenAIAdapter('http://localhost:8642/v1','image-model',{fetcher:async(url,init={})=>{
    calls.push([url,init]);
    if(url.endsWith('/models')) return reply({data:[{id:'image-model'}]});
    return reply({data:[{b64_json:btoa('image')}]});
  }});
  assert.equal((await a.detect()).available,true);
  assert.equal((await a.generateImage({prompt:'robot',refs:[],size:'1024x1024'})).blob.size,5);
  await a.editImage({prompt:'blue',refs:[new Blob(['ref'],{type:'image/png'})],size:'1024x1536'});
  assert.equal(calls[1][0],'http://localhost:8642/v1/images/generations');
  assert.equal(calls[2][0],'http://localhost:8642/v1/images/edits');
  assert.equal(calls[2][1].body.get('prompt'),'blue');
  assert.equal(calls[2][1].body.get('image').size,3);
});
test('Ollama is prompt-only and probing reports independently failed hosts',async()=>{
  const a=new OllamaAdapter('http://localhost:11434',{fetcher:async(url)=>url.endsWith('/api/tags')?reply({models:[{name:'qwen3:4b'}]}):reply({response:'ceramic robot in daylight'})});
  assert.equal((await a.detect()).available,true);
  assert.equal(a.capabilities.generate,false);
  assert.equal(await a.helpPrompt('robot'),'ceramic robot in daylight');
  await assert.rejects(()=>a.generateImage({}),/prompt help only/i);
  const result=await probeHarnesses([a,{id:'bad',detect:async()=>{throw Error('CORS')}}]);
  assert.equal(result.length,2);
  assert.equal(result[0].available,true);
  assert.equal(result[1].available,false);
});
