-- ============================================================
--  Nós Dois — jarro de atividades
--  Correr no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

create table if not exists public.jar_items (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  status     text not null default 'jar' check (status in ('jar', 'drawn', 'done')),
  drawn_at   timestamptz,
  done_at    timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.jar_items enable row level security;

drop policy if exists "membros tudo" on public.jar_items;
create policy "membros tudo" on public.jar_items
  for all using (public.is_member()) with check (public.is_member());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jar_items'
  ) then
    alter publication supabase_realtime add table public.jar_items;
  end if;
end $$;
