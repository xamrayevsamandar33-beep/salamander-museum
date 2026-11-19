update auth.users
set encrypted_password = crypt($$Samandar5654$$, gen_salt($$bf$$)),
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email = $$xamrayevsamandar33@gmail.com$$;

insert into public.admins (user_id)
select id from auth.users where email = $$xamrayevsamandar33@gmail.com$$
on conflict do nothing;

grant usage on schema public to anon, authenticated;
grant select on public.models, public.categories, public.collections to anon, authenticated;
grant insert, update, delete on public.models, public.categories, public.collections to authenticated;
grant select on public.admins to authenticated;
grant usage, select on sequence public.model_seq to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.increment_views(text) to anon, authenticated;
