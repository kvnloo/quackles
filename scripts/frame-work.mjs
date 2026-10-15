// Chrome trace work, not rAF cadence or physical presentation.
export const WORK_NAMES = new Set(['FireAnimationFrame','UpdateLayoutTree','RecalculateStyles','Layout','PrePaint','Paint','Layerize','Commit','ProxyMain::BeginMainFrame::commit','Decode Image','ImageDecodeTask','Decode LazyPixelRef']);
export function quantile(values, q) {
  if (!values.length) return null;
  const s=[...values].sort((a,b)=>a-b), n=(s.length-1)*q, i=Math.floor(n);
  return s[i]+(s[Math.ceil(n)]-s[i])*(n-i);
}
export function distribution(values) {
  return {n:values.length,median:quantile(values,.5),q1:quantile(values,.25),q3:quantile(values,.75),iqr:values.length?quantile(values,.75)-quantile(values,.25):null,p95:quantile(values,.95),max:values.length?Math.max(...values):null};
}
function union(intervals) {
  let sum=0, end=-Infinity;
  for (const [a,b] of intervals.sort((a,b)=>a[0]-b[0])) {sum+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
  return sum;
}
export function gateRun(result) {
  const checks={frames:result.frameCount>=240,traceCallbacks:result.counts?.FireAnimationFrame>=240,p95:Number.isFinite(result.work?.p95)&&result.work.p95<=4,max:Number.isFinite(result.work?.max)&&result.work.max<=8.3,noForcedLayout:result.forcedLayouts?.length===0,noLoAF:result.loafs?.length===0,noErrors:result.errors?.length===0,scrolled:result.scrollDistance>=5760};
  return {pass:Object.values(checks).every(Boolean),checks};
}
export function analyzeTrace(events) {
  const start=events.find(e=>e.name==='fw:start'), stop=events.find(e=>e.name==='fw:end');
  if (!start || !stop || stop.ts<=start.ts) throw new Error('Missing/reversed measurement marks');
  const main=events.filter(e=>e.pid===start.pid&&e.tid===start.tid);
  const boundaries=main.filter(e=>e.name==='ProxyMain::BeginMainFrame'&&e.ph==='X'&&e.ts>=start.ts&&e.ts<stop.ts).sort((a,b)=>a.ts-b.ts);
  if (!boundaries.length) throw new Error('No main-thread frame boundaries: unsupported trace');
  const spans=main.filter(e=>e.ph==='X'&&e.dur>=0&&e.ts>=boundaries[0].ts&&e.ts<stop.ts);
  const work=spans.filter(e=>WORK_NAMES.has(e.name));
  const scripts=spans.filter(e=>['FunctionCall','FireAnimationFrame','EvaluateScript','RunMicrotasks'].includes(e.name));
  const forcedLayouts=spans.filter(e=>['Layout','UpdateLayoutTree','RecalculateStyles'].includes(e.name)&&scripts.some(s=>s.ts<=e.ts&&s.ts+s.dur>=e.ts+e.dur)).map(e=>({name:e.name,ts:e.ts,durationMs:e.dur/1000,stack:e.args?.beginData?.stackTrace||e.args?.data?.stackTrace}));
  const frames=boundaries.map((frame,i)=>{
    const end=boundaries[i+1]?.ts??stop.ts;
    const selected=work.filter(e=>e.ts<end&&e.ts+e.dur>frame.ts);
    const intervals=selected.map(e=>[Math.max(frame.ts,e.ts),Math.min(end,e.ts+e.dur)]);
    const cpu=selected.filter(e=>Number.isFinite(e.tts)&&Number.isFinite(e.tdur)).map(e=>[e.tts,e.tts+e.tdur]);
    return {ts:frame.ts,workMs:union(intervals)/1000,threadCpuMs:union(cpu)/1000,events:selected.map(e=>({name:e.name,durMs:e.dur/1000}))};
  });
  return {frameCount:frames.length,frames,work:distribution(frames.map(f=>f.workMs)),forcedLayouts,counts:Object.fromEntries([...WORK_NAMES].map(n=>[n,work.filter(e=>e.name===n).length]))};
}
