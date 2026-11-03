-- ============================================================
--  Nós Dois — esquema da base de dados (Supabase / Postgres)
--  Correr uma vez no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- ---------- Perfis (só 2 pessoas) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#3b82f6',
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um utilizador é adicionado.
-- Recusa um terceiro utilizador: a casa é só para dois.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.profiles) >= 2 then
    raise exception 'Esta app é só para duas pessoas.';
  end if;
  insert into public.profiles (id, name, color)
  values (
    new.id,
    initcap(split_part(new.email, '@', 1)),
    case when (select count(*) from public.profiles) = 0 then '#3b82f6' else '#f43f5e' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Só membros da casa (quem tem perfil) podem ler/escrever.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- ---------- Calendário ----------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  date       date not null,
  start_time time,
  end_time   time,
  person     uuid references public.profiles (id) on delete set null, -- null = os dois
  notes      text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Tarefas ----------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  person     uuid references public.profiles (id) on delete set null, -- null = os dois
  due_date   date,
  recurrence text not null default 'none'
             check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  done       boolean not null default false,
  done_at    timestamptz,
  done_by    uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Lista de compras ----------
create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  quantity   text,
  category   text not null default 'outros',
  checked    boolean not null default false,
  checked_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Datas especiais ----------
create table if not exists public.special_dates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  date       date not null,
  kind       text not null default 'other'
             check (kind in ('birthday', 'anniversary', 'other')),
  yearly     boolean not null default true,
  notes      text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Segurança (Row Level Security) ----------
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.tasks          enable row level security;
alter table public.shopping_items enable row level security;
alter table public.special_dates  enable row level security;

drop policy if exists "membros leem perfis" on public.profiles;
create policy "membros leem perfis" on public.profiles
  for select using (public.is_member());

drop policy if exists "cada um edita o seu perfil" on public.profiles;
create policy "cada um edita o seu perfil" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['events', 'tasks', 'shopping_items', 'special_dates'] loop
    execute format('drop policy if exists "membros tudo" on public.%I', t);
    execute format(
      'create policy "membros tudo" on public.%I for all using (public.is_member()) with check (public.is_member())',
      t
    );
  end loop;
end $$;

-- ---------- Tempo real (sincronização instantânea) ----------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'events', 'tasks', 'shopping_items', 'special_dates'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Atualização: eventos de vários dias ----------
alter table public.events add column if not exists end_date date;

-- ---------- Jarro de atividades ----------
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
