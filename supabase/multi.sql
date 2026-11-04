-- ============================================================
--  Nós Dois — várias casas (cada casal só vê os seus dados)
--  Correr no Supabase: SQL Editor → New query → colar → Run
--
--  Segurança:
--   • cada linha de cada tabela pertence a uma casa (household_id);
--   • as regras RLS só deixam ler/escrever linhas da casa de quem pede;
--   • ninguém muda o household_id de uma linha nem a sua própria casa;
--   • entrar numa casa só com código, e só enquanto lá estiver 1 pessoa;
--   • fotos: só se lê/apaga o que pertence à própria casa.
--  Pode correr-se mais do que uma vez sem estragar nada.
-- ============================================================

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
