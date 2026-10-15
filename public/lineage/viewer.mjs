export function filterEntries(entries, {theme='', phase='', status='', query='', newest=false} = {}) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(e => (!theme || e.theme === theme) && (!phase || e.phase === phase) &&
    (!status || e.status === status) && words.every(word => `${e.theme} ${e.version} ${e.caption} ${e.phase} ${e.status} ${e.hash} ${e.date}`.toLowerCase().includes(word)))
    .sort((a,b) => (a.date.localeCompare(b.date) || a.theme.localeCompare(b.theme) || Number(a.version.slice(1))-Number(b.version.slice(1))) * (newest ? -1 : 1));
}
export function parseHash(hash) {
  const match = /^#\/(day|white|blue|dark|night)\/(v\d+|current)$/.exec(hash);
  return match ? {theme:match[1],version:match[2]} : null;
}
export function windowRange(count, columns, top, height, rowHeight) {
  const row = Math.floor(Math.max(0, top)/rowHeight);
  const start = Math.min(count, Math.max(0,row-1)*columns);
  return {start, end: Math.max(start,Math.min(count,(row+Math.ceil(height/rowHeight)+2)*columns))};
}

async function start(root) {
  const $ = selector => root.querySelector(selector);
  const viewport = $('#lineage-viewport'), grid = $('#lineage-grid'), counter = $('#lineage-count');
  const controls = $('#lineage-filters'), dialog = $('#lineage-lightbox');
  const imageRoot = root.dataset.imageRoot;
  const url = tuple => imageRoot + tuple[0];
  const dateFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  const date = value => dateFormatter.format(new Date(value));
  let data;
  try {
    // The archive is below the poster introduction. Do not let its JSON and
    // thumbnail traffic compete with the preloaded typeface that paints LCP.
    await document.fonts.ready;
    const response = await fetch(root.dataset.dataset, {priority:'low'});
    if (!response.ok) throw new Error('Archive unavailable');
    data = await response.json();
    if (data.schema !== 1) throw new Error('Unsupported archive');
  } catch {
    counter.textContent = 'The archive could not load. Reload to try again; references and current picks remain above.';
    return;
  }
  let filtered = [], newest = false, columns = 5, rowHeight = 440, active = null, opener = null;
  const byId = new Map(data.entries.map(e => [`${e.theme}/${e.version}`,e]));
  for (const [theme, entry] of Object.entries(data.current)) byId.set(`${theme}/current`,entry);
  for (const phase of [...new Set(data.entries.map(e=>e.phase))].sort()) $('#lineage-phase').add(new Option(phase,phase));
  function image(e, medium=false) {
    const img = document.createElement('img');
    const selected = e.thumbs[medium?'medium':'small'];
    img.src = url(selected); img.width = selected[1]; img.height = selected[2];
    img.alt = e.caption; img.decoding = 'async';
    if (!medium) {
      img.loading = 'lazy';
      img.srcset = `${url(e.thumbs.small)} ${e.thumbs.small[1]}w, ${url(e.thumbs.large)} ${e.thumbs.large[1]}w`;
      img.sizes = '(max-width: 600px) 42vw, (max-width: 1000px) 27vw, 220px';
    }
    return img;
  }
  function card(e, index) {
    const card = document.createElement('a');
    card.className = 'lineage-card'; card.href = `#/${e.theme}/${e.version}`;
    card.dataset.index = index; card.dataset.id = `${e.theme}/${e.version}`;
    card.setAttribute('role','listitem'); card.setAttribute('aria-posinset',index+1); card.setAttribute('aria-setsize',filtered.length);
    card.setAttribute('aria-label',`${e.theme} ${e.version}, ${e.caption}, ${e.status}. Open image and provenance`);
    const heading = document.createElement('h3'); heading.textContent = `${e.theme} / ${e.version}`;
    const status = document.createElement('span'); status.className = 'lineage-status'; status.textContent = e.status;
    const caption = document.createElement('p'); caption.textContent = e.caption;
    const time = document.createElement('time'); time.dateTime = e.date; time.textContent = date(e.date);
    const provenance = document.createElement('small'); provenance.textContent = `${e.dateSource} · ${e.hash}`;
    card.append(image(e),heading,status,caption,time,provenance);
    return card;
  }
  function render() {
    grid.replaceChildren(...filtered.map(card));
    position();
  }
  function position() {
    grid.style.height=`${Math.ceil(filtered.length/columns)*rowHeight}px`;
    for (let i=0;i<grid.children.length;i++) {
      const element=grid.children[i];
      element.style.transform=`translateY(${Math.floor(i/columns)*rowHeight}px)`;
      element.style.left=`calc(${(i%columns)*100/columns}% + 7px)`;
      element.style.width=`calc(${100/columns}% - 14px)`;
    }
  }
  function resize(entries) {
    const {width}=entries[0].contentRect;
    columns=width<600?2:width<1000?3:5;
    rowHeight=width<600?380:440;
    position();
  }
  function apply() {
    const form = new FormData(controls);
    filtered = filterEntries(data.entries,{theme:form.get('theme'),phase:form.get('phase'),status:form.get('status'),query:form.get('query'),newest});
    viewport.scrollTop = 0;
    counter.textContent = `${filtered.length} of ${data.entries.length} versions · ${newest?'Newest':'Oldest'} first`;
    $('#lineage-empty').hidden = filtered.length !== 0;
    render();
  }
  function open(entry) {
    active = entry;
    if (!dialog.open) opener = document.activeElement;
    const isCurrent = data.current[entry.theme] === entry;
    $('#lineage-detail-title').textContent = `${entry.theme} / ${isCurrent ? 'current · ' : ''}${entry.version}`;
    $('#lineage-detail-image').replaceChildren(image(entry,true));
    $('#lineage-detail-caption').textContent = entry.caption;
    $('#lineage-detail-provenance').textContent = entry.date ? `${date(entry.date)} CDT · ${entry.dateSource}. ${entry.phase}. Status: ${entry.status}. Archive representative SHA-256 prefix: ${entry.hash}.${isCurrent ? ' Showing the exact current selection; archive date and hash identify its earliest deduplicated representative.' : ''}` : 'Locked art-direction reference, not a rendered production version.';
    $('#lineage-detail-link').href = entry.date ? `#/${entry.theme}/${isCurrent ? 'current' : entry.version}` : '#references';
    const inHistory = data.entries.includes(entry);
    $('#lineage-prev').disabled = !inHistory; $('#lineage-next').disabled = !inHistory;
    if (!dialog.open) dialog.showModal();
  }
  function route() {
    const route = parseHash(location.hash);
    const entry = route && byId.get(`${route.theme}/${route.version}`);
    if (entry) open(entry);
    else if (dialog.open) dialog.close();
  }
  function step(delta) {
    const list = filtered.includes(active) ? filtered : filterEntries(data.entries,{theme:active?.theme});
    const index = list.indexOf(active);
    const next = list[Math.max(0,Math.min(list.length-1,index+delta))];
    if (next) location.hash = `/${next.theme}/${next.version}`;
  }
  controls.addEventListener('submit',e=>e.preventDefault());
  controls.addEventListener('input',apply);
  $('#lineage-order').addEventListener('click',event=>{
    newest=!newest; event.currentTarget.setAttribute('aria-pressed',String(newest));
    event.currentTarget.textContent=newest?'Oldest first ↑':'Newest first ↓'; apply();
  });
  $('#lineage-reset').addEventListener('click',()=>{controls.reset();newest=false;$('#lineage-order').textContent='Newest first ↓';$('#lineage-order').setAttribute('aria-pressed','false');apply();});
  root.querySelectorAll('[data-theme-jump]').forEach(button=>button.addEventListener('click',()=>{
    controls.reset();$('#lineage-theme').value=button.dataset.themeJump;apply();$('#timeline').scrollIntoView();viewport.focus();
  }));
  root.querySelectorAll('[data-reference]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();open(data.references[button.dataset.reference]);}));
  new ResizeObserver(resize).observe(viewport);
  viewport.addEventListener('keydown',event=>{
    const current=Number(document.activeElement?.dataset.index ?? 0);
    const moves={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns,PageDown:columns*2,PageUp:-columns*2};
    let index;
    if (event.key in moves) index=current+moves[event.key];
    else if(event.key==='Home') index=0;
    else if(event.key==='End') index=filtered.length-1;
    else return;
    event.preventDefault(); index=Math.max(0,Math.min(filtered.length-1,index));
    if (!filtered.length) return;
    grid.querySelector(`[data-index="${index}"]`)?.focus();
  });
  $('#lineage-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    if(parseHash(location.hash)) history.replaceState(null,'',location.pathname+location.search+'#timeline');
    $('#lineage-detail-image').replaceChildren();
    if(opener?.isConnected) opener.focus({preventScroll:true});
  });
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}});
  $('#lineage-prev').addEventListener('click',()=>step(-1));
  $('#lineage-next').addEventListener('click',()=>step(1));
  addEventListener('hashchange',route);
  apply(); route(); root.dataset.ready='true';
}
if (typeof document !== 'undefined') {
  const root=document.querySelector('[data-lineage]');
  if(root) start(root);
}
