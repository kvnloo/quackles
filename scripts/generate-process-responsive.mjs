#!/usr/bin/env node
// Offline derivative generation; full-size published evidence stays byte-identical.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { processImages } from '../content/process-images.ts';
const output={};
for(const image of Object.values(processImages)){
 const source=path.join('public',image.src);
 const candidates=[];
 for(const width of [480,800,1200].filter(w=>w<image.width)){
  const src=image.src.replace(/\.webp$/,`-${width}w.webp`);
  await sharp(source).resize({width,withoutEnlargement:true}).webp({quality:88,effort:6}).toFile(path.join('public',src));
  candidates.push({src,width});
 }
 output[image.src]=[...candidates,{src:image.src,width:image.width}];
}
await fs.writeFile('content/process-responsive.json',JSON.stringify(output,null,2)+'\n');
console.log(`Generated responsive candidates for ${Object.keys(output).length} images`);
