import JSZip from 'jszip';
import { sb, currentAdmin, getCategories, getCollections, fileUrl, MODEL_TYPES } from './api.js';
import { CONFIG } from '../config.js';
import {
  $, $$, esc, fmtBytes, fmtDate, toast, modelUrl, categoryUrl, homeUrl, renderQrBlock, siteUrlProblem,
} from './util.js';

const ALLOWED = ['glb', 'gltf', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'ktx2', 'zip'];
const MIME = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2' };
const MAX = CONFIG.MAX_FILE_MB * 1048576;
const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
const baseOf = (p) => p.split('/').pop();
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function normPath(p) {
  const out = [];
  p.split('/').forEach((s) => { if (!s || s === '.') return; if (s === '..') out.pop(); else out.push(s); });
  return out.join('/');
}
function relPath(fromDir, to) {
  const a = fromDir ? fromDir.split('/') : [];
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
}
const safeSeg = (s) => s.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '_') || 'file';

async function resizeImage(file, maxW = 1000) {
  const bmp = await createImageBitmap(file);
  const w = Math.min(maxW, bmp.width);
  const h = Math.round((w * bmp.height) / bmp.width);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}

export async function mountAdmin(root) {
  const S = {
    tab: 'models', cats: [], colls: [], models: [], editing: null,
    pool: new Map(),       // normalized path -> File
    parsed: null,          // { ok, mainPath, format, json, errors[], warnings[], total }
    thumbBlob: null, thumbUrl: null, busy: false,
  };
  let preview = null;
  let blobUrls = [];
  const view = document.createElement('div');
  view.className = 'wrap admin';
  root.innerHTML = '';
  root.appendChild(view);
  document.title = 'Staff — Salamander Digital Museum';

  const killPreview = () => { if (preview) { preview.destroy(); preview = null; } blobUrls.forEach((u) => URL.revokeObjectURL(u)); blobUrls = []; };
  const cleanupAll = () => { killPreview(); if (S.thumbUrl) URL.revokeObjectURL(S.thumbUrl); };

  /* ================================================================ auth */
  function loginView(msg) {
    cleanupAll();
    view.innerHTML = `<div class="panel login-card"><h2>Staff login</h2><p class="muted">Only museum administrators can sign in.</p>
      <form id="lf"><label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username"></label>
      <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
      <div id="lerr">${msg ? `<div class="notice err">${esc(msg)}</div>` : ''}</div>
      <button class="btn accent" type="submit">Sign in</button></form></div>`;
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button'); btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
      if (error) { btn.disabled = false; return loginView('Invalid email or password.'); }
      const adm = await currentAdmin();
      if (!adm) { await sb.auth.signOut(); return loginView('This account is not authorised to manage the museum.'); }
      dashboard();
    });
  }

  /* ========================================================== dashboard */
  async function dashboard() {
    const [cats, colls] = await Promise.all([getCategories(), getCollections()]);
    S.cats = cats; S.colls = colls;
    view.innerHTML = `
      <div class="a-top"><div><h1 style="font-size:2rem;margin:0">Admin dashboard</h1><span class="muted">Manage exhibitions and QR codes</span></div>
        <div class="btn-row"><button class="btn accent" data-act="new">+ Upload New 3D Model</button><button class="btn ghost" data-act="logout">Sign out</button></div></div>
      <div class="a-tabs"><button data-tab="models">Exhibitions</button><button data-tab="qr">QR codes</button></div>
      <div id="aBody"></div>`;
    showTab(S.tab === 'form' ? 'models' : S.tab);
  }

  async function showTab(tab) {
    S.tab = tab;
    killPreview();
    $$('.a-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('#aBody');
    body.innerHTML = '<p class="muted">Loading…</p>';
    try {
      if (tab === 'models') await modelsTab(body);
      else await qrTab(body);
    } catch (e) { body.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  }

  async function loadModels() {
    const { data, error } = await sb.from('models').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    S.models = data || [];
  }
  const catName = (slug) => (S.cats.find((c) => c.slug === slug) || {}).name || '—';

  async function modelsTab(body) {
    await loadModels();
    if (!S.models.length) { body.innerHTML = '<div class="empty">No exhibitions yet. Click “Upload New 3D Model” to add the first one.</div>'; return; }
    body.innerHTML = `<div class="a-list">${S.models.map((m) => `
      <div class="a-row" data-id="${m.id}">
        <div class="t">${m.thumb_path ? `<img src="${esc(fileUrl(m.thumb_path))}" alt="" loading="lazy">` : ''}</div>
        <div><h3>${esc(m.title)}</h3><div class="muted" style="font-size:.85rem">${esc(catName(m.category_slug))} · <code>${esc(m.public_id)}</code> · ${fmtBytes(m.file_size)} · ${m.views || 0} views</div>
          <span class="status ${m.status}">${m.status}</span></div>
        <div class="acts">
          <button class="btn sm ghost" data-act="edit">Edit</button>
          <a class="btn sm ghost" href="/models/${esc(m.public_id)}" target="_blank" rel="noopener">${m.status === 'published' ? 'View' : 'Preview'}</a>
          <button class="btn sm ghost" data-act="toggle">${m.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button class="btn sm ghost" data-act="qr" ${m.status === 'published' ? '' : 'disabled'}>QR</button>
          <button class="btn sm danger" data-act="delete">Delete</button>
        </div>
        <div class="qr-slot" style="grid-column:1/-1" hidden></div>
      </div>`).join('')}</div>`;
  }

  async function qrTab(body) {
    await loadModels();
    const problem = siteUrlProblem();
    const items = [
      { title: 'Museum homepage', url: homeUrl(), name: 'salamander-museum-home' },
      ...S.cats.map((c) => ({ title: `Category — ${c.name}`, url: categoryUrl(c.slug), name: `category-${c.slug}` })),
      ...S.models.filter((m) => m.status === 'published').map((m) => ({ title: m.title, url: modelUrl(m.public_id), name: m.public_id })),
    ];
    body.innerHTML = `${problem ? `<div class="notice warn" style="margin-bottom:16px">${esc(problem)}</div>` : ''}
      <p class="muted">Every QR code points to a permanent address. Changing a title or description never invalidates a printed QR code.</p>
      <div class="qr-grid">${items.map((it, i) => `<div class="panel" data-i="${i}"><h3 style="font-size:1.05rem">${esc(it.title)}</h3><div class="slot"></div>
        <button class="btn sm ghost" style="margin-top:10px" data-act="regen">Regenerate QR</button></div>`).join('')}</div>`;
    S.qrItems = items;
    items.forEach((_, i) => drawQr(i));
  }
  function drawQr(i) {
    const it = S.qrItems[i];
    renderQrBlock($(`#aBody [data-i="${i}"] .slot`), it.url, it.name, { compact: true });
  }

  /* ======================================================== form (create/edit) */
  function openForm(m) {
    killPreview();
    S.tab = 'form';
    S.editing = m || null;
    S.pool = new Map(); S.parsed = null; S.thumbBlob = null;
    if (S.thumbUrl) { URL.revokeObjectURL(S.thumbUrl); S.thumbUrl = null; }
    const v = (k, d = '') => esc(m && m[k] != null ? m[k] : d);
    const opt = (list, cur, blank) => `${blank ? `<option value="">${blank}</option>` : ''}${list.map(([val, t]) => `<option value="${esc(val)}" ${cur === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    $('#aBody').innerHTML = `
      <div class="a-top"><h2 style="margin:0">${m ? 'Edit exhibition' : 'Upload New 3D Model'}</h2><button class="btn ghost sm" data-act="back">← All exhibitions</button></div>
      <div id="doneBox"></div>
      <form id="mf" novalidate>
        <div class="panel" style="margin-bottom:18px"><h3>1. 3D model file</h3>
          ${m && m.main_file ? `<p class="muted">Current file: <code>${esc(m.main_file)}</code> (${fmtBytes(m.file_size)}). Add new files only if you want to replace it.</p>` : ''}
          <div class="drop" id="drop">
            <p><b>Drag &amp; drop</b> a <b>.glb</b>, a <b>.gltf</b> with its files, or a <b>.zip</b> here</p>
            <p class="muted" style="font-size:.88rem">Max ${CONFIG.MAX_FILE_MB} MB per file. For .gltf also select its .bin and texture files together — or upload everything as one ZIP.</p>
            <label class="btn accent">Browse Files<input type="file" id="fileIn" multiple accept=".glb,.gltf,.bin,.zip,.png,.jpg,.jpeg,.webp,.ktx2" hidden></label>
            <button type="button" class="btn ghost sm" data-act="clearfiles" style="margin-left:8px">Clear</button>
            <div id="fileList" class="file-list"></div><div id="fileMsg" style="margin-top:10px"></div>
          </div>
          <div id="pvWrap" hidden><div class="preview-box" id="pv"></div><p class="hint">Preview before publishing — orbit, zoom and use the inspector exactly like visitors will.</p></div>
        </div>

        <div class="panel" style="margin-bottom:18px"><h3>2. Preview image (thumbnail)</h3>
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
            <img class="thumb-prev" id="thumbPrev" alt="Thumbnail preview" ${m && m.thumb_path ? `src="${esc(fileUrl(m.thumb_path))}"` : 'hidden'}>
            <div style="display:grid;gap:10px"><label class="btn ghost sm">Upload image<input type="file" id="thumbIn" accept="image/png,image/jpeg,image/webp" hidden></label>
              <button type="button" class="btn sm" data-act="capture">Use current 3D view as thumbnail</button>
              <span class="hint">Images are resized to 1000 px wide automatically.</span></div>
          </div>
        </div>

        <div class="panel"><h3>3. Exhibition information</h3>
          <div class="form-grid">
            <label class="field full"><span>Model name *</span><input type="text" name="title" required maxlength="120" value="${v('title')}"></label>
            <label class="field"><span>Category *</span><select name="category_slug" required>${opt(S.cats.map((c) => [c.slug, c.name]), m && m.category_slug, 'Select a category…')}</select></label>
            <label class="field"><span>Model type</span><select name="model_type">${opt(MODEL_TYPES.map((t) => [t, t]), m ? m.model_type : MODEL_TYPES[0])}</select></label>
            <label class="field"><span>Designer</span><input type="text" name="designer" value="${v('designer')}"></label>
            <label class="field"><span>Upload date</span><input type="date" name="upload_date" value="${v('upload_date', today())}"></label>
            <label class="field"><span>Shoe size</span><input type="text" name="shoe_size" placeholder="e.g. EU 42" value="${v('shoe_size')}"></label>
            <label class="field"><span>Collection (optional)</span><select name="collection_slug">${opt(S.colls.map((c) => [c.slug, c.title]), m && m.collection_slug, 'None')}</select></label>
            <label class="field full"><span>Description</span><textarea name="description" rows="4">${v('description')}</textarea></label>
            <label class="field"><span>Materials</span><textarea name="materials" rows="3">${v('materials')}</textarea></label>
            <label class="field"><span>Construction details</span><textarea name="construction" rows="3">${v('construction')}</textarea></label>
            <label class="field full"><span>Technical specifications</span><textarea name="specs" rows="3">${v('specs')}</textarea></label>
            <label class="field full"><span>Tags (comma separated)</span><input type="text" name="tags" placeholder="leather, handmade, 1950s" value="${esc(m ? (m.tags || []).join(', ') : '')}"></label>
            <label class="check"><input type="checkbox" name="featured" ${m && m.featured ? 'checked' : ''}> Featured on the homepage</label>
            <label class="check"><input type="checkbox" name="staff_pick" ${m && m.staff_pick ? 'checked' : ''}> Staff pick</label>
          </div>
        </div>

        <div class="sticky-bar"><div id="upStatus"></div><div class="progress" id="prog" hidden><i></i></div>
          <div class="btn-row" style="margin-top:10px">
            <button type="button" class="btn ghost" data-save="draft">${m && m.status === 'published' ? 'Unpublish &amp; save as draft' : 'Save as Draft'}</button>
            <button type="button" class="btn accent" data-save="published">${m && m.status === 'published' ? 'Save changes' : 'Publish'}</button>
            ${m ? `<a class="btn ghost" target="_blank" rel="noopener" href="/models/${esc(m.public_id)}">Preview public page</a>` : ''}
          </div></div>
      </form>`;
    wireForm();
    if (m && m.main_file) mountPreviewRemote(m);
  }

  async function mountPreviewRemote(m) {
    const { mountViewer } = await import('./viewer.js');
    $('#pvWrap').hidden = false;
    preview = mountViewer($('#pv'), { url: fileUrl(`${m.storage_folder}/${m.main_file}`), expectedSize: m.file_size });
  }

  function wireForm() {
    $('#mf').addEventListener('submit', (e) => e.preventDefault());
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => ingest([...e.dataTransfer.files]));
    $('#fileIn').addEventListener('change', (e) => { ingest([...e.target.files]); e.target.value = ''; });
    $('#thumbIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { setThumb(await resizeImage(f)); } catch { toast('That image could not be read.', 'error'); }
    });
  }

  function setThumb(blob) {
    S.thumbBlob = blob;
    if (S.thumbUrl) URL.revokeObjectURL(S.thumbUrl);
    S.thumbUrl = URL.createObjectURL(blob);
    const img = $('#thumbPrev'); img.src = S.thumbUrl; img.hidden = false;
  }

  /* ----------------------------------------------------- file handling */
  async function ingest(list) {
    const msgs = [];
    for (const f of list) {
      const ext = extOf(f.name);
      if (!ALLOWED.includes(ext)) { msgs.push(`${f.name}: .${ext || '?'} files are not accepted (use .glb, .gltf, .bin, images or a .zip).`); continue; }
      if (f.size > MAX) { msgs.push(`${f.name} is ${fmtBytes(f.size)} — the limit is ${CONFIG.MAX_FILE_MB} MB per file.`); continue; }
      if (ext === 'zip') {
        try {
          const zip = await JSZip.loadAsync(f);
          let names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(n));
          const tops = new Set(names.map((n) => n.split('/')[0]));
          const strip = tops.size === 1 && names.every((n) => n.includes('/')) ? tops.values().next().value + '/' : '';
          for (const n of names) {
            const e = extOf(n);
            if (!ALLOWED.includes(e) || e === 'zip') { msgs.push(`${n} (in ZIP) skipped — .${e} is not accepted.`); continue; }
            const blob = await zip.files[n].async('blob');
            if (blob.size > MAX) { msgs.push(`${n} (in ZIP) is larger than ${CONFIG.MAX_FILE_MB} MB.`); continue; }
            S.pool.set(normPath(strip ? n.slice(strip.length) : n), new File([blob], baseOf(n), { type: MIME[e] }));
          }
        } catch { msgs.push(`${f.name} is not a valid ZIP archive.`); }
      } else S.pool.set(normPath(f.name), f);
    }
    await validatePool(msgs);
  }

  const lookup = (rel) => {
    const key = normPath(rel);
    if (S.pool.has(key)) return key;
    const lower = key.toLowerCase();
    for (const k of S.pool.keys()) if (k.toLowerCase() === lower) return k;
    const b = baseOf(key).toLowerCase();
    const hits = [...S.pool.keys()].filter((k) => baseOf(k).toLowerCase() === b);
    return hits.length === 1 ? hits[0] : null;
  };

  async function validatePool(msgs = []) {
    killPreview();
    const errors = [], warnings = [...msgs];
    const keys = [...S.pool.keys()];
    const mains = keys.filter((k) => ['glb', 'gltf'].includes(extOf(k)));
    let parsed = null;
    if (!keys.length) parsed = null;
    else if (mains.length === 0) errors.push('No .glb or .gltf file found yet.');
    else if (mains.length > 1) errors.push('More than one model file was added. Upload one model at a time (use Clear to start over).');
    else {
      const mainPath = mains[0], file = S.pool.get(mainPath), format = extOf(mainPath);
      parsed = { mainPath, format, json: null, refs: [] };
      if (format === 'glb') {
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (String.fromCharCode(...head) !== 'glTF') errors.push(`${baseOf(mainPath)} is not a valid GLB file.`);
      } else {
        try {
          parsed.json = JSON.parse(await file.text());
          if (!parsed.json.asset) throw new Error('no asset');
          const missing = [];
          [...(parsed.json.buffers || []), ...(parsed.json.images || [])].forEach((o) => {
            if (!o.uri || o.uri.startsWith('data:')) return;
            const rel = decodeURIComponent(o.uri);
            const full = normPath(dirOf(mainPath) ? `${dirOf(mainPath)}/${rel}` : rel);
            const k = lookup(full) || lookup(rel);
            if (k) parsed.refs.push({ uri: o.uri, key: k }); else missing.push(rel);
          });
          if (missing.length) errors.push(`The glTF needs these files too: ${[...new Set(missing)].join(', ')}. Add them (or upload a ZIP).`);
        } catch { errors.push(`${baseOf(mainPath)} is not a valid glTF file.`); }
      }
      parsed.errors = errors;
    }
    const total = [...S.pool.values()].reduce((a, f) => a + f.size, 0);
    S.parsed = parsed ? { ...parsed, ok: !errors.length, total } : { ok: false, total };

    $('#fileList').innerHTML = keys.map((k) => `<div><span>${esc(k)}</span><span>${fmtBytes(S.pool.get(k).size)}</span></div>`).join('') +
      (keys.length ? `<div><strong>Total</strong><strong>${fmtBytes(total)}</strong></div>` : '');
    $('#fileMsg').innerHTML = [...errors.map((e) => `<div class="notice err" style="margin-top:6px">${esc(e)}</div>`), ...warnings.map((w) => `<div class="notice warn" style="margin-top:6px">${esc(w)}</div>`),
      parsed && !errors.length ? '<div class="notice ok" style="margin-top:6px">File looks good — preview below.</div>' : ''].join('');
    if (S.parsed.ok) await mountPreviewLocal();
    else if (!S.editing || !S.editing.main_file) $('#pvWrap').hidden = true;
  }

  async function mountPreviewLocal() {
    const urls = new Map();
    for (const [k, f] of S.pool) { const u = URL.createObjectURL(f); blobUrls.push(u); urls.set(k, u); }
    const PFX = 'local-preview/';
    const modifier = (url) => {
      const i = url.indexOf(PFX);
      if (i < 0) return url;
      let rel; try { rel = decodeURIComponent(url.slice(i + PFX.length).split('?')[0]); } catch { return url; }
      const k = lookup(rel);
      return k ? urls.get(k) : url;
    };
    const { mountViewer } = await import('./viewer.js');
    $('#pvWrap').hidden = false;
    preview = mountViewer($('#pv'), { url: PFX + S.parsed.mainPath.split('/').map(encodeURIComponent).join('/'), urlModifier: modifier, expectedSize: S.parsed.total });
    $('#pvWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ----------------------------------------------------------- saving */
  function readForm() {
    const f = new FormData($('#mf'));
    const g = (k) => String(f.get(k) || '').trim();
    return {
      title: g('title'), category_slug: g('category_slug') || null, collection_slug: g('collection_slug') || null,
      model_type: g('model_type') || MODEL_TYPES[0], designer: g('designer'), shoe_size: g('shoe_size'),
      upload_date: g('upload_date') || today(), description: g('description'), materials: g('materials'),
      construction: g('construction'), specs: g('specs'),
      tags: g('tags').split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean).slice(0, 20),
      featured: f.has('featured'), staff_pick: f.has('staff_pick'),
    };
  }

  const setStatus = (html) => { $('#upStatus').innerHTML = html; };
  const setProg = (p) => { const bar = $('#prog'); bar.hidden = p == null; if (p != null) bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; };

  async function accessToken() {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('Your session expired. Please sign in again.');
    return data.session.access_token;
  }
  function uploadOne(path, blob, onProgress) {
    return new Promise(async (resolve, reject) => {
      let token; try { token = await accessToken(); } catch (e) { return reject(e); }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${CONFIG.SUPABASE_URL}/storage/v1/object/${CONFIG.BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', CONFIG.SUPABASE_ANON_KEY);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let m = ''; try { m = JSON.parse(xhr.responseText).message; } catch { /* ignore */ }
        reject(new Error(xhr.status === 413 ? `File too large for your Supabase plan (${m || '413'})` : `Upload failed (${xhr.status}) ${m || ''}`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload. Check your connection and try again.'));
      xhr.send(blob);
    });
  }

  function buildJobs(id, stamp) {
    const folder = `models/${id}/${stamp}`;
    const used = new Set(), safeOf = new Map();
    for (const k of S.pool.keys()) {
      let s = k.split('/').map(safeSeg).join('/'), n = 1;
      while (used.has(s.toLowerCase())) s = s.replace(/(\.[^./]*)?$/, `_${n++}$1`);
      used.add(s.toLowerCase());
      safeOf.set(k, s);
    }
    const { mainPath, format, json, refs } = S.parsed;
    const jobs = [];
    for (const [k, f] of S.pool) {
      if (k === mainPath && format === 'gltf') {
        const copy = JSON.parse(JSON.stringify(json));
        const safeDir = dirOf(safeOf.get(mainPath));
        const byUri = new Map(refs.map((r) => [r.uri, r.key]));
        [...(copy.buffers || []), ...(copy.images || [])].forEach((o) => {
          const key = o.uri && byUri.get(o.uri);
          if (key) o.uri = relPath(safeDir, safeOf.get(key)).split('/').map((s) => (s === '..' ? s : encodeURIComponent(s))).join('/');
        });
        jobs.push({ path: `${folder}/${safeOf.get(k)}`, blob: new Blob([JSON.stringify(copy)], { type: MIME.gltf }), model: true });
      } else jobs.push({ path: `${folder}/${safeOf.get(k)}`, blob: new Blob([f], { type: MIME[extOf(k)] || 'application/octet-stream' }), model: true });
    }
    return { jobs, folder, main: safeOf.get(mainPath), format };
  }

  async function save(status) {
    if (S.busy) return;
    const row = readForm();
    if (!row.title) return toast('Please enter a model name.', 'error');
    if (!row.category_slug) return toast('Please choose a category.', 'error');
    const replacing = S.pool.size > 0;
    if (replacing && !(S.parsed && S.parsed.ok)) return toast('Fix the file problems above first.', 'error');
    if (!replacing && !S.editing) return toast('Add a 3D model file first.', 'error');
    if (status === 'published' && !replacing && !(S.editing && S.editing.main_file)) return toast('A published exhibition needs a 3D file.', 'error');

    S.busy = true;
    $$('[data-save]').forEach((b) => (b.disabled = true));
    const old = S.editing;
    const id = old ? old.id : crypto.randomUUID();
    const stamp = Date.now().toString(36);
    const jobs = [];
    const uploaded = [];
    let modelInfo = null;
    try {
      if (replacing) { modelInfo = buildJobs(id, stamp); jobs.push(...modelInfo.jobs); }
      let thumbPath = null;
      if (S.thumbBlob) { thumbPath = `models/${id}/thumb-${stamp}.jpg`; jobs.push({ path: thumbPath, blob: new Blob([S.thumbBlob], { type: 'image/jpeg' }) }); }
      const total = jobs.reduce((a, j) => a + j.blob.size, 0) || 1;
      let done = 0;
      setStatus('<span class="muted">Uploading…</span>'); setProg(0);
      for (const j of jobs) {
        await uploadOne(j.path, j.blob, (loaded) => { setProg((done + loaded) / total); setStatus(`<span class="muted">Uploading… ${Math.round(((done + loaded) / total) * 100)}% (${fmtBytes(done + loaded)} of ${fmtBytes(total)})</span>`); });
        done += j.blob.size;
        uploaded.push(j.path);
      }
      setProg(1); setStatus('<span class="muted">Saving…</span>');

      const payload = { ...row, status };
      if (modelInfo) {
        payload.storage_folder = modelInfo.folder;
        payload.main_file = modelInfo.main;
        payload.model_format = modelInfo.format;
        payload.files = modelInfo.jobs.map((j) => j.path);
        payload.file_size = modelInfo.jobs.reduce((a, j) => a + j.blob.size, 0);
      }
      if (thumbPath) payload.thumb_path = thumbPath;
      if (status === 'published' && !(old && old.published_at)) payload.published_at = new Date().toISOString();

      let saved;
      if (old) {
        const r = await sb.from('models').update(payload).eq('id', id).select().single();
        if (r.error) throw r.error; saved = r.data;
      } else {
        const r = await sb.from('models').insert({ id, ...payload }).select().single();
        if (r.error) throw r.error; saved = r.data;
      }

      // remove superseded files (best effort)
      const stale = [];
      if (old && modelInfo) stale.push(...(old.files || []));
      if (old && thumbPath && old.thumb_path) stale.push(old.thumb_path);
      if (stale.length) sb.storage.from(CONFIG.BUCKET).remove(stale).then(() => {}, () => {});

      S.busy = false;
      toast(status === 'published' ? 'Exhibition published' : 'Draft saved', 'success');
      openForm(saved);
      showDone(saved);
    } catch (e) {
      console.error(e);
      if (uploaded.length) sb.storage.from(CONFIG.BUCKET).remove(uploaded).then(() => {}, () => {});
      S.busy = false;
      $$('[data-save]').forEach((b) => (b.disabled = false));
      setProg(null);
      setStatus(`<div class="notice err">${esc(e.message || 'Saving failed.')}</div>`);
      toast('Saving failed', 'error');
    }
  }

  function showDone(m) {
    const box = $('#doneBox');
    if (!box) return;
    box.innerHTML = `<div class="panel" style="margin-bottom:18px;border-color:#b5e0c6"><h3 style="color:var(--ok)">${m.status === 'published' ? 'Published — your QR code is ready' : 'Draft saved'}</h3>
      <p class="muted">Permanent address: <code>${esc(modelUrl(m.public_id))}</code></p><div id="doneQr"></div>
      <div class="btn-row" style="margin-top:12px"><a class="btn sm" target="_blank" rel="noopener" href="/models/${esc(m.public_id)}">Open public page</a></div></div>`;
    if (m.status === 'published') renderQrBlock($('#doneQr'), modelUrl(m.public_id), m.public_id);
    else $('#doneQr').innerHTML = '<div class="notice">Publish the exhibition to activate its QR code.</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --------------------------------------------------- row actions */
  async function toggleStatus(m) {
    const status = m.status === 'published' ? 'draft' : 'published';
    if (status === 'published' && !m.main_file) return toast('Add a 3D file before publishing.', 'error');
    const patch = { status };
    if (status === 'published' && !m.published_at) patch.published_at = new Date().toISOString();
    const { error } = await sb.from('models').update(patch).eq('id', m.id);
    if (error) return toast(error.message, 'error');
    toast(status === 'published' ? 'Published' : 'Unpublished', 'success');
    showTab('models');
  }

  async function removeModel(m) {
    if (!confirm(`Delete “${m.title}” permanently?\nIts QR code will stop working. This cannot be undone.`)) return;
    const paths = [...(m.files || []), ...(m.thumb_path ? [m.thumb_path] : [])];
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await sb.storage.from(CONFIG.BUCKET).remove(paths.slice(i, i + 100));
      if (error) return toast(`Could not delete files: ${error.message}`, 'error');
    }
    const { error } = await sb.from('models').delete().eq('id', m.id);
    if (error) return toast(error.message, 'error');
    toast('Exhibition deleted', 'success');
    showTab('models');
  }

  /* ----------------------------------------------------------- events */
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-tab]');
    if (!t) return;
    if (t.dataset.tab) return showTab(t.dataset.tab);
    if (t.dataset.save) return save(t.dataset.save);
    const act = t.dataset.act;
    const row = t.closest('.a-row');
    const m = row && S.models.find((x) => x.id === row.dataset.id);
    if (act === 'new') { if (!$('#aBody')) await dashboard(); openForm(null); }
    else if (act === 'back') showTab('models');
    else if (act === 'regen') {
      drawQr(+t.closest('[data-i]').dataset.i);
      toast('QR code regenerated — it still points to the same permanent address.', 'success');
    }
    else if (act === 'logout') { await sb.auth.signOut(); loginView(); }
    else if (act === 'edit' && m) openForm(m);
    else if (act === 'toggle' && m) toggleStatus(m);
    else if (act === 'delete' && m) removeModel(m);
    else if (act === 'qr' && m) {
      const slot = $('.qr-slot', row);
      slot.hidden = !slot.hidden;
      if (!slot.hidden) renderQrBlock(slot, modelUrl(m.public_id), m.public_id, { compact: true });
    } else if (act === 'clearfiles') { S.pool = new Map(); await validatePool(); if (!S.editing) $('#pvWrap').hidden = true; }
    else if (act === 'capture') {
      if (!preview) return toast('Load a 3D model first.', 'error');
      const b = await preview.captureThumb();
      if (b) { setThumb(b); toast('Thumbnail captured from the current view', 'success'); } else toast('The model is still loading.', 'error');
    }
  });

  /* -------------------------------------------------------------- boot */
  try {
    const adm = await currentAdmin();
    if (adm) await dashboard(); else loginView();
  } catch (e) {
    view.innerHTML = `<div class="notice err">${esc(e.message)}</div>`;
  }
  return cleanupAll;
}
