/* Progressive enhancement only. No framework runtime, tracking or remote requests. */
(() => {
  const root = document.querySelector('#explorer');
  if (!root) return;
  const controls = document.querySelector('#learn-controls');
  const output = document.querySelector('#learn-results');
  const status = document.querySelector('#learn-status');
  const loadButton = document.querySelector('#learn-load');
  const more = document.querySelector('#learn-more');
  const filters = ['scene', 'method', 'outcome'].map(key => document.querySelector(`#learn-${key}`));
  const curated = new Map(Array.from(output.children, node => [node.id, node.cloneNode(true)]));
  let records = null, pending = null, limit = 24;
  const index = new Map();
  controls.hidden = false;
  function element(tag, text) { const node = document.createElement(tag); node.textContent = text; return node; }
  function recordNode(row) {
    if (curated.has(row.id)) return curated.get(row.id).cloneNode(true);
    const details = document.createElement('details');
    details.id = row.id;
    const summary = document.createElement('summary');
    summary.append(element('span', `${row.scene_id} / ${row.outcome}`), element('b', row.title), element('span', '+'));
    const body = document.createElement('div'); body.className = 'learn-record';
    body.append(element('p', `Record kind: ${row.kind}. Evidence ID: ${row.id}`), element('p', `Date: ${row.date || 'Unknown'} (${row.date_basis || 'not recorded'})`));
    body.append(element('p', `Method: ${row.method_id}. ${row.change_classes.length ? `Change classes (keyword heuristic, not adjudicated): ${row.change_classes.map(c => c.class).join(', ')}.` : ''}`));
    body.append(element('p', row.prompts.length ? row.prompts.map(p => `${p.kind}: ${p.text_excerpt}`).join('\n') : 'Prompt excerpt: not published for this record.'));
    body.append(element('p', row.judgments.length ? row.judgments.map(j => `Judge: ${j.outcome}. Setup: ${j.setup}. ${j.excerpt}`).join('\n') : 'Judge verdict: no normalized verdict in this record.'));
    body.append(element('p', row.owner_labels.length ? row.owner_labels.map(o => `Owner (${o.element}): ${o.excerpt}`).join('\n') : 'Owner reaction: no curated, bound reaction published. Not evidence of acceptance.'));
    body.append(element('p', `Image: ${row.node_artifacts.length} content-hashed artifacts in the manifest. No reviewed public derivative attached to this attempt.`));
    details.append(summary, body); return details;
  }
  function render() {
    const start = performance.now();
    const values = filters.map(filter => filter.value);
    let pool = records;
    for (let i = 0; i < values.length; i++) {
      if (values[i]) {
        const candidates = index.get(`${i}:${values[i]}`) || new Set();
        pool = pool.filter(row => candidates.has(row.id));
      }
    }
    const fragment = document.createDocumentFragment();
    pool.slice(0, limit).forEach(row => fragment.append(recordNode(row)));
    if (!pool.length) fragment.append(element('p', 'No records match these filters. Try another combination.'));
    output.replaceChildren(fragment);
    more.hidden = pool.length <= limit;
    status.textContent = `${pool.length} matching records · ${Math.min(limit, pool.length)} shown. Attempts and process case studies remain separate in the data.`;
    root.dataset.renderMs = (performance.now() - start).toFixed(2);
  }
  async function load() {
    if (records) return;
    if (pending) return pending;
    loadButton.disabled = true; status.textContent = 'Loading the immutable attempt index…';
    pending = fetch(root.dataset.source).then(response => { if (!response.ok) throw new Error('fetch'); return response.json(); }).then(data => {
      records = data;
      for (const row of records) [row.scene_id,row.method_id,row.outcome].forEach((value,i) => {
        const key = `${i}:${value}`; if (!index.has(key)) index.set(key,new Set()); index.get(key).add(row.id);
      });
      loadButton.hidden = true;
    }).catch(() => { status.textContent = 'The index could not be loaded. Curated evidence is still available; retry or use the JSON manifest.'; throw new Error('load-failed'); }).finally(() => { loadButton.disabled = false; pending = null; });
    return pending;
  }
  async function update() { try { await load(); render(); } catch { /* Keep the readable, server-rendered evidence. */ } }
  loadButton.addEventListener('click', update);
  filters.forEach(filter => filter.addEventListener('change', () => { limit = 24; update(); }));
  more.addEventListener('click', () => { limit += 24; render(); });
})();
