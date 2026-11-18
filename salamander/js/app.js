import {
  configured, listModels, getModel, getCategories, getCollections, getCollection,
  categoryCovers, countView, fileUrl, MODEL_TYPES,
} from './api.js';
import {
  $, $$, esc, fmtDate, debounce, toast, modelUrl, categoryUrl, homeUrl,
  renderQrBlock, shareLink, copyText,
} from './util.js';
import { CONFIG } from '../config.js';

const main = $('#main');
const SITE = 'Salamander Digital Museum';
let cleanup = null;
let routeToken = 0;
let catCache = null;
const cats = async () => (catCache ||= await getCategories());
const catName = (list, slug) => (list.find((c) => c.slug === slug) || {}).name || '';

const SHOE = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 33c0-3 1.500-4 4-4h6l6-7 4 3 7 1c5 1 9 3.500 11 6v5c0 1-1 2-2 2H6c-1.100 0-2-.9-2-2v-4z"/><path d="M4 37h40"/></svg>';

/* ------------------------------------------------------------ shell */
$('#year').textContent = new Date().getFullYear();
const closeDrawer = () => { document.body.classList.remove('drawer-open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); };
const openDrawer = () => { document.body.classList.add('drawer-open'); $('#menuBtn').setAttribute('aria-expanded', 'true'); $('#drawerClose').focus(); };
$('#menuBtn').addEventListener('click', openDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerBg').addEventListener('click', closeDrawer);
const closeSearch = () => document.body.classList.remove('search-open');
$('#searchBtn').addEventListener('click', () => { document.body.classList.add('search-open'); setTimeout(() => $('#searchInput').focus(), 30); });
$('#searchClose').addEventListener('click', closeSearch);
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#searchInput').value.trim();
  closeSearch();
  go('/search' + (v ? '?q=' + encodeURIComponent(v) : ''));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeSearch(); } });

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || /^\/(assets|css|js)\//.test(u.pathname)) return;
  e.preventDefault();
  go(u.pathname + u.search);
});
window.addEventListener('popstate', () => render());

function go(url) {
  closeDrawer();
  closeSearch();
  history.pushState(null, '', url);
  render();
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------ helpers */
function setMeta(title, desc, image) {
  document.title = title ? `${title} — ${SITE}` : SITE;
  const set = (sel, attr, val) => { const el = $(sel); if (el && val) el.setAttribute(attr, val); };
  set('meta[name=description]', 'content', desc);
  set('meta[property="og:title"]', 'content', document.title);
  if (image) {
    let og = $('meta[property="og:image"]');
    if (!og) { og = document.createElement('meta'); og.setAttribute('property', 'og:image'); document.head.appendChild(og); }
    og.setAttribute('content', image);
  }
}

const card = (m, cl) => `
  <a class="card" href="/models/${esc(m.public_id)}">
    <div class="thumb">
      ${m.thumb_path ? `<img src="${esc(fileUrl(m.thumb_path))}" alt="${esc(m.title)}" loading="lazy" decoding="async" width="400" height="300">` : `<div class="ph">${SHOE}</div>`}
      <span class="badge-3d ${m.status === 'draft' ? 'badge-draft' : ''}">${m.status === 'draft' ? 'DRAFT' : '3D'}</span>
    </div>
    <div class="body"><h3>${esc(m.title)}</h3>
      <div class="meta"><span>${esc(catName(cl, m.category_slug))}</span><span>${m.views || 0} views</span></div></div>
  </a>`;

const skeletons = (n = 4) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
const head = (title, text) => `<div class="page-head"><div class="wrap"><h1 style="font-size:clamp(2rem,5vw,3rem)">${esc(title)}</h1>${text ? `<p>${esc(text)}</p>` : ''}</div></div>`;
const errorBlock = (e) => `<div class="wrap" style="padding:60px 20px"><div class="notice err"><strong>Something went wrong.</strong><br>${esc((e && e.message) || e)}<br><br><button class="btn sm" onclick="location.reload()">Reload</button></div></div>`;

function setupNotice() {
  main.innerHTML = `<div class="wrap" style="padding:60px 20px;max-width:760px">
    <h1 style="font-size:2rem">Almost there — connect the database</h1>
    <p>The museum is not connected to Supabase yet. Open <code>config.js</code>, paste your Supabase project URL and anon key, then run <code>supabase/schema.sql</code> in the Supabase SQL editor. The full steps are in <code>README.md</code>.</p></div>`;
}

function viewerOpts(m) {
  return { url: fileUrl(`${m.storage_folder}/${m.main_file}`), expectedSize: m.file_size };
}

/* -------------------------------------------------------------- browse */
async function mountBrowse(root, cfg = {}) {
  const cl = await cats();
  const url = new URLSearchParams(location.search);
  const st = { q: '', category: '', type: '', date: '', sort: 'newest', ...(cfg.defaults || {}) };
  ['q', 'category', 'type', 'date', 'sort'].forEach((k) => { if (url.has(k)) st[k] = url.get(k); });
  const show = cfg.controls || ['q', 'category', 'type', 'date', 'sort'];
  const sel = (key, label, opts) => show.includes(key)
    ? `<label class="field"><span>${label}</span><select data-f="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${st[key] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : '';
  root.innerHTML = `
    <div class="filters">
      ${show.includes('q') ? `<label class="field full"><span>Search</span><input type="search" data-f="q" value="${esc(st.q)}" placeholder="Name, designer, material, tag…"></label>` : ''}
      ${sel('category', 'Category', [['', 'All categories'], ...cl.map((c) => [c.slug, c.name])])}
      ${sel('type', 'Model type', [['', 'All types'], ...MODEL_TYPES.map((t) => [t, t])])}
      ${sel('date', 'Upload date', [['', 'Any time'], ['week', 'Past week'], ['month', 'Past month'], ['year', 'Past year']])}
      ${sel('sort', 'Sort by', [['newest', 'Newest'], ['popular', 'Most popular'], ['alpha', 'A – Z']])}
    </div>
    <p class="muted" data-count></p>
    <div class="grid" data-grid></div>
    <div class="more" data-more></div>`;
  const grid = $('[data-grid]', root), more = $('[data-more]', root), count = $('[data-count]', root);
  let items = 0, token = 0, total = 0;

  async function load(reset) {
    const t = ++token;
    if (reset) { items = 0; grid.innerHTML = skeletons(8); more.innerHTML = ''; }
    else more.innerHTML = '<span class="muted">Loading…</span>';
    try {
      const res = await listModels({ ...st, ...(cfg.fixed || {}), offset: items, limit: 12 });
      if (t !== token) return;
      if (reset) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', res.items.map((m) => card(m, cl)).join(''));
      items += res.items.length;
      total = res.total;
      count.textContent = total ? `${total} model${total === 1 ? '' : 's'}` : '';
      if (!total) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(cfg.empty || 'No models match your search yet. Try different filters.')}</div>`;
      more.innerHTML = items < total ? '<button class="btn ghost" data-loadmore>Load more</button>' : '';
    } catch (e) {
      if (t !== token) return;
      grid.innerHTML = `<div style="grid-column:1/-1">${errorBlock(e)}</div>`;
      more.innerHTML = '';
    }
  }
  function syncUrl() {
    if (cfg.sync === false) return;
    const p = new URLSearchParams(location.search);
    ['q', 'category', 'type', 'date', 'sort'].forEach((k) => { if (show.includes(k) || k === 'q') { st[k] && st[k] !== (k === 'sort' ? 'newest' : '') ? p.set(k, st[k]) : p.delete(k); } });
    const s = p.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }
  const onInput = debounce((e) => { const f = e.target.dataset.f; if (f === 'q') { st.q = e.target.value; syncUrl(); load(true); } }, 320);
  root.addEventListener('input', onInput);
  root.addEventListener('change', (e) => { const f = e.target.dataset.f; if (f && f !== 'q') { st[f] = e.target.value; syncUrl(); load(true); } });
  root.addEventListener('click', (e) => { if (e.target.closest('[data-loadmore]')) load(false); });
  load(true);
  return { setQ(v) { st.q = v; syncUrl(); load(true); }, st };
}

/* --------------------------------------------------------------- pages */
async function pageHome() {
  main.innerHTML = `<div class="wrap" style="padding:40px 20px"><div class="grid">${skeletons(4)}</div></div>`;
  const [cl, popular, recent, colls, feat, covers] = await Promise.all([
    cats(), listModels({ sort: 'popular', limit: 4 }), listModels({ sort: 'newest', limit: 8 }),
    getCollections(), listModels({ featured: true, limit: 1 }), categoryCovers(),
  ]);
  const f = feat.items[0] || popular.items[0] || recent.items[0] || null;
  let viewer = null;

  main.innerHTML = `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <span class="eyebrow">Interactive 3D museum</span>
      <h1>Footwear, seen from every angle.</h1>
      <p class="lead">Turn, zoom and inspect shoe designs, constructions and historical footwear in real-time 3D — right in your browser, on any device.</p>
      <div class="btn-row"><a class="btn accent" href="/explore">Explore 3D models</a><a class="btn ghost" href="/categories">Browse categories</a></div>
    </div>
    <div class="feature" id="feature">
      ${f ? `${f.thumb_path ? `<img class="poster" src="${esc(fileUrl(f.thumb_path))}" alt="${esc(f.title)}" decoding="async">` : `<div class="poster-empty">${SHOE}</div>`}
        <div class="vwrap" id="fv" hidden></div>
        <div class="cap"><div><small>Featured exhibition</small><b>${esc(f.title)}</b></div>
          <div class="btn-row"><button class="btn sm accent" id="fvGo">Explore in 3D</button><a class="btn sm ghost" href="/models/${esc(f.public_id)}">Details</a></div></div>`
        : `<div class="poster-empty"><div>${SHOE}<p style="margin-top:10px">The first exhibition is coming soon.</p></div></div>`}
    </div>
  </div></section>

  <section class="block"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Explore</span><h2>Explore 3D Models</h2></div><a class="link-arrow" href="/explore">View all</a></div>
    <div class="chips" id="chips"><button class="chip on" data-c="">All</button>${cl.map((c) => `<button class="chip" data-c="${esc(c.slug)}">${esc(c.name)}</button>`).join('')}</div>
    <div class="grid" id="exploreGrid">${recent.items.length ? recent.items.map((m) => card(m, cl)).join('') : '<div class="empty" style="grid-column:1/-1">No exhibitions published yet.</div>'}</div>
  </div></section>

  <section class="block tint"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Most viewed</span><h2>Popular Models</h2></div><a class="link-arrow" href="/popular">See more</a></div>
    <div class="grid">${popular.items.length ? popular.items.map((m) => card(m, cl)).join('') : '<div class="empty" style="grid-column:1/-1">Nothing here yet.</div>'}</div>
  </div></section>

  <section class="block"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Just in</span><h2>Recently Added</h2></div><a class="link-arrow" href="/recent">See more</a></div>
    <div class="grid">${recent.items.length ? recent.items.slice(0, 4).map((m) => card(m, cl)).join('') : '<div class="empty" style="grid-column:1/-1">Nothing here yet.</div>'}</div>
  </div></section>

  <section class="block tint"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Curated</span><h2>Featured Collections</h2></div><a class="link-arrow" href="/collections">All collections</a></div>
    ${colls.length ? `<div class="colls">${colls.slice(0, 3).map((c) => `<a class="coll" href="/collections/${esc(c.slug)}"><h3>${esc(c.title)}</h3><p class="muted">${esc(c.description)}</p><span class="link-arrow">Open collection</span></a>`).join('')}</div>` : '<div class="empty">Collections will appear here soon.</div>'}
  </div></section>

  <section class="block"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Browse</span><h2>Categories</h2></div><a class="link-arrow" href="/categories">All categories</a></div>
    <div class="cats">${cl.map((c, i) => catCard(c, i, covers)).join('')}</div>
  </div></section>

  <section class="block tint"><div class="wrap about-grid">
    <div><span class="eyebrow">About the museum</span><h2>A living archive of how shoes are made.</h2>
      <p>Salamander Digital Museum brings footwear design and craftsmanship to everyone. Every exhibit is a real 3D model you can rotate, zoom into and inspect layer by layer — from the sole to the stitching.</p>
      <a class="btn ghost" href="/about">Read more</a></div>
    <div class="panel"><h3>Scan &amp; explore</h3><p class="muted">Every exhibition has its own QR code. Scan it with your phone to open the exact model.</p><div id="homeQr"></div></div>
  </div></section>`;

  renderQrBlock($('#homeQr'), homeUrl(), 'salamander-museum-home', { compact: true });

  const goBtn = $('#fvGo');
  if (goBtn) goBtn.addEventListener('click', async () => {
    goBtn.disabled = true; goBtn.textContent = 'Loading…';
    try {
      const full = await getModel(f.public_id);
      if (!full || !full.main_file) throw new Error('This exhibition has no 3D file yet.');
      const { mountViewer } = await import('./viewer.js');
      const box = $('#fv'); box.hidden = false;
      $('#feature .cap').style.display = 'none';
      viewer = mountViewer(box, viewerOpts(full));
    } catch (e) { toast(e.message, 'error'); goBtn.disabled = false; goBtn.textContent = 'Explore in 3D'; }
  });

  $('#chips').addEventListener('click', async (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    $$('#chips .chip').forEach((x) => x.classList.toggle('on', x === b));
    const g = $('#exploreGrid'); g.innerHTML = skeletons(4);
    try {
      const r = await listModels({ category: b.dataset.c, limit: 8 });
      g.innerHTML = r.items.length ? r.items.map((m) => card(m, cl)).join('') : '<div class="empty" style="grid-column:1/-1">No models in this category yet.</div>';
    } catch (err) { g.innerHTML = errorBlock(err); }
  });
  setMeta('', 'Explore footwear design, shoe construction and historical footwear in interactive 3D.');
  return () => viewer && viewer.destroy();
}

function catCard(c, i, covers) {
  const img = covers[c.slug] ? `style="background-image:url('${esc(fileUrl(covers[c.slug]))}')"` : '';
  return `<a class="cat c${i % 8}" href="/category/${esc(c.slug)}" ${img}><div><h3>${esc(c.name)}</h3><small>${esc(c.description)}</small></div></a>`;
}

async function pageList(title, text, cfg) {
  main.innerHTML = `${head(title, text)}<div class="wrap" id="bwrap" style="padding-bottom:50px"></div>`;
  await mountBrowse($('#bwrap'), cfg);
  setMeta(title, text);
}

async function pageCategories() {
  main.innerHTML = `${head('All Categories', 'Choose a category to see its exhibitions.')}<div class="wrap" style="padding:30px 20px 60px"><div class="cats" id="cg">${skeletons(4)}</div></div>`;
  const [cl, covers] = await Promise.all([cats(), categoryCovers()]);
  $('#cg').innerHTML = cl.map((c, i) => catCard(c, i, covers)).join('');
  setMeta('All Categories', 'Browse all footwear categories.');
}

async function pageCategory([slug]) {
  const cl = await cats();
  const c = cl.find((x) => x.slug === slug);
  if (!c) return page404();
  main.innerHTML = `${head(c.name, c.description)}<div class="wrap" style="padding-bottom:50px"><div id="bwrap"></div>
    <details class="panel" style="margin-top:30px"><summary style="cursor:pointer;font-weight:600">QR code for this category</summary><div id="catQr" style="margin-top:14px"></div></details></div>`;
  renderQrBlock($('#catQr'), categoryUrl(c.slug), `category-${c.slug}`, { compact: true });
  await mountBrowse($('#bwrap'), { fixed: { category: slug }, controls: ['q', 'type', 'date', 'sort'], empty: 'No models in this category yet.' });
  setMeta(c.name, c.description);
}

async function pageCollections() {
  main.innerHTML = `${head('Collections', 'Curated groups of exhibitions.')}<div class="wrap" style="padding:30px 20px 60px" id="cw">${skeletons(3)}</div>`;
  const list = await getCollections();
  $('#cw').innerHTML = list.length ? `<div class="colls">${list.map((c) => `<a class="coll" href="/collections/${esc(c.slug)}"><h3>${esc(c.title)}</h3><p class="muted">${esc(c.description)}</p><span class="link-arrow">Open collection</span></a>`).join('')}</div>` : '<div class="empty">No collections yet.</div>';
  setMeta('Collections', 'Curated groups of footwear exhibitions.');
}

async function pageCollection([slug]) {
  const c = await getCollection(slug);
  if (!c) return page404();
  main.innerHTML = `${head(c.title, c.description)}<div class="wrap" style="padding-bottom:50px" id="bwrap"></div>`;
  await mountBrowse($('#bwrap'), { fixed: { collection: slug }, controls: ['q', 'sort'], empty: 'This collection has no published models yet.' });
  setMeta(c.title, c.description);
}

async function pageSearch() {
  const p = new URLSearchParams(location.search);
  let tab = p.get('tab') === 'collections' ? 'collections' : 'models';
  main.innerHTML = `
    <div class="page-head"><div class="wrap">
      <h1 style="font-size:clamp(2rem,5vw,3rem)">Search</h1>
      <label class="field"><span class="sr">Search</span><input id="sq" type="search" placeholder="Search 3D models, collections…" value="${esc(p.get('q') || '')}" autocomplete="off"></label>
      <div class="tabs" role="tablist"><button role="tab" data-tab="models">Models</button><button role="tab" data-tab="collections">Collections</button></div>
    </div></div>
    <div class="wrap" style="padding-bottom:50px" id="sp"></div>`;
  let browse = null;
  async function show() {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const sp = $('#sp');
    if (tab === 'models') {
      browse = await mountBrowse(sp, { controls: ['category', 'type', 'date', 'sort'], defaults: { q: $('#sq').value.trim() } });
    } else {
      browse = null;
      sp.innerHTML = `<div class="colls" style="margin-top:24px" id="cs">${skeletons(3)}</div>`;
      const run = async () => {
        const list = await getCollections($('#sq').value.trim());
        $('#cs').innerHTML = list.length ? list.map((c) => `<a class="coll" href="/collections/${esc(c.slug)}"><h3>${esc(c.title)}</h3><p class="muted">${esc(c.description)}</p></a>`).join('') : '<div class="empty" style="grid-column:1/-1">No collections found.</div>';
      };
      await run();
    }
  }
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tab = b.dataset.tab;
    const u = new URLSearchParams(location.search); tab === 'collections' ? u.set('tab', 'collections') : u.delete('tab');
    history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
    show();
  });
  $('#sq').addEventListener('input', debounce((e) => {
    const v = e.target.value.trim();
    const u = new URLSearchParams(location.search); v ? u.set('q', v) : u.delete('q');
    history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
    if (tab === 'models' && browse) browse.setQ(v);
    else if (tab === 'collections') show();
  }, 320));
  await show();
  setMeta('Search', 'Search the museum.');
}

async function pageModel([pid]) {
  main.innerHTML = `<div class="wrap" style="padding:30px 20px"><div class="viewer-box"></div></div>`;
  const [m, cl] = await Promise.all([getModel(pid), cats()]);
  if (!m) return page404('This exhibition does not exist or is not published.');
  const draft = m.status !== 'published';
  const cat = catName(cl, m.category_slug);
  const url = modelUrl(m.public_id);
  const big = (m.file_size || 0) > 25 * 1024 * 1024;
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
  const block = (k, v) => (v ? `<div class="info"><h4>${k}</h4><p>${esc(v)}</p></div>` : '');
  main.innerHTML = `
    <div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / ${m.category_slug ? `<a href="/category/${esc(m.category_slug)}">${esc(cat)}</a> / ` : ''}<span>${esc(m.title)}</span></nav></div>
    <div class="wrap model-layout">
      <div>
        ${draft ? '<div class="notice warn" style="margin-bottom:14px">Draft preview — this exhibition is not public yet.</div>' : ''}
        <div class="viewer-box" id="vbox"></div>
        <div class="title-row">
          <div>${cat ? `<span class="pill accent">${esc(cat)}</span>` : ''}<h1 style="margin-top:10px">${esc(m.title)}</h1></div>
          <div class="btn-row"><button class="btn sm" id="shareBtn">Share</button><button class="btn sm ghost" id="copyBtn">Copy link</button></div>
        </div>
        <p style="font-size:1.05rem;white-space:pre-line">${esc(m.description)}</p>
        <div class="info-grid">
          ${block('Materials', m.materials)}${block('Construction details', m.construction)}${block('Technical specifications', m.specs)}
        </div>
      </div>
      <aside class="side">
        <div class="panel"><h3>Exhibit details</h3>
          <dl class="dl">${row('Designer', m.designer)}${row('Category', cat)}${row('Type', m.model_type)}${row('Shoe size', m.shoe_size)}${row('Uploaded', fmtDate(m.upload_date))}${row('Views', String(m.views || 0))}</dl>
          ${(m.tags || []).length ? `<div class="tags" style="margin-top:14px">${m.tags.map((t) => `<a href="/search?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        </div>
        <div class="panel"><h3>QR code</h3><p class="muted" style="font-size:.9rem">Scan to open this exhibition on any phone.</p><div id="qr"></div></div>
      </aside>
    </div>
    <section class="block tint" id="relWrap" hidden><div class="wrap"><div class="sec-head"><h2>Related models</h2></div><div class="grid" id="rel"></div></div></section>`;

  if (draft) $('#qr').innerHTML = '<div class="notice">The QR code becomes available once the exhibition is published.</div>';
  else renderQrBlock($('#qr'), url, m.public_id);
  $('#shareBtn').addEventListener('click', () => shareLink(url, m.title));
  $('#copyBtn').addEventListener('click', () => copyText(url));
  setMeta(m.title, (m.description || '').slice(0, 155), m.thumb_path ? fileUrl(m.thumb_path) : '');
  if (!draft) countView(m.public_id);

  let viewer = null;
  const vbox = $('#vbox');
  async function start() {
    if (!m.main_file) { vbox.innerHTML = '<div class="empty" style="height:100%;display:grid;place-content:center">This exhibition has no 3D file yet.</div>'; return; }
    try {
      const { mountViewer } = await import('./viewer.js');
      viewer = mountViewer(vbox, viewerOpts(m));
    } catch (e) { vbox.innerHTML = `<div class="empty" style="height:100%;display:grid;place-content:center">The 3D viewer could not be loaded. Check your connection and reload.</div>`; }
  }
  if (big) {
    vbox.innerHTML = `<div style="height:100%;position:relative;display:grid;place-items:center;background:var(--soft2)">${m.thumb_path ? `<img src="${esc(fileUrl(m.thumb_path))}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55">` : ''}<div style="position:relative;text-align:center;padding:16px"><button class="btn accent" id="loadBig">Load 3D model (${(m.file_size / 1048576).toFixed(0)} MB)</button><p class="muted" style="margin-top:10px;font-size:.85rem">Large file — loads on demand to save data and memory.</p></div></div>`;
    $('#loadBig').addEventListener('click', start);
  } else start();

  if (!draft) listModels({ category: m.category_slug, exclude: m.public_id, limit: 4 }).then((r) => {
    if (!r.items.length) return;
    $('#rel').innerHTML = r.items.map((x) => card(x, cl)).join('');
    $('#relWrap').hidden = false;
  }).catch(() => {});

  return () => { viewer && viewer.destroy(); setMeta('', 'Explore footwear design, shoe construction and historical footwear in interactive 3D.'); };
}

async function pageAbout() {
  main.innerHTML = `${head('About the Museum', 'Where footwear design meets interactive technology.')}
    <div class="wrap" style="padding:36px 20px 60px"><div class="about-grid">
      <div>
        <p style="font-size:1.1rem">Salamander Digital Museum is an online exhibition of footwear: finished designs, construction details, historical pieces and experimental prototypes — each captured as a 3D model that visitors can explore freely.</p>
        <p>Inspect how an Oxford is lasted, how a running sole is layered, or how a boot from another century was stitched. The built-in inspector lets you look at base colour, material channels, wireframe, normals and UV layout, so every exhibit doubles as a learning tool.</p>
        <p>Every exhibition has a permanent address and a QR code, so a physical display, a poster or a classroom handout can open the exact model on a phone in one scan.</p>
        <div class="btn-row"><a class="btn accent" href="/explore">Start exploring</a><a class="btn ghost" href="/contact">Get in touch</a></div>
      </div>
      <div class="panel"><h3>Museum QR code</h3><p class="muted">Scan to open the museum homepage.</p><div id="homeQr"></div></div>
    </div></div>`;
  renderQrBlock($('#homeQr'), homeUrl(), 'salamander-museum-home');
  setMeta('About', 'About Salamander Digital Museum.');
}

async function pageContact() {
  main.innerHTML = `${head('Contact', 'Questions, loan requests or exhibit suggestions — we would love to hear from you.')}
    <div class="wrap" style="padding:30px 20px 60px;max-width:760px"><form class="panel" id="cf" style="display:grid;gap:14px">
      <label class="field"><span>Your name</span><input type="text" name="name" required autocomplete="name"></label>
      <label class="field"><span>Your email</span><input type="email" name="email" required autocomplete="email"></label>
      <label class="field"><span>Message</span><textarea name="msg" required rows="6"></textarea></label>
      <button class="btn accent" type="submit">Send message</button>
      <p class="hint">This opens your email app with the message ready to send to <b>${esc(CONFIG.CONTACT_EMAIL)}</b>.</p>
    </form></div>`;
  $('#cf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = `${f.get('msg')}\n\n— ${f.get('name')} (${f.get('email')})`;
    location.href = `mailto:${CONFIG.CONTACT_EMAIL}?subject=${encodeURIComponent('Museum enquiry from ' + f.get('name'))}&body=${encodeURIComponent(body)}`;
  });
  setMeta('Contact', 'Contact Salamander Digital Museum.');
}

async function pageAdmin() {
  main.innerHTML = '<div class="wrap" style="padding:40px 20px"><p class="muted">Loading…</p></div>';
  const mod = await import('./admin.js');
  return mod.mountAdmin(main);
}

function page404(msg) {
  main.innerHTML = `<div class="wrap" style="padding:80px 20px;text-align:center"><h1>Not found</h1><p class="muted">${esc(msg || 'This page does not exist.')}</p><a class="btn" href="/">Back to the museum</a></div>`;
  setMeta('Not found', '');
}

/* -------------------------------------------------------------- router */
const routes = [
  [/^\/$/, () => pageHome()],
  [/^\/explore$/, () => pageList('Explore 3D Models', 'Browse every exhibition in the museum.', {})],
  [/^\/popular$/, () => pageList('Popular', 'The most viewed exhibitions.', { defaults: { sort: 'popular' }, controls: ['q', 'category', 'type', 'date', 'sort'] })],
  [/^\/staff-picks$/, () => pageList('Staff Picks', 'Chosen by the museum team.', { fixed: { staff: true }, empty: 'No staff picks yet.' })],
  [/^\/recent$/, () => pageList('Recently Added', 'The newest exhibitions.', { defaults: { sort: 'newest' } })],
  [/^\/categories$/, () => pageCategories()],
  [/^\/category\/([\w-]+)$/, (m) => pageCategory(m)],
  [/^\/collections$/, () => pageCollections()],
  [/^\/collections\/([\w-]+)$/, (m) => pageCollection(m)],
  [/^\/search$/, () => pageSearch()],
  [/^\/models\/([\w-]+)$/, (m) => pageModel(m)],
  [/^\/about$/, () => pageAbout()],
  [/^\/contact$/, () => pageContact()],
  [/^\/admin$/, () => pageAdmin()],
];

async function render() {
  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const path = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';
  $$('.nav a[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === '/' ? path === '/' : path.startsWith(a.dataset.nav)));
  const hit = routes.find(([re]) => re.test(path));
  if (!hit) return page404();
  const needsDb = !/^\/(about|contact)$/.test(path);
  if (!configured && needsDb) return setupNotice();
  try {
    const c = await hit[1](path.match(hit[0]).slice(1));
    if (token !== routeToken) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    if (token === routeToken) main.innerHTML = errorBlock(e);
  }
}

render();
