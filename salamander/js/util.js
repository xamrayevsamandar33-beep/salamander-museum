import qrcode from 'qrcode-generator';
import { CONFIG } from '../config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---------- toast ---------- */
export function toast(msg, type = 'info', ms = 3800) {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ---------- permanent public URLs (used by QR codes) ---------- */
export function siteUrl() {
  return (CONFIG.SITE_URL || location.origin).replace(/\/+$/, '');
}

/** Returns a message if the site address cannot be used inside a QR code, else null. */
export function siteUrlProblem() {
  let u;
  try {
    u = new URL(siteUrl());
  } catch {
    return 'SITE_URL in config.js is not a valid address.';
  }
  const h = u.hostname;
  const local =
    h === 'localhost' || h === '0.0.0.0' || h === '[::1]' || h.endsWith('.local') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (u.protocol === 'file:' || local) {
    return 'This site is opened on a local address. QR codes are disabled until the site is deployed — then set SITE_URL in config.js to your real domain.';
  }
  return null;
}

export const modelUrl = (publicId) => `${siteUrl()}/models/${encodeURIComponent(publicId)}`;
export const categoryUrl = (slug) => `${siteUrl()}/category/${encodeURIComponent(slug)}`;
export const homeUrl = () => `${siteUrl()}/`;

/* ---------- QR code ---------- */
function makeQr(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q;
}

export function qrSvg(text, { margin = 4, dark = '#111111', light = '#ffffff' } = {}) {
  const q = makeQr(text);
  const n = q.getModuleCount();
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (q.isDark(r, c)) {
        let run = 1;
        while (c + run < n && q.isDark(r, c + run)) run++;
        d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
        c += run;
      } else c++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="512" height="512" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

export function qrPngBlob(text, px = 1024, margin = 4) {
  const q = makeQr(text);
  const n = q.getModuleCount();
  const total = n + margin * 2;
  const scale = Math.max(1, Math.floor(px / total));
  const c = document.createElement('canvas');
  c.width = c.height = total * scale;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111';
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (q.isDark(r, col)) g.fillRect((col + margin) * scale, (r + margin) * scale, scale, scale);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function downloadQr(text, name, kind) {
  if (kind === 'svg') downloadBlob(new Blob([qrSvg(text)], { type: 'image/svg+xml' }), `${name}.svg`);
  else downloadBlob(await qrPngBlob(text), `${name}.png`);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast('Link copied', 'success');
}

export async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  copyText(url);
}

/** Renders a QR block (preview + buttons) into `box`. */
export function renderQrBlock(box, url, fileName, { compact = false } = {}) {
  const problem = siteUrlProblem();
  if (problem) {
    box.innerHTML = `<div class="notice warn">${esc(problem)}</div>`;
    return;
  }
  box.innerHTML = `
    <div class="qr-block ${compact ? 'compact' : ''}">
      <div class="qr-img" role="img" aria-label="QR code for ${esc(url)}">${qrSvg(url)}</div>
      <div class="qr-side">
        <code class="qr-url">${esc(url)}</code>
        <div class="btn-row">
          <button class="btn sm" data-q="png">Download PNG</button>
          <button class="btn sm" data-q="svg">Download SVG</button>
          <button class="btn sm ghost" data-q="copy">Copy link</button>
          <button class="btn sm ghost" data-q="share">Share</button>
        </div>
      </div>
    </div>`;
  box.querySelector('.qr-block').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const k = b.dataset.q;
    if (k === 'png' || k === 'svg') downloadQr(url, fileName, k);
    else if (k === 'copy') copyText(url);
    else if (k === 'share') shareLink(url, fileName);
  });
}
