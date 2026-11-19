-- ============================================================
--  Nós Dois — grupos de tarefas e repetição das datas especiais
--  Correr no Supabase: SQL Editor → New query → colar → Run
--  (pode correr-se mais do que uma vez; não mexe nas regras de acesso)
-- ============================================================

-- Tarefas: grupo opcional (ex: "Obras", "Casamento").
alter table public.tasks add column if not exists group_name text;

-- Datas especiais: não repete / diária / semanal / mensal / anual.
alter table public.special_dates add column if not exists recurrence text;
update public.special_dates
   set recurrence = case when yearly then 'yearly' else 'none' end
 where recurrence is null;
alter table public.special_dates alter column recurrence set default 'yearly';
alter table public.special_dates alter column recurrence set not null;
alter table public.special_dates drop constraint if exists special_dates_recurrence_check;
alter table public.special_dates add constraint special_dates_recurrence_check
  check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly'));
