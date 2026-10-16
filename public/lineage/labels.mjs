// Font pages are prepared off-thread only after the instrument approaches view.
// The live scrub path performs no text shaping, texture upload or DOM card writes.
export function buildLabelAtlas({entries,themes,formatted,stateWidth,streamWidth,emptyWidth,captionWidth,captionCentered,total,styles,dpr}){
 const result=[];
 const groups=[
  {kind:12,width:280,height:24,items:Array.from({length:total+1},(_,position)=>({position,ordinal:0,time:0,lane:0,status:0})),title:styles.count,gap:0},
  {kind:11,width:captionWidth,height:64,items:entries,title:styles.caption,gap:0},
  {kind:10,width:280,height:24,items:entries,title:styles.date,gap:0},
  {kind:6,width:stateWidth,items:entries,title:styles.stateTitle,detail:styles.stateDetail,gap:0},
  {kind:7,width:streamWidth,items:entries,title:styles.streamTitle,detail:styles.streamDetail,gap:6},
  {kind:8,width:emptyWidth,items:themes.map((theme,lane)=>({theme,lane,position:-1,ordinal:-1,time:0,status:0})),title:styles.empty,gap:0},
 ];
 function lines(context,text,width){
  const output=[];let line='';for(const token of text.match(/[^\s/-]+(?:[/-]+)?|[/-]+|\s+/g)||[]){const next=line+token;if(line&&context.measureText(next.trimEnd()).width>width){output.push(line.trimEnd());line=token.trimStart();}else line=next;}if(line)output.push(line.trimEnd());return output;
 }
 for(const group of groups){
  const w=Math.ceil(group.width*dpr),h=Math.ceil((group.height||64)*dpr),cw=w+4,ch=h+4,cols=Math.max(1,Math.floor(2048/cw)),capacity=cols*Math.max(1,Math.floor(512/ch));
  for(let start=0;start<group.items.length;start+=capacity){
   const subset=group.items.slice(start,start+capacity),image=typeof document==='undefined'?new OffscreenCanvas(cols*cw,Math.ceil(subset.length/cols)*ch):document.createElement('canvas');image.width=cols*cw;image.height=Math.ceil(subset.length/cols)*ch;
   const ctx=image.getContext('2d'),items=[];
   subset.forEach((entry,i)=>{
    const x=i%cols*cw+2,y=Math.floor(i/cols)*ch+2;
    ctx.save();ctx.translate(x,y);ctx.scale(dpr,dpr);ctx.beginPath();ctx.rect(0,0,group.width,64);ctx.clip();
    ctx.font=group.title.font;ctx.fillStyle=group.title.color;ctx.letterSpacing=group.title.letterSpacing==='normal'?'0px':group.title.letterSpacing;
    let metric=ctx.measureText('Mg'),offset=0;
    const title=group.kind===12?`${entry.position} / ${total} matching artifacts`:group.kind===11?entry.labelCaption:group.kind===10?`${formatted[entry.position]} CDT`:group.kind===8?`${entry.theme} / not yet preserved`:`${themes[entry.lane]} / ${entry.labelVersion}`;
    if(group.kind===12&&captionCentered)ctx.translate(group.width-ctx.measureText(title).width,0);
    if(group.kind===11&&captionCentered){const contentWidth=Math.min(group.width,ctx.measureText(title).width),contentHeight=Math.min(lines(ctx,title,group.width).length*group.title.lineHeight,group.title.maxHeight);ctx.translate(group.width-contentWidth,(64-contentHeight)/2);}
    if(group.kind===11){ctx.beginPath();ctx.rect(0,0,group.width,group.title.maxHeight);ctx.clip();}
    const lineHeight=group.title.lineHeight||metric.fontBoundingBoxAscent+metric.fontBoundingBoxDescent,baseline=(lineHeight-metric.fontBoundingBoxAscent-metric.fontBoundingBoxDescent)/2+metric.fontBoundingBoxAscent;
    for(const line of lines(ctx,group.kind===6?title.toUpperCase():title,group.width)){ctx.fillText(line,0,offset+baseline);offset+=lineHeight;}
    if(group.detail){
     offset+=group.gap;ctx.font=group.detail.font;ctx.fillStyle=group.detail.color;metric=ctx.measureText('Mg');
     for(const line of lines(ctx,`${entry.labelStatus} · ${formatted[entry.position]}`,group.width)){ctx.fillText(line,0,offset+metric.fontBoundingBoxAscent);offset+=metric.fontBoundingBoxAscent+metric.fontBoundingBoxDescent;}
    }
    ctx.restore();items.push({...entry,origin:entry,sprite:{uv:[x/image.width,y/image.height,w/image.width,h/image.height]}});
   });
   result.push({kind:group.kind,image:typeof image.transferToImageBitmap==='function'?image.transferToImageBitmap():image,items,first:subset[0].position,last:subset.at(-1).position});
  }
 }
 return result;
}
