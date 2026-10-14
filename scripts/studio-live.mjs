// Explicitly opt in: this submits ONE real ChatGPT-subscription image edit, never retries.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ComfyAdapter} from '../lib/harness/comfy.ts';
if (!process.argv.includes('--live')) throw new Error('Use --live only with the owner\'s generation approval.');
const dir=resolve(process.env.ARTIFACTS || 'artifacts/studio');
await mkdir(dir,{recursive:true});
try {await stat(`${dir}/generation-attempt.json`);throw new Error('An attempt is already recorded. Inspect it; do not blindly resubmit.');} catch(e) {if(e.code!=='ENOENT') throw e;}
const input=await readFile(`${dir}/hero.png`);
const base=process.env.COMFY_URL || 'http://127.0.0.1:8188';
const queue=await (await fetch(`${base}/queue`)).json();
if(queue.queue_running.length || queue.queue_pending.length) throw new Error('ComfyUI queue is busy. Wait; do not interrupt other work.');
const adapter=new ComfyAdapter(base);
const detected=await adapter.detect();
if(!detected.available || !detected.detail.includes('ChatGPT')) throw new Error(`ChatGPT node not available: ${detected.detail}`);
const prompt='Restyle this exact Microduck robot showroom as a Pollen Robotics-inspired mint ceramic and warm ivory design study. Keep the robot geometry, single eye, all joints, full silhouette, camera composition, stone blocks and art panels in their existing positions. Change only surface finish, palette and studio lighting: pale mint robot shell, warm limestone architecture, muted teal blue artwork, softly lit editorial product photograph. Preserve the open mechanical legs. No added text, no extra limbs, no other robots.';
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt={classification:'REAL ComfyUI CodexChatGPTImage edit via the shipped adapter; source PNG from EMULATION WebGL editor',url:base,prompt,size:'1024x1536',inputPath:`${dir}/hero.png`,inputSha256:hash(input),adapterSha256:hash(await readFile('lib/harness/comfy.ts')),startedAt:new Date().toISOString(),submissions:1};
await writeFile(`${dir}/generation-attempt.json`,JSON.stringify(receipt,null,2),{flag:'wx'});
try {
  const output=await adapter.editImage({prompt,refs:[new Blob([input],{type:'image/png'})],size:'1024x1536'});
  const bytes=Buffer.from(await output.blob.arrayBuffer());
  const path=`${dir}/restyle.png`; await writeFile(path,bytes);
  const history=await (await fetch(`${base}/history/${encodeURIComponent(output.promptId)}`)).json();
  const entry=history[output.promptId];
  if(!entry?.status?.completed) throw new Error('Read-back did not confirm completed job.');
  await writeFile(`${dir}/generation-history.json`,JSON.stringify(entry,null,2));
  const complete={...receipt,promptId:output.promptId,backend:output.backend,seconds:output.seconds,outputPath:path,sha256:hash(bytes),bytes:bytes.length,completedAt:new Date().toISOString()};
  await writeFile(`${dir}/generation-receipt.json`,JSON.stringify(complete,null,2));
  console.log(JSON.stringify(complete,null,2));
} catch(e) {await writeFile(`${dir}/generation-error.txt`,String(e));throw e;}
