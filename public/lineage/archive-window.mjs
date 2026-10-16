// A bounded native archive window plus one live Canvas2D atlas surface.
// Native typography returns at rest; scroll never mutates the native card tree.
function rasterLabel({texts,profile}) {
  const {width,height,dpr,fields,offset}=profile,canvas=new OffscreenCanvas(Math.ceil(width*dpr),Math.ceil((height-offset)*dpr)),ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.translate(0,-offset);
  fields.forEach((f,i)=>{
    ctx.save();ctx.beginPath();ctx.rect(f.x,f.y,f.width,f.height);ctx.clip();ctx.font=f.font;ctx.fillStyle=f.color;ctx.globalAlpha=f.opacity;ctx.letterSpacing=f.spacing;
    let text=texts[i];if(f.upper)text=text.toUpperCase();const metric=ctx.measureText('Mg'),lineHeight=f.lineHeight||metric.fontBoundingBoxAscent+metric.fontBoundingBoxDescent,baseline=(lineHeight-metric.fontBoundingBoxAscent-metric.fontBoundingBoxDescent)/2+metric.fontBoundingBoxAscent;
    let lines=[text];
    if(i===2&&ctx.measureText(text).width>f.width){while(text&&ctx.measureText(text+'…').width>f.width)text=text.slice(0,-1);lines=[text+'…'];}
    if(i===4){lines=[];let line='';for(const word of text.split(/(\s+)/)){if(line&&ctx.measureText(line+word).width>f.width){lines.push(line.trimEnd());line=word.trimStart();}else line+=word;while(ctx.measureText(line).width>f.width){let j=1;while(j<line.length&&ctx.measureText(line.slice(0,j+1)).width<=f.width)j++;lines.push(line.slice(0,j));line=line.slice(j);}}if(line)lines.push(line);}
    lines.forEach((line,row)=>ctx.fillText(line,f.right?f.x+f.width-ctx.measureText(line).width:f.x,f.y+baseline+row*lineHeight));ctx.restore();
  });
  return canvas.transferToImageBitmap();
}
export function mountArchive({viewport,grid,atlas,atlasBase,date,imageURL,mode='canvas'}) {
  let entries=[],texts=[],columns=2,rowHeight=380,width=1,height=642,top=0,frame=0,live=false,settleTimer=0,near=false,profile=null,generation=0,worker=null;
  const pool=[],media=matchMedia('(max-width:600px)'),sprites=new Map(atlas?.sprites.map(s=>[s.key,s])||[]),pages=new Map(),labels=new Map(),pending=new Set();let mobile=media.matches;
  const accessible=document.createElement('div');accessible.className='lineage-accessible';accessible.setAttribute('role','list');accessible.setAttribute('aria-label','Complete version archive');viewport.after(accessible);
  const canvas=mode==='canvas'&&atlas?document.createElement('canvas'):null,ctx=canvas?.getContext('2d',{alpha:true});
  if(ctx){canvas.className='lineage-grid-canvas';canvas.setAttribute('aria-hidden','true');viewport.prepend(canvas);}
  function pageImage(page) {
    if(!near)return null;
    if(!pages.has(page)){
      const item={image:null};pages.set(page,item);
      fetch(new URL(atlas.pages[page].file,atlasBase)).then(r=>{if(!r.ok)throw new Error('Archive atlas unavailable');return r.blob();}).then(createImageBitmap).then(image=>{item.image=image;schedule();}).catch(()=>{item.failed=true;});
    }
    return pages.get(page).image;
  }
  function makeCard() {
    const node=document.createElement('a');node.className='lineage-card';node.setAttribute('role','listitem');node.tabIndex=-1;
    const image=document.createElement('span');image.className='lineage-card-image';image.setAttribute('aria-hidden','true');
    const sprite=document.createElement('span');sprite.className='lineage-card-sprite';image.append(sprite);
    const heading=document.createElement('h3'),status=document.createElement('span'),caption=document.createElement('p'),time=document.createElement('time'),provenance=document.createElement('small');status.className='lineage-status';
    node.append(image,heading,status,caption,time,provenance);grid.append(node);
    return {node,image,sprite,heading,status,caption,time,provenance,index:-1};
  }
  function bind(card,index) {
    const e=entries[index];card.index=index;card.node.hidden=!e;if(!e)return;
    const key=`${e.theme}/${e.version}`,t=texts[index];
    card.node.href=`#/${key}`;card.node.dataset.id=key;card.node.dataset.index=index;card.node.tabIndex=index===0?0:-1;
    card.node.setAttribute('aria-posinset',index+1);card.node.setAttribute('aria-setsize',entries.length);
    card.node.setAttribute('aria-label',`${e.theme} ${e.version}, ${e.caption}, ${e.status}. Open image and provenance`);
    card.heading.textContent=t[0];card.status.textContent=t[1];card.caption.textContent=t[2];card.time.dateTime=e.date;card.time.textContent=t[3];card.provenance.textContent=t[4];
    card.node.style.transform=`translateY(${Math.floor(index/columns)*rowHeight}px)`;
    const s=sprites.get(key),ih=mobile?222:274,iw=width/columns-14-(mobile?10:16);
    if(!near){card.sprite.style.backgroundImage='none';return;}
    if(s){const p=atlas.pages[s.page],sw=s.uv[2]*p.width,sh=s.uv[3]*p.height,scale=Math.min(iw/sw,ih/sh);
      if(ctx){card.sprite.style.backgroundImage='none';pageImage(s.page);}
      else card.sprite.style.cssText=`display:block;width:${sw*scale}px;height:${sh*scale}px;background-image:url("${new URL(p.file,atlasBase)}");background-size:${p.width*scale}px ${p.height*scale}px;background-position:${-s.uv[0]*p.width*scale}px ${-s.uv[1]*p.height*scale}px`;
    }else card.sprite.style.cssText=`display:block;width:100%;height:100%;background:url("${imageURL(e)}") center/contain no-repeat`;
  }
  function nativeWindow(){
    const rows=Math.ceil(height/rowHeight)+3,first=Math.max(0,Math.floor(top/rowHeight)-1);
    for(let row=first;row<first+rows;row++)for(let col=0;col<columns;col++){const card=pool[(row%rows)*columns+col],i=row*columns+col;if(card&&card.index!==i)bind(card,i);}
  }
  function fontSources(){
    const result=[];function visit(rules){for(const rule of rules){if(rule.type===CSSRule.FONT_FACE_RULE){const s=rule.style,src=s.getPropertyValue('src').replace(/url\(["']?([^"')]+)["']?\)/g,(_,url)=>`url("${new URL(url,location.href)}")`);if(!src.includes('url('))continue;result.push({family:s.getPropertyValue('font-family').replace(/["']/g,''),src,weight:s.getPropertyValue('font-weight')||'normal',style:s.getPropertyValue('font-style')||'normal'});}else if(rule.cssRules)visit(rule.cssRules);}}for(const sheet of document.styleSheets){try{visit(sheet.cssRules);}catch{ /* Cross-origin sheets cannot define this local archive's fonts. */ }}return result;
  }
  function cacheLabel(index,image){labels.get(index)?.close();labels.set(index,image);while(labels.size>80){const key=labels.keys().next().value;labels.get(key).close();labels.delete(key);}return image;}
  function startWorker(){
    if(worker||!profile||!near||!ctx)return;
    const source=`const rasterLabel=${rasterLabel.toString()};let ready=Promise.resolve();onmessage=async({data})=>{if(data.fonts){ready=Promise.all(data.fonts.map(async f=>{const font=new FontFace(f.family,f.src,{weight:f.weight,style:f.style});await font.load();self.fonts.add(font);}));return;}try{await ready;const image=rasterLabel(data);postMessage({index:data.index,generation:data.generation,image},[image]);}catch(error){postMessage({index:data.index,generation:data.generation,error:String(error)});}}`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
    worker.postMessage({fonts:fontSources()});
    worker.onmessage=({data})=>{if(data.generation!==generation){data.image?.close();return;}if(data.image){pending.delete(data.index);cacheLabel(data.index,data.image);schedule();}};
  }
  function prepare(){
    if(!near||!profile)return;startWorker();
    const first=Math.max(0,Math.floor(top/rowHeight)-2)*columns,end=Math.min(entries.length,first+(Math.ceil(height/rowHeight)+7)*columns);
    for(let i=first;i<end;i++){const s=sprites.get(`${entries[i].theme}/${entries[i].version}`);if(s&&ctx)pageImage(s.page);if(worker&&!labels.has(i)&&!pending.has(i)){pending.add(i);worker.postMessage({index:i,generation,texts:texts[i],profile});}}
  }
  function paint(){
    frame=0;if(!live||!ctx)nativeWindow();if(!ctx||!near)return;
    if(live){ctx.fillStyle='#0000cf';ctx.fillRect(0,0,width,height+14);}else ctx.clearRect(0,0,width,height+14);
    const pad=mobile?5:8,ih=mobile?222:274,iw=width/columns-14-pad*2,first=Math.max(0,Math.floor(top/rowHeight)),last=Math.min(entries.length,Math.ceil((top+height+14)/rowHeight)*columns);
    for(let i=first*columns;i<last;i++){
      const x=(i%columns)*width/columns+7,y=Math.floor(i/columns)*rowHeight-top+7,e=entries[i],s=sprites.get(`${e.theme}/${e.version}`);
      ctx.fillStyle='#080830';ctx.fillRect(x+pad,y+pad,iw,ih);
      if(s){const p=atlas.pages[s.page],image=pageImage(s.page),sw=s.uv[2]*p.width,sh=s.uv[3]*p.height,scale=Math.min(iw/sw,ih/sh);if(image)ctx.drawImage(image,s.uv[0]*p.width,s.uv[1]*p.height,sw,sh,x+pad+(iw-sw*scale)/2,y+pad+(ih-sh*scale)/2,sw*scale,sh*scale);}
      if(live){let label=labels.get(i);if(!label&&profile){label=cacheLabel(i,rasterLabel({texts:texts[i],profile}));}if(label)ctx.drawImage(label,x,y+profile.offset,profile.width,profile.height-profile.offset);ctx.fillStyle='#ffffff50';ctx.fillRect(x,y+(mobile?365:425),width/columns-14,1);}
    }
    prepare();
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
  function settle(){clearTimeout(settleTimer);live=false;nativeWindow();schedule();}
  function measureProfile(){
    const c=pool.find(c=>!c.node.hidden);if(!c||!ctx||width<=1)return;
    const r=c.node.getBoundingClientRect(),fields=[c.heading,c.status,c.caption,c.time,c.provenance].map((n,i)=>{const s=getComputedStyle(n),b=n.getBoundingClientRect();return {x:mobile||i!==1?(mobile?5:8):8,y:b.y-r.y,width:r.width-(mobile?10:16),height:i===4?52:b.height,font:s.font,color:s.color,opacity:Number(s.opacity),spacing:s.letterSpacing==='normal'?'0px':s.letterSpacing,lineHeight:parseFloat(s.lineHeight)||0,upper:s.textTransform==='uppercase',right:!mobile&&i===1};});
    profile={width:r.width,height:r.height,offset:Math.floor(Math.min(...fields.map(f=>f.y))),dpr:Math.min(devicePixelRatio,3),fields};generation++;for(const label of labels.values())label.close();labels.clear();pending.clear();prepare();
  }
  function rebuild(){
    live=false;grid.style.height=`${Math.ceil(entries.length/columns)*rowHeight}px`;const n=(Math.ceil(height/rowHeight)+3)*columns;
    while(pool.length<n)pool.push(makeCard());while(pool.length>n)pool.pop().node.remove();
    pool.forEach((card,i)=>{card.index=-1;card.node.style.left=`calc(${i%columns*100/columns}% + 7px)`;card.node.style.width=`calc(${100/columns}% - 14px)`;});
    if(ctx){const dpr=Math.min(devicePixelRatio,3);canvas.width=Math.round(width*dpr);canvas.height=Math.round((height+14)*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height+14}px`;canvas.style.marginBottom=`-${height+7}px`;ctx.setTransform(dpr,0,0,dpr,0,0);}
    nativeWindow();schedule();
  }
  new ResizeObserver(records=>{const r=records[0].contentRect;width=r.width;height=r.height;mobile=media.matches;columns=width<600?2:width<1000?3:5;rowHeight=width<600?380:440;rebuild();measureProfile();}).observe(viewport);
  new IntersectionObserver(records=>{near=records[0].isIntersecting;if(near){for(const card of pool)card.index=-1;nativeWindow();measureProfile();schedule();}},{rootMargin:'200px'}).observe(viewport);
  viewport.addEventListener('scroll',()=>{top=viewport.scrollTop;live=Boolean(ctx&&profile);clearTimeout(settleTimer);settleTimer=setTimeout(settle,150);schedule();},{passive:true});
  viewport.addEventListener('click',event=>{if(!live||!ctx||event.button!==0)return;const r=viewport.getBoundingClientRect(),col=Math.floor((event.clientX-r.x-1)/(width/columns)),row=Math.floor((event.clientY-r.y-8+top)/rowHeight),e=entries[row*columns+col];if(e){event.preventDefault();event.stopPropagation();location.hash=`/${e.theme}/${e.version}`;}},true);
  function focus(index){
    if(!entries.length)return;index=Math.max(0,Math.min(entries.length-1,index));top=Math.min(Math.floor(index/columns)*rowHeight,Math.max(0,Math.ceil(entries.length/columns)*rowHeight-height));viewport.scrollTop=top;settle();
    for(const card of pool)card.node.tabIndex=card.index===index?0:-1;pool.find(card=>card.index===index)?.node.focus({preventScroll:true});
  }
  accessible.addEventListener('focusin',event=>{const index=Number(event.target.dataset.index);if(Number.isInteger(index))focus(index);});
  viewport.addEventListener('keydown',event=>{
    const current=Number(document.activeElement?.dataset.index??0),moves={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns,PageDown:columns*2,PageUp:-columns*2};let index;
    if(event.key in moves)index=current+moves[event.key];else if(event.key==='Home')index=0;else if(event.key==='End')index=entries.length-1;
    else if(event.key==='Tab'&&document.activeElement?.classList.contains('lineage-card')){index=current+(event.shiftKey?-1:1);if(index<0||index>=entries.length)return;}
    else return;event.preventDefault();focus(index);
  });
  return {setEntries(next){entries=next;texts=entries.map(e=>[`${e.theme} / ${e.version}`,e.status,e.caption,date(e.date),`${e.dateSource} · ${e.hash}`]);top=0;viewport.scrollTop=0;accessible.replaceChildren(...entries.map((e,i)=>{const a=document.createElement('a');a.href=`#/${e.theme}/${e.version}`;a.dataset.index=i;a.tabIndex=-1;a.setAttribute('role','listitem');a.textContent=texts[i].join(' · ');return a;}));generation++;for(const label of labels.values())label.close();labels.clear();pending.clear();rebuild();prepare();},focus};
}
