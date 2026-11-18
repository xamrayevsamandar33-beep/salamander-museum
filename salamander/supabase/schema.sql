-- Salamander Digital Museum — Supabase schema
-- Run this whole file once in: Supabase Dashboard > SQL Editor > New query

create extension if not exists pgcrypto;

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Categories ----------
create table if not exists public.categories (
  slug text primary key,
  name text not null,
  description text not null default '',
  sort int not null default 0
);

insert into public.categories (slug, name, description, sort) values
  ('running-shoes',       'Running Shoes',        'Performance footwear engineered for speed and comfort.', 1),
  ('sneakers',            'Sneakers',             'Everyday and lifestyle sneakers.', 2),
  ('oxford-shoes',        'Oxford Shoes',         'Classic closed-lacing dress shoes.', 3),
  ('formal-shoes',        'Formal Shoes',         'Elegant footwear for formal occasions.', 4),
  ('boots',               'Boots',                'Work, hiking and fashion boots.', 5),
  ('historical-footwear', 'Historical Footwear',  'Footwear from past eras and cultures.', 6),
  ('shoe-construction',   'Shoe Construction',    'Anatomy, lasts, soles and assembly methods.', 7),
  ('experimental-designs','Experimental Designs', 'Prototypes and future footwear concepts.', 8)
on conflict (slug) do nothing;

-- ---------- Collections ----------
create table if not exists public.collections (
  slug text primary key,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Models ----------
create sequence if not exists public.model_seq start 1;

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  public_id text unique,                       -- permanent URL id, e.g. oxford-shoe-001
  title text not null,
  description text not null default '',
  category_slug text references public.categories(slug) on update cascade on delete set null,
  collection_slug text references public.collections(slug) on update cascade on delete set null,
  model_type text not null default 'Footwear design',
  designer text not null default '',
  shoe_size text not null default '',
  materials text not null default '',
  construction text not null default '',
  specs text not null default '',
  tags text[] not null default '{}',
  upload_date date not null default current_date,
  storage_folder text,                          -- e.g. models/<uuid>
  main_file text,                               -- e.g. shoe.glb  or  scene.gltf
  model_format text,                            -- glb | gltf
  files text[] not null default '{}',           -- every storage path of the 3D model (for clean deletion)
  thumb_path text,
  file_size bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  featured boolean not null default false,
  staff_pick boolean not null default false,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists models_status_idx on public.models(status);
create index if not exists models_category_idx on public.models(category_slug);

-- Permanent public id: generated once on insert, can never change afterwards
-- (so QR codes stay valid even when the title is edited).
create or replace function public.models_before_write()
returns trigger language plpgsql as $$
declare base text;
begin
  if tg_op = 'INSERT' then
    if new.public_id is null or new.public_id = '' then
      base := trim(both '-' from regexp_replace(lower(coalesce(new.title,'model')), '[^a-z0-9]+', '-', 'g'));
      if base = '' then base := 'model'; end if;
      new.public_id := left(base, 40) || '-' || lpad(nextval('public.model_seq')::text, 3, '0');
    end if;
  else
    new.public_id := old.public_id;
    new.id := old.id;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists models_before_write on public.models;
create trigger models_before_write before insert or update on public.models
  for each row execute function public.models_before_write();

-- Safe view counter for public visitors
create or replace function public.increment_views(pid text)
returns void language sql security definer set search_path = public as $$
  update public.models set views = views + 1 where public_id = pid and status = 'published';
$$;
grant execute on function public.increment_views(text) to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.admins      enable row level security;
alter table public.categories  enable row level security;
alter table public.collections enable row level security;
alter table public.models      enable row level security;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists collections_read on public.collections;
create policy collections_read on public.collections for select using (true);
drop policy if exists collections_admin on public.collections;
create policy collections_admin on public.collections for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Visitors: published only. Admins: everything.
drop policy if exists models_public_read on public.models;
create policy models_public_read on public.models for select using (status = 'published' or public.is_admin());
drop policy if exists models_admin_insert on public.models;
create policy models_admin_insert on public.models for insert to authenticated with check (public.is_admin());
drop policy if exists models_admin_update on public.models;
create policy models_admin_update on public.models for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists models_admin_delete on public.models;
create policy models_admin_delete on public.models for delete to authenticated using (public.is_admin());

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('museum', 'museum', true)
on conflict (id) do update set public = true;

drop policy if exists museum_public_read on storage.objects;
create policy museum_public_read on storage.objects for select using (bucket_id = 'museum');
drop policy if exists museum_admin_insert on storage.objects;
create policy museum_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'museum' and public.is_admin());
drop policy if exists museum_admin_update on storage.objects;
create policy museum_admin_update on storage.objects for update to authenticated using (bucket_id = 'museum' and public.is_admin());
drop policy if exists museum_admin_delete on storage.objects;
create policy museum_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'museum' and public.is_admin());

-- ---------- After creating your admin user in Authentication > Users, run: ----------
-- insert into public.admins (user_id) select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
