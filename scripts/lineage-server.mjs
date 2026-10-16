import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
/** Owned ephemeral server; mirrors only the explicitly supplied asset checkout. */
export async function serve({ directory='out', assets=process.env.LINEAGE_ASSETS, prefix=process.env.NEXT_PUBLIC_BASE_PATH || '' }={}) {
  const root=resolve(directory), assetRoot=assets&&resolve(assets);
  const server=createServer(async(req,res)=>{
    try {
      let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(prefix){if(!pathname.startsWith(prefix+'/'))throw new Error('prefix');pathname=pathname.slice(prefix.length);}
      const external=pathname.startsWith('/quackles-assets/');
      const base=external?assetRoot:root;
      if(!base)throw new Error('Set LINEAGE_ASSETS to the local image checkout');
      if(external)pathname=pathname.slice('/quackles-assets'.length);
      let path=resolve(base,'.'+pathname);
      if(path!==base&&!path.startsWith(base+sep))throw new Error('path');
      if((await stat(path)).isDirectory())path=resolve(path,'index.html');
      let bytes=await readFile(path);
      const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain'};
      const headers={'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'};
      if(/\.(?:html|m?js|json|css)$/.test(path)&&req.headers['accept-encoding']?.includes('gzip')){bytes=gzipSync(bytes);headers['Content-Encoding']='gzip';}
      res.writeHead(200,headers);res.end(bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  return {url:`http://127.0.0.1:${server.address().port}${prefix}`,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
