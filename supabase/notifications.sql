-- ============================================================
--  Nós Dois — notificações
--  Correr no Supabase: SQL Editor → New query → colar → Run
--  (o segredo "notify_secret" é criado à parte, ver README)
-- ============================================================

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
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if secret is null then return; end if; -- ainda não configurado
  perform net.http_post(
    url     := 'https://mirfhmyfoemfiwabpsuj.supabase.co/functions/v1/notify',
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
