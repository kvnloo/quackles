// Keep observer bookkeeping out of the measurement hot path. No entry is
// discarded: delivered and pending records use the original overlap predicate,
// and complete script attribution is serialized only after the end mark.
// Self-contained so the browser harness can install this via addInitScript.
export function captureLoafs(Observer=PerformanceObserver) {
  const entries=[];
  const observer=new Observer(list=>{for(const entry of list.getEntries())entries.push(entry);});
  observer.observe({type:'long-animation-frame'});
  return {finish(start,end){
    entries.push(...observer.takeRecords());observer.disconnect();
    return entries.filter(e=>e.startTime<end&&e.startTime+e.duration>start).map(e=>e.toJSON());
  }};
}
