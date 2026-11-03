-- ============================================================
--  Nós Dois — bebés / filhos / animais (sem conta própria)
--  Correr no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

create table if not exists public.kids (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  emoji      text default '👶',
  color      text not null default '#f59e0b',
  created_at timestamptz not null default now()
);

alter table public.kids enable row level security;
drop policy if exists "membros tudo" on public.kids;
create policy "membros tudo" on public.kids
  for all using (public.is_member()) with check (public.is_member());

alter table public.events add column if not exists kid_id uuid references public.kids (id) on delete set null;
alter table public.tasks  add column if not exists kid_id uuid references public.kids (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kids'
  ) then
    alter publication supabase_realtime add table public.kids;
  end if;
end $$;
