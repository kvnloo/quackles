// Shared static timeline instrument. Build-time order/state tables, no geometry reads.
export function upperBound(times, time) {
  let lo=0, hi=times.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(times[mid]<=time) lo=mid+1; else hi=mid; }
  return lo-1;
}
export function timelineTime(location) {
  try {
    const raw=location.hash.startsWith('#/t/') ? decodeURIComponent(location.hash.slice(4)) : new URLSearchParams(location.search).get('t');
    const value=Date.parse(raw); return Number.isFinite(value)?value:null;
  } catch { return null; }
}
export function mountTimeline({host,entries,index,source,link,onTime=()=>{}}) {
  const times=new Float64Array(index.times), order=new Uint32Array(index.order), states=new Int32Array(index.states);
  const rows=Array.from(order,i=>entries[i]), themes=index.themes;
  const min=times[index.start], max=times.at(-1);
  const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  const formatted=Array.from(times,t=>format.format(t));
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const label=e=>`${e.theme} / ${e.version} · ${e.caption || e.phase}`;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  host.classList.add('tl-instrument');
  const top=el('div','tl-top'), heading=el('div');
  heading.append(el('p','tl-kicker','THE PROJECT / IN TIME'),el('h3','', 'Move through the making.'));
  const transport=el('div','tl-transport'), play=el('button','','Play →');play.type='button';play.dataset.timelinePlay='';play.setAttribute('aria-pressed','false');
  const speedLabel=el('label','','Speed '),speed=el('select');speed.setAttribute('aria-label','Playback speed');
  for(const [v,t] of [[1,'1×'],[2,'2×'],[4,'4×']])speed.add(new Option(t,v));speedLabel.append(speed);
  transport.append(play,speedLabel);top.append(heading,transport);
  const readout=el('div','tl-readout'), date=el('time'),caption=el('p');caption.dataset.timelineCaption='';
  readout.append(date,caption);
  const range=el('input','tl-range');range.type='range';range.min=min;range.max=max;range.step='1';range.value=max;range.dataset.timelineRange='';range.setAttribute('aria-label','Project time');range.setAttribute('aria-describedby','tl-help');
  const endpoints=el('div','tl-endpoints');endpoints.append(el('span','','BLUE / V0 · SEP 14'),el('span','',format.format(max)+' CDT'));
  const lanes=el('div','tl-lanes');const ticks=[];
  const preview=el('div','tl-preview');preview.hidden=true;preview.setAttribute('aria-live','polite');
  const previewImage=el('img');previewImage.width=64;previewImage.height=86;previewImage.decoding='async';previewImage.alt='';
  const previewText=el('span','','Hover a tick, or focus a scene lane and use the arrow keys.');preview.append(previewImage,previewText);
  function previewAt(i) {preview.hidden=false;const e=rows[i];previewImage.src=source(e);previewImage.alt=`${e.theme} ${e.version}`;previewText.textContent=`${label(e)} · ${e.status} · ${format.format(times[i])} CDT`;}
  for(const theme of themes) {
    const lane=el('div','tl-lane'),name=el('span','tl-lane-name',theme),track=el('div','tl-track');
    const positions=[];
    rows.forEach((e,i)=>{
      if(e.theme!==theme)return;
      positions.push(i);
      const tick=el('button',`tl-tick tl-${e.status}`);tick.type='button';tick.dataset.position=i;tick.tabIndex=positions.length===1?0:-1;
      tick.style.left=`${Math.max(0,(times[i]-min)/(max-min))*100}%`;
      tick.title=`${label(e)} · ${e.status}`;tick.setAttribute('aria-label',tick.title);ticks[i]=tick;
      tick.addEventListener('pointerenter',()=>previewAt(i));tick.addEventListener('focus',()=>previewAt(i));tick.addEventListener('pointerleave',()=>{preview.hidden=true;});tick.addEventListener('blur',()=>{preview.hidden=true;});
      tick.addEventListener('click',()=>{pause();seek(times[i],i);});
      track.append(tick);
    });
    track.addEventListener('keydown',event=>{
      const p=positions.indexOf(Number(event.target.dataset.position));let next;
      if(event.key==='ArrowRight')next=p+1;else if(event.key==='ArrowLeft')next=p-1;else if(event.key==='Home')next=0;else if(event.key==='End')next=positions.length-1;else return;
      event.preventDefault();event.stopPropagation();const tick=ticks[positions[Math.max(0,Math.min(positions.length-1,next))]];
      event.target.tabIndex=-1;tick.tabIndex=0;tick.focus({preventScroll:true});
    });
    lane.append(name,track);lanes.append(lane);
  }
  const legend=el('p','tl-legend');
  for(const [cls,text] of [['current','Current review pick'],['kept','Kept'],['rejected','Rejected'],['shipped','Shipped'],['candidate','Candidate / unknown'],['reference','Reference (undated)'],['decision','Review decision']])legend.append(el('span',`tl-key tl-${cls}`,text));
  const milestones=el('div','tl-milestones');milestones.setAttribute('aria-label','Snap to milestone');
  for(const m of index.milestones) {
    const button=el('button',`tl-milestone tl-${m.kind}`,m.label);button.type='button';button.title=m.basis;button.dataset.milestone=m.index;
    button.addEventListener('click',()=>{pause();seek(times[m.index],m.index);});milestones.append(button);
  }
  const help=el('p','tl-help','Drag to travel · ← → one version · Shift + ← → one day · Home / End · Tick arrows explore each lane.');help.id='tl-help';
  const caveat=el('p','tl-help','State = latest preserved artifact at T, not historical approval. Status reflects today’s archive. Review-pick markers use artifact dates, not inferred decision times. Undated references remain above; pre-v0 tests remain in the stream.');
  const stateHeading=el('div','tl-state-heading');stateHeading.append(el('h4','','State at this time'));const count=el('span');count.dataset.timelineCount='';stateHeading.append(count);
  const stateRow=el('div','tl-state-row'),cards=[],empty=[];
  function recycledCard(cls) {
    const node=el('a',cls),img=el('img'),title=el('strong'),detail=el('span');
    img.width=240;img.height=320;img.decoding='async';node.append(img,title,detail);
    return {node,img,title,detail,index:-1};
  }
  function fillCard(card,i) {
    if(card.index===i)return;card.index=i;const visible=i>=0;
    card.node.style.visibility=visible?'visible':'hidden';card.node.tabIndex=visible?0:-1;card.node.dataset.active=String(visible);card.node.setAttribute('aria-hidden',String(!visible));
    if(!visible)return;
    const e=rows[i];card.node.dataset.position=i;card.node.dataset.date=e.date;card.node.href=link(e);
    card.title.textContent=`${e.theme} / ${e.version}`;card.detail.textContent=`${e.status} · ${formatted[i]}`;
    card.img.alt=label(e);card.img.src=source(e);
    if(card.node.classList.contains('tl-stream-artifact') && !reducedMotion && (!card.animation || card.animation.playState==='finished'))card.animation=card.node.animate([{opacity:.65,scale:'.985'},{opacity:1,scale:'1'}],{duration:140,easing:'ease-out'});
  }
  for(const theme of themes) {
    const slot=el('div','tl-state-slot');slot.dataset.scene=theme;
    const blank=el('div','tl-no-state',`${theme} / not yet preserved`);empty.push(blank);
    const card=recycledCard('tl-state-artifact');card.node.style.visibility='hidden';cards.push(card);slot.append(blank,card.node);stateRow.append(slot);
  }
  const streamHeading=el('div','tl-state-heading'),streamTitle=el('h4','','Artifacts through this time'),paging=el('div','tl-paging');
  const earlier=el('button','','← Earlier'),later=el('button','','Later →');earlier.type=later.type='button';earlier.dataset.timelineEarlier='';later.dataset.timelineLater='';paging.append(earlier,later);streamHeading.append(streamTitle,paging);
  const streamRow=el('div','tl-stream-row'),streamCards=Array.from({length:6},()=>recycledCard('tl-stream-artifact'));
  for(const card of streamCards){card.node.style.visibility='hidden';streamRow.append(card.node);}
  const streamNote=el('p','tl-help','A recycled window of the chronological stream. Earlier / Later explores every matching artifact through T. The complete archive below remains available.');
  const details=el('details','tl-details'),summary=el('summary','','Milestones & reading key');details.append(summary,legend,milestones,help,caveat);
  details.open=matchMedia('(min-width: 701px)').matches;
  host.append(top,readout,range,endpoints,lanes,preview,stateHeading,stateRow,streamHeading,streamRow,streamNote,details);
  let current=-1, raf=0, pending=max, pendingPosition=null, playing=false,lastStep=0, playRaf=0, prefetchTimer=0, urlTimer=0;
  let stream=[], streamPositions=new Uint32Array(), streamEnd=-1, selectedStates=states, pageOffset=0;
  const positions=new Map(rows.map((e,i)=>[`${e.theme}/${e.version}`,i])),loaded=new Map();
  function prepare(i) {
    if(i<0 || loaded.has(i))return;const img=new Image();img.decoding='async';img.src=source(rows[i]);loaded.set(i,img);img.decode().catch(()=>{});
    if(loaded.size>64)loaded.delete(loaded.keys().next().value);
  }
  function prefetch() {
    if(prefetchTimer)return;
    prefetchTimer=setTimeout(()=>{
      prefetchTimer=0;
      for(let lane=0;lane<5;lane++)prepare(selectedStates[current*5+lane]);
      for(let i=Math.max(0,current-2);i<=Math.min(rows.length-1,current+8);i++)prepare(i);
    },60);
  }
  function paintStream() {
    const end=Math.max(0,streamEnd+1-pageOffset),start=Math.max(0,end-streamCards.length);
    streamCards.forEach((card,i)=>fillCard(card,start+i<end?stream[start+i].position:-1));
    earlier.disabled=start===0;later.disabled=pageOffset===0;
  }
  earlier.addEventListener('click',()=>{pageOffset=Math.min(Math.max(0,streamEnd+1-streamCards.length),pageOffset+streamCards.length);paintStream();});
  later.addEventListener('click',()=>{pageOffset=Math.max(0,pageOffset-streamCards.length);paintStream();});
  function writeURL() {
    const u=new URL(location.href);u.searchParams.set('t',new Date(times[current]).toISOString());u.searchParams.set('at',`${rows[current].theme}/${rows[current].version}`);
    if(u.hash.startsWith('#/t/'))u.hash='';
    history.replaceState(null,'',u.href);
  }
  function render() {
    raf=0;const next=Math.max(index.start,Math.min(rows.length-1,pendingPosition??(pending<=min?index.start:upperBound(times,pending))));pendingPosition=null;
    if(next===current)return;
    current=next;range.value=times[current];host.dataset.time=String(times[current]);host.dataset.position=String(current);
    date.dateTime=new Date(times[current]).toISOString();date.textContent=format.format(times[current])+' CDT';caption.textContent=label(rows[current]);
    range.setAttribute('aria-valuetext',`${date.textContent}, ${label(rows[current])}`);
    streamEnd=upperBound(streamPositions,current);pageOffset=0;paintStream();
    count.textContent=`${streamEnd+1} / ${stream.length} matching artifacts`;
    for(let lane=0;lane<5;lane++) {
      const nextState=selectedStates[current*5+lane];empty[lane].style.visibility=nextState<0?'visible':'hidden';fillCard(cards[lane],nextState);
    }
    onTime(times[current],current);prefetch();clearTimeout(urlTimer);urlTimer=setTimeout(writeURL,180);
  }
  function seek(time,position=null) {pending=Math.max(min,Math.min(max,time));pendingPosition=position;if(!raf)raf=requestAnimationFrame(render);}
  function pause() {playing=false;cancelAnimationFrame(playRaf);play.textContent='Play →';play.setAttribute('aria-pressed','false');}
  function advance(now) {
    if(!playing)return;
    if(now-lastStep>=650/Number(speed.value)) {lastStep=now;if(current>=rows.length-1){pause();return;}seek(times[current+1],current+1);}
    playRaf=requestAnimationFrame(advance);
  }
  play.addEventListener('click',()=>{
    if(playing){pause();return;}if(current>=rows.length-1)seek(min);playing=true;lastStep=performance.now();play.textContent='Pause Ⅱ';play.setAttribute('aria-pressed','true');playRaf=requestAnimationFrame(advance);
  });
  range.addEventListener('input',()=>{pause();seek(Number(range.value));});
  range.addEventListener('change',()=>{if(current>=0)writeURL();});
  range.addEventListener('keydown',event=>{
    const direction=event.key==='ArrowRight'||event.key==='ArrowUp'?1:event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:0;
    let time;if(event.key==='Home')time=min;else if(event.key==='End')time=max;else if(direction)time=event.shiftKey?pending+direction*86400000:times[Math.max(index.start,Math.min(rows.length-1,current+direction))];else return;
    event.preventDefault();pause();const position=event.key==='Home'?index.start:event.key==='End'?rows.length-1:!event.shiftKey?Math.max(index.start,Math.min(rows.length-1,current+direction)):null;seek(time,position);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  const routePosition=()=>{const i=positions.get(new URLSearchParams(location.search).get('at'));return !location.hash.startsWith('#/t/') && i!==undefined && times[i]===timelineTime(location)?i:null;};
  const restore=()=>{const time=timelineTime(location);if(time!==null){pause();seek(time,routePosition());}};
  addEventListener('popstate',restore);addEventListener('hashchange',restore);
  function setArtifacts(items) {
    // Filter changes are outside the scrub hot path. Precompute a filtered state table once.
    stream=items.map(x=>({...x,position:positions.get(x.key)})).sort((a,b)=>a.time-b.time||a.position-b.position);streamPositions=Uint32Array.from(stream,x=>x.position);streamEnd=-1;
    const allowed=new Set(items.map(x=>x.key));const latest=new Int32Array(5).fill(-1);selectedStates=new Int32Array(states.length);
    rows.forEach((e,i)=>{if(allowed.has(`${e.theme}/${e.version}`))latest[themes.indexOf(e.theme)]=i;selectedStates.set(latest,i*5);});
    const time=current<0?(timelineTime(location)??max):times[current];pendingPosition=current<0?routePosition():current;current=-1;pending=time;render();
  }
  return {setArtifacts,seek,pause,get time(){return times[current];}};
}
