import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';

export const configured =
  !!CONFIG.SUPABASE_URL && !!CONFIG.SUPABASE_ANON_KEY &&
  !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT') && !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-ANON');

export const sb = configured
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export const MODEL_TYPES = ['Footwear design', 'Shoe construction', 'Historical artefact', 'Educational exhibit', 'Experimental prototype'];

/** Public URL of a file in the storage bucket. */
export const fileUrl = (path) =>
  path
    ? `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${CONFIG.BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
    : '';

const CARD_COLS =
  'id,public_id,title,category_slug,thumb_path,designer,views,upload_date,published_at,created_at,featured,staff_pick,model_type,status';

const cleanTerm = (s) => String(s || '').replace(/[,()%*\\"'{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export async function listModels(o = {}) {
  let q = sb.from('models').select(CARD_COLS, { count: 'exact' }).eq('status', 'published');
  if (o.category) q = q.eq('category_slug', o.category);
  if (o.type) q = q.eq('model_type', o.type);
  if (o.collection) q = q.eq('collection_slug', o.collection);
  if (o.featured) q = q.eq('featured', true);
  if (o.staff) q = q.eq('staff_pick', true);
  if (o.exclude) q = q.neq('public_id', o.exclude);
  if (o.date) {
    const days = { week: 7, month: 30, year: 365 }[o.date];
    if (days) q = q.gte('published_at', new Date(Date.now() - days * 864e5).toISOString());
  }
  const t = cleanTerm(o.q);
  if (t) {
    let f = `title.ilike.%${t}%,description.ilike.%${t}%,designer.ilike.%${t}%,materials.ilike.%${t}%`;
    if (/^[a-z0-9-]+$/i.test(t)) f += `,tags.cs.{${t.toLowerCase()}}`;
    q = q.or(f);
  }
  const sort = o.sort || 'newest';
  if (sort === 'popular') q = q.order('views', { ascending: false }).order('published_at', { ascending: false });
  else if (sort === 'alpha') q = q.order('title', { ascending: true });
  else q = q.order('published_at', { ascending: false, nullsFirst: false });
  const from = o.offset || 0;
  q = q.range(from, from + (o.limit || 12) - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { items: data || [], total: count ?? 0 };
}

export async function getModel(publicId) {
  const { data, error } = await sb.from('models').select('*').eq('public_id', publicId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCategories() {
  const { data, error } = await sb.from('categories').select('*').order('sort');
  if (error) throw error;
  return data || [];
}

/** Newest thumbnail per category (used as the cover of the category cards). */
export async function categoryCovers() {
  const { data } = await sb
    .from('models')
    .select('category_slug,thumb_path')
    .eq('status', 'published')
    .not('thumb_path', 'is', null)
    .order('published_at', { ascending: false })
    .limit(80);
  const out = {};
  (data || []).forEach((r) => { if (r.category_slug && !out[r.category_slug]) out[r.category_slug] = r.thumb_path; });
  return out;
}

export async function getCollections(search = '') {
  let q = sb.from('collections').select('*').order('created_at', { ascending: false });
  const t = cleanTerm(search);
  if (t) q = q.or(`title.ilike.%${t}%,description.ilike.%${t}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getCollection(slug) {
  const { data, error } = await sb.from('collections').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

/** Count a view once per browser session. */
export function countView(publicId) {
  try {
    const k = 'viewed:' + publicId;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch { /* storage may be blocked — still count */ }
  sb.rpc('increment_views', { pid: publicId }).then(() => {}, () => {});
}

/* ---------- auth ---------- */
export async function currentAdmin() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const { data: row } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  return row ? session : null;
}
