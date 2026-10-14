import test from 'node:test';
import assert from 'node:assert/strict';
import {partAt, bboxTarget} from '../lib/editor/mask.ts';
import {inspectionCrop} from '../lib/sequence/render.ts';
import {featherMask, compositeInside} from '../lib/editor/composite.ts';
import {cropBox} from '../lib/editor/surface.ts';
import {PRESETS,parseTheme,serializeTheme} from '../lib/studio/theme.ts';
test('generation crops match a supported image aspect without distorting the returned patch',()=>{
 for(const box of [[349,410,365,228],[0,0,1024,1536],[0,0,89,91],[940,1400,84,136]]) {
  const [x,y,w,h]=cropBox(box,1024,1536);
  assert.ok(x>=0 && y>=0 && x+w<=1024 && y+h<=1536);
  assert.ok([1,1.5,2/3].some(r=>Math.abs(w/h-r)<.0001));
  assert.ok(x<=box[0] && y<=box[1] && x+w>=box[0]+box[2] && y+h>=box[1]+box[3]);
 }
});
test('per-part edits round trip in existing theme JSON; transient URLs and invalid tones fail closed',()=>{
 const theme={...PRESETS[0],partEdits:{'1':{color:'#a0b0c0',amount:0.35,tone:0.1,prompt:'Satin ceramic',patchKey:'day:1:receipt',bbox:[10,20,30,40]}}};
 assert.deepEqual(parseTheme(serializeTheme(theme)).partEdits,theme.partEdits);
 assert.throws(()=>parseTheme(JSON.stringify({...theme,partEdits:{'1':{...theme.partEdits['1'],tone:Infinity}}})));
 assert.throws(()=>parseTheme(JSON.stringify({...theme,partEdits:{'1':{...theme.partEdits['1'],patchKey:'blob:temporary'}}})));
});
test('feather is inward only; composite leaves every outside byte untouched',()=>{
 const ids=new Uint8Array(49); for(let y=1;y<6;y++) for(let x=1;x<6;x++) ids[y*7+x]=1;
 const alpha=featherMask(ids,7,7,1,2);
 assert.equal(alpha[0],0); assert.equal(alpha[8],0.5); assert.equal(alpha[24],1);
 const base=new Uint8ClampedArray(196).fill(60), patch=new Uint8ClampedArray(196).fill(200);
 for(let i=0;i<49;i++) patch[i*4+3]=255;
 const out=compositeInside(base,patch,alpha);
 for(let i=0;i<49;i++) for(let c=0;c<4;c++) if(!ids[i]) assert.equal(out[i*4+c],base[i*4+c]);
 assert.equal(out[8*4],130); assert.equal(out[24*4],200);
});
test('bbox camera target frames the part with margin using existing inspection coordinates',()=>{
 const target=bboxTarget([400,600,200,300],1000,1500,8);
 assert.ok(target.zoom>1 && target.zoom<=8);
 const crop=inspectionCrop(target.zoom,target.x,target.y);
 assert.ok(crop.x<=0.4 && crop.y<=0.4);
 assert.ok(crop.x+crop.width>=0.6 && crop.y+crop.height>=0.6);
 const all=bboxTarget([0,0,1000,1500],1000,1500,8);
 assert.deepEqual(all,{zoom:1,x:0.5,y:0.5});
});
test('point lookup uses rendered IDs, not bounding rectangles, and rejects outside points',()=>{
 const ids=new Uint8Array([0,1,1,0,2,0]);
 assert.equal(partAt(ids,3,2,0.4,0.2),1);
 assert.equal(partAt(ids,3,2,0.9,0.9),0);
 for(const [x,y] of [[-0.1,0],[1,0],[0,1],[NaN,0]]) assert.equal(partAt(ids,3,2,x,y),0);
});
