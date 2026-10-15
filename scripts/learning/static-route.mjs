import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
/** /learn is deliberately a static document with a tiny vanilla enhancement.
 * It has no React client components, Next Link navigation or state to hydrate.
 * Do not apply this transform to interactive routes or route RSC payloads.
 */
export function staticRoute(html) {
  return html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (tag, attributes) =>
    /type=["']application\/ld\+json["']/.test(attributes) || /src=["'][^"']*\/learn\/explorer\.js["']/.test(attributes) ? tag : '')
    .replace(/<link\b[^>]*>/gi, tag => /as=["']script["']/.test(tag) || /rel=["']modulepreload["']/.test(tag) ? '' : tag);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = 'out/learn/index.html';
  const before = readFileSync(target, 'utf8');
  const after = staticRoute(before);
  writeFileSync(target, after);
  console.log(JSON.stringify({route:'/learn/', beforeBytes:Buffer.byteLength(before), afterBytes:Buffer.byteLength(after), hydration:'none; progressive DOM enhancement'}));
}
