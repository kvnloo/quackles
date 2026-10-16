'use strict';
const $ = id => document.getElementById(id);
let data, queue = 'banner', index = 0, kind = 'hero', region = '', zoomed = false, flipped = false, busy = false;
let list = [], current = null, historyEntry = null, chatEntry = null, draft = {}, failedPayload = null;
const drafts = new Map();
const labels = {banner:'Banner',stone:'Stone',stacks:'Layer stacks',white:'White arch','stone-mosaic':'Stone mosaic',optics:'Optics','banner-greenery':'Greenery',chat:'From chat',elements:'Element evidence',history:'Confirm history',unresolved:'Unresolved history'};
const kinds = {hero:'Hero',native:'Native', '201mp':'201 MP','1gp':'1 GP'};
function text(id,value){$(id).textContent = value ?? '';}
function status(message,error=false){text('status',message);$('status').classList.toggle('error',error);}
function asset(url){return url ? data.assets[url.split('/').pop()] : null;}
function reviewed(c){return data.labels.some(l=>l.trial_id===c.trial_id&&!l.history_id);}
function key(){return queue+':'+(chatEntry?.event_id||historyEntry?.id||current?.trial_id||index);}
function remember(){if(current||chatEntry) drafts.set(key(),{...draft,note:$('note').value,pairChecked:$('pair').checked,otherId:$('other').value});}
function getCandidate(id){return data.candidates.find(c=>c.trial_id===id);}
function option(value,name){const o=document.createElement('option');o.value=value;o.textContent=name;return o;}
function entries(name){
  if(name==='chat'||name==='elements')return data.labels.filter((l,i,all)=>l.source==='chat-backfill'&&
    (name==='elements'?l.trial_id===null:l.trial_id!==null)&&all.findIndex(e=>e.event_id===l.event_id)===i);
  if(name==='history'||name==='unresolved')return data.history.filter(h=>h.status===(name==='history'?'inferred':'unresolved'));
  return data.candidates.filter(c=>c.queue===name||name==='stone'&&c.queue==='stacks'&&c.element==='night-stone');
}
function canSave(){return !!((current||chatEntry)&&(draft.stars||chatEntry)&&draft.verdict&&(draft.judged_on||chatEntry));}
function buttons(){
  document.querySelectorAll('[data-verdict]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.verdict===draft.verdict)));
  [...$('stars').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i+1===draft.stars)));
  $('save').disabled=busy||!canSave();
  text('preference',draft.preference ? ({candidate:'Right preferred',other:'Left preferred',tie:'No preference'})[draft.preference] : 'No preference selected');
}
function selectQueue(name){remember();queue=name;index=0;renderQueue();}
function renderQueue(){
  list=entries(queue);
  $('queues').replaceChildren();
  for(const [id,name] of Object.entries(labels)){
    const count=entries(id).length;
    const b=document.createElement('button');b.append(document.createTextNode(name));const s=document.createElement('span');s.textContent=count;b.append(s);
    b.classList.toggle('active',id===queue);b.onclick=()=>{if(!busy)selectQueue(id);};$('queues').append(b);
  }
  render();
}
function render(){
  index=Math.max(0,Math.min(index,list.length-1));
  chatEntry=queue==='chat'||queue==='elements'?list[index]:null;
  historyEntry=queue==='history'||queue==='unresolved'?list[index]:null;
  if(historyEntry){
    const pair=historyEntry.suggested_pairwise;
    const selected=pair?.candidate||historyEntry.trial_ids[0];
    current=getCandidate(selected)||null;
  }else current=chatEntry?getCandidate(chatEntry.trial_id)||null:list[index]||null;
  $('history').hidden=!(historyEntry||chatEntry);
  $('binding').hidden=!!chatEntry;$('binding-label').hidden=!!chatEntry;
  if(chatEntry){
    text('history-status','From chat / '+chatEntry.timestamp+' / '+chatEntry.scope);
    text('quote',chatEntry.quote);
    text('evidence',JSON.stringify({source_receipt:chatEntry.source_receipt,mapping_confidence:chatEntry.mapping_confidence,mapping_evidence:chatEntry.mapping_evidence,defect_id:chatEntry.defect_id},null,2));
  }
  if(historyEntry){
    text('history-status',historyEntry.status==='inferred'?'INFERRED / not yet an owner label':'UNRESOLVED / select a trial only if you recognize it');
    text('quote',historyEntry.quote);text('evidence',JSON.stringify({scope:historyEntry.scope,reason:historyEntry.reason,evidence:historyEntry.evidence,source:historyEntry.source},null,2));
    $('binding').replaceChildren(option('','Choose a trial…'),...data.candidates.map(c=>option(c.trial_id,c.title+' / '+c.element)));
    $('binding').value=current?.trial_id||'';
  }
  const previous=drafts.get(key());
  draft=previous||{stars:null,aspect:chatEntry?.aspect||'overall',verdict:chatEntry?.verdict||historyEntry?.suggested_verdict||null,note:'',preference:chatEntry?.pairwise?.preference||(historyEntry?.suggested_pairwise?.preferred==='candidate'?'candidate':historyEntry?.suggested_pairwise?.preferred==='baseline'?'other':null)};
  if(previous?.boundId)current=getCandidate(previous.boundId)||current;
  if(historyEntry)$('binding').value=current?.trial_id||'';
  $('aspect').value=draft.aspect||'overall';$('aspect').readOnly=!!chatEntry;
  $('note').value=draft.note;
  $('pair').checked=draft.pairChecked??!!(chatEntry?.pairwise||historyEntry?.suggested_pairwise);
  if(current){
    const other=chatEntry?.pairwise?.other_trial_id||historyEntry?.suggested_pairwise?.baseline||current.compare_to;
    $('other').replaceChildren(option('','Choose comparison…'),...data.candidates.filter(c=>c.trial_id!==current.trial_id&&c.queue!=='history-only').map(c=>option(c.trial_id,c.title)));
    // Historical baselines may not be in the current experimental queues.
    if(other&&!Array.from($('other').options).some(o=>o.value===other)){
      const c=getCandidate(other);if(c||chatEntry?.pairwise?.other_trial_id===other)$('other').append(option(other,c?.title||'Source comparison / '+other));
    }
    $('other').value=draft.otherId??other??'';
    text('title',current.title);text('hypothesis',current.hypothesis);text('eyebrow',labels[queue]+' / '+current.element);
  }else if(chatEntry){
    const other=chatEntry.pairwise?.other_trial_id||'';
    $('other').replaceChildren(option(other,other?'Source comparison / '+other:'No source comparison'));
    $('other').value=other;
    text('title',chatEntry.element+' / '+chatEntry.aspect);text('hypothesis',chatEntry.trial_id?'No catalog image bound to this trial. Review the quoted receipt.':'Element evidence / trial binding unknown');text('eyebrow',labels[queue]);}
  else{text('title',historyEntry?'Bind this historical quote':'Nothing in this queue');text('hypothesis','No trial is inferred. Choosing a trial is an explicit owner correction.');}
  text('position',list.length?`${index+1} / ${list.length}`:'0 / 0');
  const done=chatEntry?list.filter(c=>data.labels.some(l=>l.confirmed_from===c.event_id)).length:historyEntry?list.filter(h=>data.labels.some(l=>l.history_id===h.id)).length:list.filter(reviewed).length;
  text('reviewed',`${done} reviewed`);
  $('prev').disabled=index===0;$('next').disabled=index>=list.length-1;
  if(current?.default_view){kind=current.default_view.kind;region=current.default_view.region;}
  flipped=false;zoomed=false;renderImages();buttons();
  status(chatEntry?'Confirm the prefilled '+draft.verdict+' / '+draft.aspect+' with Enter. Quality is unrated unless you choose stars.':current?'Choose stars and a decision, then press Enter.':'Choose the correct trial above before rating.');
  try{localStorage.setItem('owner-review-position',JSON.stringify({queue,index}));}catch{}
}
function renderImages(){
  let views=current?.views||[];
  const reviewedImage=historyEntry?.review_images?.find(i=>i.role==='candidate')||historyEntry?.review_images?.find(i=>i.role==='reviewed_context');
  if(current&&reviewedImage&&historyEntry.trial_ids.includes(current.trial_id)&&!draft.boundId){
    const reference=historyEntry.review_images.find(i=>i.role==='reference');
    views=[{kind:'hero',region:'reviewed receipt',image:reviewedImage.image,target:reference?.image||null,target_note:'Exact image retained with this quote. Component scope only.'}];
  }
  if(!views.some(v=>v.kind===kind))kind=views[0]?.kind||'hero';
  let available=views.filter(v=>v.kind===kind);
  if(!available.some(v=>v.region===region))region=available[0]?.region||'';
  const view=available.find(v=>v.region===region);
  const modes=!view?[]:view.look||view.clear ? ['both','look','clear'].filter(m=>m==='both'?view.look&&view.clear:view[m]) : ['look','clear'];
  const legacy=!!view&&!view.look&&!view.clear;
  if(!modes.includes(draft.judged_on))draft.judged_on=legacy||!view?'':modes[0];
  $('judge-mode').replaceChildren(...(legacy?[option('','Identify legacy optics…')]:[]),...modes.map(m=>option(m,m==='both'?'Both / side by side':m.toUpperCase())));
  $('judge-mode').value=draft.judged_on||'';
  const mode=draft.judged_on;
  const showBoth=!legacy&&mode==='both';
  const shown=view?.[mode==='clear'?'clear':'look']||view?.image;
  $('clear-figure').hidden=!showBoth;
  $('stage').classList.toggle('dual-optics',showBoth);
  text('optics-note',legacy?'Legacy optics unclassified: identify LOOK or CLEAR from the source before saving.':
    'Judged on: '+(mode||'none').toUpperCase()+(view?.missing_modes?.length?' — '+view.missing_modes.join(' / ').toUpperCase()+' render not yet available.':''));
  $('densities').replaceChildren();
  for(const [k,name] of Object.entries(kinds)){
    const b=document.createElement('button');b.textContent=name;b.disabled=!views.some(v=>v.kind===k);b.setAttribute('aria-pressed',String(kind===k));
    b.onclick=()=>{kind=k;flipped=false;renderImages();};$('densities').append(b);
  }
  $('region').replaceChildren(...available.map(v=>option(v.region,v.region)));$('region').value=region;
  const pair=$('pair').checked;const other=getCandidate($('other').value);
  const otherView=other?.views.find(v=>v.kind===kind&&v.region===region)||other?.views.find(v=>v.kind===kind)||other?.views[0];
  $('compare-control').hidden=!pair;$('other-figure').hidden=!pair;
  $('stage').classList.toggle('pairwise',pair);$('stage').classList.toggle('zoomed',zoomed);
  function image(id,url){
    const e=$(id);
    if(url){
      if(e.getAttribute('src')!==url){
        // Do not display the previous decoded frame under a new candidate title.
        e.classList.add('loading');
        e.onload=()=>e.classList.remove('loading');
        e.src=url;
      }
      e.hidden=false;
    }else{e.removeAttribute('src');e.hidden=true;e.classList.remove('loading');}
  }
  image('target-image',view?.target);$('target-missing').hidden=!!view?.target;
  image('candidate-image',flipped&&view?.target?view.target:shown);
  image('clear-image',showBoth?view.clear:null);
  image('other-image',pair?otherView?.image:null);
  text('candidate-caption',flipped?'TARGET FLIP':(mode==='clear'?'CLEAR':legacy?'CANDIDATE':'LOOK')+' / '+(current?.title||'Unbound'));
  text('other-title','LEFT / '+(other?.title||'Choose comparison'));
  function dimensions(url){const a=asset(url);return a?a.size.join(' × '):'';}
  text('target-size',dimensions(view?.target));text('candidate-size',dimensions(flipped?view?.target:shown));text('other-size',dimensions(otherView?.image));
  text('clear-size',dimensions(view?.clear));
  text('image-note',(view?.target_note||'No source image bound.')+(view?.optics?' Optics receipt: '+JSON.stringify(view.optics):''));
  text('view-state',`${zoomed?'1:1 pixels; scroll to inspect':'Fit view'}${flipped?' / target flip':''}`);
  $('zoom').setAttribute('aria-pressed',String(zoomed));$('flip').setAttribute('aria-pressed',String(flipped));
  $('sources').replaceChildren();
  for(const [name,url] of [['LOOK original',view?.look],['CLEAR original',view?.clear],['Candidate original',view?.image],['Target original',view?.target],...(current?.comparisons||[]).map((url,i)=>['Comparison sheet '+(i+1),url]),...(historyEntry?.review_images||[]).map(i=>['Historical '+i.role,i.image])]){
    if(!url)continue;const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=name;$('sources').append(a);
  }
  buttons();
  if(pair&&otherView&&otherView.kind!==kind)status('Left candidate has no matching density; showing '+(kinds[otherView.kind]||otherView.kind)+'.');
}
function move(delta){if(busy)return;remember();if(index+delta<0||index+delta>=list.length){status('End of this queue. Choose another queue or revisit a rating.');return;}index+=delta;render();}
function setStars(n){draft.stars=n;failedPayload=null;buttons();status('Draft quality: '+n+'/5. Enter saves when a decision is selected.');}
function setVerdict(v){draft.verdict=v;failedPayload=null;buttons();status('Draft decision: '+v+'. Enter to save.');}
function prefer(value){if(!$('other').value){status('Choose a comparison candidate first.',true);return;}$('pair').checked=true;draft.preference=value;failedPayload=null;renderImages();buttons();}
async function save(){
  if(busy||!canSave())return;
  if($('pair').checked&&!draft.preference){status('Choose left, right, or tie before saving a comparison.',true);return;}
  busy=true;buttons();status('Saving locally and refreshing next batch…');
  const request=failedPayload||{event_id:'ui-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),
    judged_on:draft.judged_on||null,trial_id:chatEntry?chatEntry.trial_id:current.trial_id,element:chatEntry?.element||current.element,stars:draft.stars,verdict:draft.verdict,note:$('note').value,
    pairwise:$('pair').checked?{other_trial_id:$('other').value,preference:draft.preference}:null,
    aspect:draft.aspect||'overall',scope:chatEntry?.scope||(historyEntry?'component':'trial'),confirmed_from:chatEntry?.event_id||null,history_id:historyEntry?.id||null};
  try{
    const response=await fetch('/api/label',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':data.token},body:JSON.stringify(request)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Save failed');
    data.labels.push(result.event);drafts.delete(key());failedPayload=null;
    $('recommendation').hidden=false;text('next-element',result.next.element);text('next-best',result.next.blocked||('Learned best: '+(result.next.learned_best||'not established yet')));
    $('next-batch').replaceChildren();
    for(const item of result.next.batch){const div=document.createElement('div'),strong=document.createElement('strong'),p=document.createElement('p');strong.textContent=item.action.replaceAll('_',' ')+' / '+(item.mechanism_class||'evidence');p.textContent=item.reason;div.append(strong,p);$('next-batch').append(div);}
    busy=false;
    if(index<list.length-1){index++;render();}else{render();}
    status('Saved '+request.verdict+' / '+(request.stars===null?'unrated':request.stars+' stars')+'. Next batch refreshed'+(index===list.length-1?' (last item in queue).':'.'));
  }catch(error){failedPayload=request;busy=false;status('Not confirmed: '+error.message+'. Retry Save with the same request ID.',true);}
  buttons();
}
$('judge-mode').onchange=()=>{draft.judged_on=$('judge-mode').value;failedPayload=null;renderImages();};
$('look-toggle').onclick=()=>{const modes=Array.from($('judge-mode').options).map(o=>o.value).filter(Boolean);draft.judged_on=modes[(modes.indexOf(draft.judged_on)+1)%modes.length];failedPayload=null;renderImages();};
$('region').onchange=()=>{region=$('region').value;flipped=false;renderImages();};
$('pair').onchange=()=>{draft.preference=null;renderImages();buttons();};
$('other').onchange=()=>{draft.preference=null;failedPayload=null;renderImages();buttons();};
$('binding').onchange=()=>{current=getCandidate($('binding').value)||null;draft={stars:null,verdict:null,note:$('note').value,preference:null,boundId:current?.trial_id};drafts.set(key(),draft);if(current){text('title',current.title);text('hypothesis',current.hypothesis);}renderImages();buttons();};
$('zoom').onclick=()=>{if(!zoomed&&current){const max=current.views.find(v=>v.kind==='1gp')||current.views.find(v=>v.kind==='201mp')||current.views.find(v=>v.kind==='native');if(max){kind=max.kind;region=max.region;}}zoomed=!zoomed;renderImages();};
$('flip').onclick=()=>{flipped=!flipped;renderImages();};
$('prefer-left').onclick=()=>prefer('other');$('prefer-right').onclick=()=>prefer('candidate');$('tie').onclick=()=>prefer('tie');
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('save').onclick=save;
$('aspect').oninput=()=>{draft.aspect=$('aspect').value;failedPayload=null;};
$('note').oninput=()=>{draft.note=$('note').value;failedPayload=null;};
$('theme').onclick=()=>document.body.classList.toggle('light');
for(let n=1;n<=5;n++){const b=document.createElement('button');b.textContent=n;b.setAttribute('aria-label',n+' star'+(n===1?'':'s'));b.onclick=()=>setStars(n);$('stars').append(b);}
document.querySelectorAll('[data-verdict]').forEach(b=>b.onclick=()=>setVerdict(b.dataset.verdict));
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||busy)return;
  const input=/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if(input){if(event.key==='Escape')event.target.blur();return;}
  const k=event.key.toLowerCase();
  if(/^[1-5]$/.test(k)){event.preventDefault();setStars(Number(k));}
  else if(['a','r','m'].includes(k)){event.preventDefault();setVerdict({a:'accept',r:'reject',m:'maybe'}[k]);}
  else if(k==='enter'){event.preventDefault();save();}
  else if(k==='n'||k==='p'){event.preventDefault();move(k==='n'?1:-1);}
  else if(k==='l'){event.preventDefault();$('look-toggle').click();}
  else if(k==='z'){event.preventDefault();$('zoom').click();}
  else if(k===' '){event.preventDefault();$('flip').click();}
  else if(k==='arrowleft'||k==='arrowright'){event.preventDefault();prefer(k==='arrowleft'?'other':'candidate');}
});
for(const img of document.querySelectorAll('img'))img.addEventListener('error',()=>status('Image unavailable. Open source evidence before rating.',true));
async function refreshCatalog(){
  if(busy||failedPayload)return;
  try{
    const response=await fetch('/api/state');if(!response.ok)throw new Error('Queue refresh failed');
    const value=await response.json();
    text('poll-state',value.polling?.error?'Lane refresh waiting: '+value.polling.error:
      value.polling?.active?'Auto-add: every 15 minutes for this four-hour server window.':'Auto-add window complete; restart server to watch again.');
    if(busy||failedPayload)return;
    if(value.generated_at!==data.generated_at){
      remember();const id=chatEntry?.event_id||historyEntry?.id||current?.trial_id;
      data=value;
      const updated=entries(queue);
      const found=updated.findIndex(c=>(c.event_id||c.id||c.trial_id)===id);if(found>=0)index=found;
      text('connection','Local / '+data.candidates.filter(c=>c.queue!=='history-only').length+' candidates');
      renderQueue();
    }
  }catch(error){text('poll-state',error.message+'; existing queue retained.');}
}
fetch('/api/state').then(r=>{if(!r.ok)throw new Error('Server returned '+r.status);return r.json();}).then(value=>{
  data=value;
  try{const saved=JSON.parse(localStorage.getItem('owner-review-position'));if(saved&&labels[saved.queue]){queue=saved.queue;index=saved.index||0;}}catch{}
  text('connection','Local / '+data.candidates.filter(c=>c.queue!=='history-only').length+' candidates');renderQueue();
  document.body.dataset.ready='true';
  setInterval(refreshCatalog,30000);
}).catch(error=>{text('connection','Unable to load');status(error.message,true);});
