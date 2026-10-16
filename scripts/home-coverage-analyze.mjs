import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {paintedCoverage} from './home-coverage.mjs';
const root=resolve(process.argv[2]),results=[];
for(const journey of ['quick-pans','touch-feel','touch-pinch']){
 const dir=join(root,journey),rows=JSON.parse(await readFile(join(dir,'rows.json'),'utf8'));
 const hd=rows.findIndex(r=>r.dv&&r.dW>1024),eligible=hd<0?[]:rows.slice(hd).filter(r=>(r.z||1)*r.vv[0]>1.3);
 const measured=eligible.map(r=>{
  if(!r.coverageV2)throw new Error('Missing coverage snapshot');
  const cov=paintedCoverage({frame:r.fr,base:r.br,layers:r.coverageV2.layers});
  const detail=paintedCoverage({frame:r.fr,base:r.br,layers:{detail:r.coverageV2.layers.detail}});
  const [x,y,w,h]=r.fr,[scale,ox,oy]=r.vv;
  const vx=Math.max(x,ox),vy=Math.max(y,oy),vr=Math.min(x+w,ox+412/scale),vb=Math.min(y+h,oy+915/scale);
  const visible=vr>vx&&vb>vy?paintedCoverage({frame:[vx,vy,vr-vx,vb-vy],base:r.br,layers:r.coverageV2.layers}):null;
  const dr=r.dr,legacy=!(r.dv&&dr&&dr[0]<=x+1&&dr[1]<=y+1&&dr[0]+dr[2]>=x+w-1&&dr[1]+dr[3]>=y+h-1);
  return {w:r.w,z:r.z,mv:r.mv,legacy,detail,cov,visible,layerRects:Object.fromEntries(Object.entries(r.coverageV2.layers).map(([k,v])=>[k,v.rects.length]))};
 });
 const result={journey,eligible:eligible.length,legacyEdgeRows:measured.filter(r=>r.legacy).length,paintedDetailGapRows:measured.filter(r=>r.detail.plateFraction>1e-6).length,paintedUnionGapRows:measured.filter(r=>r.cov.plateFraction>1e-6).length,paintedUnionEdgeRows:measured.filter(r=>r.cov.edgeGap).length,visibleUnionGapRows:measured.filter(r=>r.visible?.plateFraction>1e-6).length,maxPlateFraction:Math.max(0,...measured.map(r=>r.cov.plateFraction)),falsePositiveRows:measured.filter(r=>r.legacy&&r.cov.plateFraction<=1e-6).length,falseNegativeRows:measured.filter(r=>!r.legacy&&r.cov.plateFraction>1e-6).length};
 results.push(result);await writeFile(join(dir,'coverage-v2.json'),JSON.stringify({result,rows:measured},null,2));
}
await writeFile(join(root,'coverage-summary.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
