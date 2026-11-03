-- ============================================================
--  Nós Dois — foto do dia (estilo BeReal) e recordações
--  Correr no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- ---------- Fotos ----------
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade, -- quem tirou
  kind       text not null default 'daily' check (kind in ('daily', 'memory')),
  date       date not null default (now() at time zone 'Europe/Lisbon')::date, -- dia a que pertence
  path       text not null,            -- caminho no Storage (bucket "photos")
  caption    text,
  late       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;
drop policy if exists "membros tudo" on public.photos;
create policy "membros tudo" on public.photos
  for all using (public.is_member()) with check (public.is_member());

-- ---------- Momento do dia (hora aleatória escolhida pelo servidor) ----------
create table if not exists public.daily_moments (
  date        date primary key,
  at          timestamptz not null,
  notified_at timestamptz
);

alter table public.daily_moments enable row level security;
drop policy if exists "membros leem" on public.daily_moments;
create policy "membros leem" on public.daily_moments
  for select using (public.is_member());

-- ---------- Ficheiros (privados, só para os dois) ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "nos dois fotos ler" on storage.objects;
create policy "nos dois fotos ler" on storage.objects
  for select using (bucket_id = 'photos' and public.is_member());

drop policy if exists "nos dois fotos enviar" on storage.objects;
create policy "nos dois fotos enviar" on storage.objects
  for insert with check (bucket_id = 'photos' and public.is_member());

drop policy if exists "nos dois fotos apagar" on storage.objects;
create policy "nos dois fotos apagar" on storage.objects
  for delete using (bucket_id = 'photos' and public.is_member());

-- ---------- Avisar o outro quando há foto nova ----------
drop trigger if exists notify_photo_insert on public.photos;
create trigger notify_photo_insert
  after insert on public.photos
  for each row execute function public.notify_change();

-- ---------- Tempo real ----------
do $$
declare t text;
begin
  foreach t in array array['photos', 'daily_moments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
