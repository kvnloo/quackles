// I16-v2: exact union of actual opaque painted source rectangles, not canvas bounds.
// This is a diagnostic metric beside (not a replacement for) legacy I16.
export function paintedCoverage({frame,base,layers}) {
  if(!frame||!base||frame[2]<=0||frame[3]<=0||base[2]<=0||base[3]<=0)return null;
  const [x,y,w,h]=frame, x1=x+w,y1=y+h,rects=[];
  for(const layer of Object.values(layers)) {
    if(!layer.visible||layer.opacity<.99)continue;
    for(const r of layer.rects){
      const a=Math.max(x,base[0]+r[0]*base[2]),b=Math.max(y,base[1]+r[1]*base[3]);
      const c=Math.min(x1,base[0]+r[2]*base[2]),d=Math.min(y1,base[1]+r[3]*base[3]);
      if(c>a&&d>b)rects.push([a,b,c,d]);
    }
  }
  const xs=[...new Set([x,x1,...rects.flatMap(r=>[r[0],r[2]])])].sort((a,b)=>a-b);
  let area=0,edgeGap=false;
  for(let i=0;i<xs.length-1;i++){
    const a=xs[i],b=xs[i+1],mid=(a+b)/2;
    const intervals=rects.filter(r=>r[0]<=mid&&r[2]>=mid).map(r=>[r[1],r[3]]).sort((a,b)=>a[0]-b[0]);
    let end=y,covered=0;
    for(const [lo,hi] of intervals){covered+=Math.max(0,hi-Math.max(lo,end));end=Math.max(end,hi);}
    area+=(b-a)*covered;
    if(!intervals.length||intervals[0][0]>y+1e-5||end<y1-1e-5||((i===0||i===xs.length-2)&&covered<h-1e-5))edgeGap=true;
  }
  return {plateFraction:Math.round(Math.max(0,1-area/(w*h))*1e9)/1e9,edgeGap};
}

// Called in the legacy sampler's SAME queued measurement task. No pixel readback
// in timing runs: that can force GPU synchronization. Raw painted rectangles are
// retained and their union is evaluated off-line.
export function coverageReadback() {
  const frame=document.querySelector('.poster-frame').getBoundingClientRect();
  const copy=document.createElement('canvas');copy.width=Math.ceil(frame.width);copy.height=Math.ceil(frame.height);
  const ctx=copy.getContext('2d',{willReadFrequently:true});
  for(const name of ['floor','underlay','detail']){
    const el=document.querySelector(`.sequence-${name}`),s=getComputedStyle(el),r=el.getBoundingClientRect();
    if(s.visibility!=='visible'||s.display==='none')continue;
    ctx.globalAlpha=Number(s.opacity);ctx.drawImage(el,r.x-frame.x,r.y-frame.y,r.width,r.height);
  }
  const px=ctx.getImageData(0,0,copy.width,copy.height).data;let transparent=0;
  // Ignore only the 1px antialias fringe, matching the old geometry tolerance.
  for(let y=1;y<copy.height-1;y++)for(let x=1;x<copy.width-1;x++)if(px[(y*copy.width+x)*4+3]<250)transparent++;
  return {transparent,total:(copy.width-2)*(copy.height-2),png:copy.toDataURL()};
}

export function coverageSnapshot() {
  const paint=window.__QUACKLES_PAINT__;
  if(!paint)return null;
  const layers={};
  for(const name of ['detail','underlay','floor']) {
    const el=document.querySelector(`.sequence-${name}`),s=el&&getComputedStyle(el);
    layers[name]={visible:!!s&&s.visibility==='visible'&&s.display!=='none',opacity:s?Number(s.opacity):0,rects:(paint[name]?.rects||[]).map(r=>[...r])};
  }
  return {layers,sampledAt:performance.timeOrigin+performance.now()};
}
