import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** Only this explicit static island has no client components/Next links.
 * All incoming navigation must remain ordinary anchors (document navigation).
 * Other routes and their RSC payloads are intentionally untouched.
 */
export function stripRuntime(html) {
  if (!html.includes('data-lineage="true"') || !html.includes('/lineage/viewer.')) throw new Error('Not the static lineage island');
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, tag => /^<script\b[^>]*\bsrc="[^"]*\/lineage\/viewer\.(?:[a-f0-9]+\.)?mjs"[^>]*>/.test(tag) ? tag : '')
    .replace(/<link\b[^>]*\bas="script"[^>]*>/g,'');
}
export async function inlineStyles(html, load) {
  for (const tag of html.match(/<link\b[^>]*>/g) || []) {
    if (!tag.includes('rel="stylesheet"')) continue;
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    const path = href?.match(/\/_next\/static\/css\/[a-f0-9]+\.css$/)?.[0];
    if (!path) throw new Error('Unexpected lineage stylesheet URL');
    const css = await load(path);
    html = html.replace(tag, `<style data-lineage-critical>${css.replaceAll('</style', '<\\/style')}</style>`);
  }
  return html;
}
async function main() {
  const root=resolve(process.env.OUT_DIR || 'out');
  const target=resolve(root,'lineage/index.html');
  const source=await readFile(resolve(root,'lineage/viewer.mjs'));
  const digest=createHash('sha256').update(source).digest('hex').slice(0,16);
  const name=`viewer.${digest}.mjs`;
  await writeFile(resolve(root,'lineage',name),source);
  const original=await readFile(target,'utf8');
  const stripped=await inlineStyles(stripRuntime(original).replaceAll('/lineage/viewer.mjs',`/lineage/${name}`),path=>readFile(resolve(root,'.'+path),'utf8'));
  await writeFile(target,stripped);
  console.log(`Static lineage island: ${name}; ${Buffer.byteLength(original)} → ${Buffer.byteLength(stripped)} HTML bytes; no React runtime`);
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
