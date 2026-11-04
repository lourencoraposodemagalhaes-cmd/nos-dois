-- ============================================================
--  Nós Dois — instalação completa numa base de dados nova (várias casas)
--  Correr UMA vez: Supabase → SQL Editor → New query → colar → Run
--  Depois guardar no Vault:
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


-- ==================== BEBÉS ====================

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


-- ==================== VÁRIAS CASAS ====================

-- ---------- Casas ----------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.households enable row level security;

alter table public.profiles add column if not exists household_id uuid references public.households (id) on delete set null;

-- A casa de quem está a pedir (ou null).
create or replace function public.my_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

-- Compatibilidade com regras antigas: "é membro" = tem casa.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_household() is not null;
$$;

-- ---------- Bebés / filhos (caso ainda não exista) ----------
create table if not exists public.kids (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  emoji      text default '👶',
  color      text not null default '#f59e0b',
  created_at timestamptz not null default now()
);
alter table public.kids enable row level security;
alter table public.events add column if not exists kid_id uuid references public.kids (id) on delete set null;
alter table public.tasks  add column if not exists kid_id uuid references public.kids (id) on delete set null;

-- ---------- Dados existentes: tudo passa para uma primeira casa ----------
do $$
declare
  h uuid;
begin
  if exists (select 1 from public.profiles where household_id is null) then
    -- Junta os perfis sem casa que já existiam (instalação de um só casal).
    if (select count(*) from public.profiles where household_id is null) <= 2
       and not exists (select 1 from public.households) then
      insert into public.households (name, invite_code)
      values ('A nossa casa', upper(substr(md5(random()::text), 1, 8)))
      returning id into h;
      update public.profiles set household_id = h where household_id is null;
    end if;
  end if;
end $$;

-- ---------- household_id em todas as tabelas de dados ----------
do $$
declare
  t text;
  h uuid := (select id from public.households order by created_at limit 1);
begin
  foreach t in array array['events', 'tasks', 'shopping_items', 'special_dates', 'jar_items', 'photos', 'kids', 'daily_moments'] loop
    execute format('alter table public.%I add column if not exists household_id uuid references public.households (id) on delete cascade', t);
    if h is not null then
      execute format('update public.%I set household_id = %L where household_id is null', t, h);
    else
      execute format('delete from public.%I where household_id is null', t); -- lixo sem dono
    end if;
    execute format('alter table public.%I alter column household_id set default public.my_household()', t);
    execute format('alter table public.%I alter column household_id set not null', t);
    execute format('create index if not exists %I on public.%I (household_id)', t || '_household_idx', t);
  end loop;
end $$;

-- O momento da foto passa a ser um por casa e por dia.
alter table public.daily_moments drop constraint if exists daily_moments_pkey;
alter table public.daily_moments add primary key (household_id, date);
alter table public.daily_moments alter column household_id drop default;

-- Impede mudar uma linha de casa (mesmo que alguém tente à mão).
create or replace function public.keep_household()
returns trigger
language plpgsql
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'Não é possível mudar a casa de um registo.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['events', 'tasks', 'shopping_items', 'special_dates', 'jar_items', 'photos', 'kids'] loop
    execute format('drop trigger if exists keep_household on public.%I', t);
    execute format('create trigger keep_household before update on public.%I for each row execute function public.keep_household()', t);
  end loop;
end $$;

-- ---------- Regras de acesso (RLS) ----------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['events', 'tasks', 'shopping_items', 'special_dates', 'jar_items', 'photos', 'kids', 'daily_moments'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;

  foreach t in array array['events', 'tasks', 'shopping_items', 'special_dates', 'jar_items', 'photos', 'kids'] loop
    execute format(
      'create policy "so a minha casa" on public.%I for all to authenticated
         using (household_id = public.my_household())
         with check (household_id = public.my_household())', t);
  end loop;
end $$;

-- Momento do dia: só leitura (é o servidor que o escreve).
create policy "so a minha casa" on public.daily_moments
  for select to authenticated using (household_id = public.my_household());

-- Casas: cada um vê só a sua; o nome pode ser mudado pelos membros.
drop policy if exists "a minha casa" on public.households;
create policy "a minha casa" on public.households
  for select to authenticated using (id = public.my_household());
drop policy if exists "mudar nome da casa" on public.households;
create policy "mudar nome da casa" on public.households
  for update to authenticated using (id = public.my_household()) with check (id = public.my_household());
revoke insert, delete on public.households from anon, authenticated;
revoke update on public.households from anon, authenticated;
grant update (name) on public.households to authenticated;

-- Perfis: vejo o meu e o do meu par; só mudo o meu nome e cor.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end $$;
create policy "eu e o meu par" on public.profiles
  for select to authenticated
  using (id = auth.uid() or (household_id is not null and household_id = public.my_household()));
create policy "so o meu perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (name, color) on public.profiles to authenticated;

-- Notificações: cada um só gere as suas subscrições.
alter table public.push_subscriptions enable row level security;
drop policy if exists "cada um gere as suas subscricoes" on public.push_subscriptions;
create policy "cada um gere as suas subscricoes" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ninguém de fora mexe no registo de envios.
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- ---------- Novos utilizadores: perfil sem casa (cria ou entra depois) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  palette text[] := array['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
begin
  insert into public.profiles (id, name, color)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(split_part(new.email, '@', 1))),
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  return new;
end;
$$;

-- ---------- Criar casa / entrar com código ----------
create or replace function public.new_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem 0/O/1/I para não confundir
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_household(house_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then raise exception 'Sem sessão.'; end if;
  if public.my_household() is not null then raise exception 'Já pertences a uma casa.'; end if;
  insert into public.households (name, invite_code, created_by)
  values (coalesce(nullif(trim(house_name), ''), 'A nossa casa'), public.new_invite_code(), auth.uid())
  returning * into h;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end;
$$;

create or replace function public.join_household(code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then raise exception 'Sem sessão.'; end if;
  if public.my_household() is not null then raise exception 'Já pertences a uma casa.'; end if;
  select * into h from public.households
  where invite_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'))
  for update;
  -- Mesma mensagem para "não existe" e "cheia": não dá pistas a quem tenta adivinhar.
  if h.id is null or (select count(*) from public.profiles where household_id = h.id) >= 2 then
    raise exception 'Código inválido.';
  end if;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end;
$$;

-- Apagar a conta (obrigatório nas lojas). Se a casa ficar vazia, apaga tudo dela.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h uuid := public.my_household();
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sem sessão.'; end if;
  delete from auth.users where id = me; -- apaga o perfil em cascata
  if h is not null and not exists (select 1 from public.profiles where household_id = h) then
    delete from public.households where id = h; -- apaga os dados da casa em cascata
  end if;
end;
$$;

revoke execute on function public.create_household(text) from anon, public;
revoke execute on function public.join_household(text) from anon, public;
revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Fotos (Storage): só a própria casa ----------
-- Fotos novas vão para "<casa>/..."; as antigas são reconhecidas pela tabela photos.
drop policy if exists "nos dois fotos ler" on storage.objects;
drop policy if exists "nos dois fotos enviar" on storage.objects;
drop policy if exists "nos dois fotos apagar" on storage.objects;
drop policy if exists "fotos da minha casa ler" on storage.objects;
drop policy if exists "fotos da minha casa enviar" on storage.objects;
drop policy if exists "fotos da minha casa apagar" on storage.objects;

create policy "fotos da minha casa ler" on storage.objects
  for select to authenticated using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = public.my_household()::text
      or exists (select 1 from public.photos p where p.path = name and p.household_id = public.my_household())
    )
  );
create policy "fotos da minha casa enviar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_household()::text
  );
create policy "fotos da minha casa apagar" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = public.my_household()::text
      or exists (select 1 from public.photos p where p.path = name and p.household_id = public.my_household())
    )
  );

-- ---------- Tempo real ----------
do $$
declare t text;
begin
  foreach t in array array['households', 'kids'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
