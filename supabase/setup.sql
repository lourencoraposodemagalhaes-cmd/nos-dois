-- ============================================================
--  Nós Dois — instalação completa numa base de dados nova
--  Correr UMA vez: Supabase → SQL Editor → New query → colar → Run
--  Depois guardar no Vault (ver README):
--    select vault.create_secret('<segredo>', 'notify_secret');
--    select vault.create_secret('https://<projeto>.supabase.co/functions/v1/notify', 'notify_url');
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


-- ==================== NOTIFICAÇÕES ====================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- Subscrições (um registo por iPhone) ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "cada um gere as suas subscricoes" on public.push_subscriptions;
create policy "cada um gere as suas subscricoes" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- ---------- Registo do que já foi enviado (evita repetidos) ----------
create table if not exists public.push_log (
  key        text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security; -- só o servidor lhe mexe

-- ---------- Chamar a função "notify" ----------
create or replace function public.call_notify(body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
  fn_url text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'notify_url';
  if secret is null or fn_url is null then return; end if; -- ainda não configurado
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body    := body
  );
end;
$$;

revoke execute on function public.call_notify(jsonb) from public, anon, authenticated;

-- ---------- "Quando o outro mexe" ----------
create or replace function public.notify_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_notify(jsonb_build_object(
    'type',   'change',
    'table',  tg_table_name,
    'op',     tg_op,
    'actor',  coalesce(auth.uid(), new.created_by),
    'record', to_jsonb(new)
  ));
  return new;
end;
$$;

drop trigger if exists notify_event_insert on public.events;
create trigger notify_event_insert
  after insert on public.events
  for each row execute function public.notify_change();

drop trigger if exists notify_task_insert on public.tasks;
create trigger notify_task_insert
  after insert on public.tasks
  for each row execute function public.notify_change();

drop trigger if exists notify_task_reassign on public.tasks;
create trigger notify_task_reassign
  after update of person on public.tasks
  for each row when (old.person is distinct from new.person)
  execute function public.notify_change();

-- ---------- Relógio: de 10 em 10 minutos ----------
-- (resumo da manhã às 8:00, datas especiais e lembretes 30 min antes dos eventos)
select cron.unschedule('nos-dois-notify')
where exists (select 1 from cron.job where jobname = 'nos-dois-notify');

select cron.schedule(
  'nos-dois-notify',
  '*/10 * * * *',
  $$ select public.call_notify('{"type":"tick"}'::jsonb) $$
);


-- ==================== FOTO DO DIA ====================

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
