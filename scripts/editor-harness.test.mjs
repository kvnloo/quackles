import test from 'node:test';
import assert from 'node:assert/strict';
import {ComfyAdapter} from '../lib/harness/comfy.ts';
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
test('masked SDXL fallback uses inpaint latent and ControlNet conditioning, not whole-image img2img',async()=>{
 const nodes={CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sd_xl_base.safetensors']]}}},ControlNetLoader:{input:{required:{control_net_name:[['controlnet-canny-sdxl.safetensors']]}}}};
 for(const key of ['KSampler','CLIPTextEncode','EmptyLatentImage','VAEDecode','SaveImage','LoadImage','VAEEncodeForInpaint','ImageToMask','ControlNetApplyAdvanced','Canny']) nodes[key]={};
 let graph;
 const adapter=new ComfyAdapter('http://localhost:8188',{pollMs:0,fetcher:async(url,init={})=>{
  if(url.includes('/object_info'))return json(nodes);
  if(url.endsWith('/upload/image'))return json({name:'input.png'});
  if(url.endsWith('/prompt')){graph=JSON.parse(init.body).prompt;return json({prompt_id:'mask-test'});}
  if(url.includes('/history/'))return json({'mask-test':{outputs:{'7':{images:[{filename:'result.png'}]}}}});
  return new Response(new Blob(['unit-test-fixture'],{type:'image/png'}));
 }});
 const png=new Blob(['unit-test-fixture'],{type:'image/png'});
 await adapter.editImage({prompt:'satin',refs:[png,png],mask:png,size:'1024x1024'});
 assert.equal(graph['9'].class_type,'VAEEncodeForInpaint');
 assert.equal(graph['13'].class_type,'ControlNetApplyAdvanced');
 assert.deepEqual(graph['5'].inputs.positive,['13',0]);
 assert.deepEqual(graph['9'].inputs.mask,['11',0]);
 assert.equal(graph['14'].class_type,'Canny');
});
