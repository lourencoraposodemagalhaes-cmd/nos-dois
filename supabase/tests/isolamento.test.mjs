// Teste de isolamento entre casas, num Postgres verdadeiro (PGlite) com um "Supabase" simulado.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

const SQL = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };

// ---------- "Supabase" simulado ----------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated; grant all on storage.objects, storage.buckets to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
  create publication supabase_realtime;
`);

// ---------- instalação "antiga" de um casal (como a do Lourenço) ----------
await db.exec(SQL('schema.sql'));
await db.exec(`
  create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade, endpoint text not null unique, p256dh text not null, auth text not null, created_at timestamptz not null default now());
  create table public.push_log (key text primary key, created_at timestamptz not null default now());
  create function public.notify_change() returns trigger language plpgsql as $$ begin return new; end $$;
`);
await db.exec(SQL('photos.sql'));

const L = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id, email) values ('${L}', 'lourenco@x.pt'), ('${B}', 'beatriz@x.pt')`);
await db.exec(`
  insert into public.events (title, date, created_by) values ('Jantar avó', '2026-11-03', '${L}');
  insert into public.photos (created_by, path, date) values ('${L}', '2026-11-03/${L}-1.jpg', '2026-11-03');
  insert into storage.objects (bucket_id, name) values ('photos', '2026-11-03/${L}-1.jpg');
  insert into public.daily_moments (date, at) values ('2026-11-03', now());
`);

// ---------- migração (2x para confirmar que pode repetir-se) ----------
await db.exec(SQL('multi.sql'));
await db.exec(SQL('multi.sql'));
console.log('Migração aplicada (2x) sem erros');

// ---------- utilitários ----------
async function as(user, fn) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const rows = async (q, p) => (await db.query(q, p)).rows;
const fails = async (q) => { try { await db.query(q); return false; } catch { return true; } };

// ---------- 1. o casal antigo continua com os seus dados ----------
console.log('\n1. Casal existente');
const hL = (await rows(`select household_id from public.profiles where id = '${L}'`))[0].household_id;
ok(hL && (await rows(`select household_id from public.profiles where id = '${B}'`))[0].household_id === hL, 'Lourenço e Beatriz ficaram na mesma casa');
await as(L, async () => {
  ok((await rows('select * from public.events')).length === 1, 'Lourenço continua a ver o seu evento');
  ok((await rows('select * from public.profiles')).length === 2, 'Lourenço vê o seu perfil e o da Beatriz');
  ok((await rows('select * from storage.objects')).length === 1, 'Lourenço continua a ver a foto antiga');
  ok((await rows('select * from public.daily_moments')).length === 1, 'O momento da foto antigo continua lá');
});

// ---------- 2. casal novo ----------
console.log('\n2. Casal novo (Guiga & Kiko) + intruso');
const G = '33333333-3333-3333-3333-333333333333', K = '44444444-4444-4444-4444-444444444444', X = '55555555-5555-5555-5555-555555555555';
await db.exec(`insert into auth.users (id, email) values ('${G}', 'guiga@x.pt'), ('${K}', 'kiko@x.pt'), ('${X}', 'intruso@x.pt')`);
await as(G, async () => {
  ok((await rows('select * from public.events')).length === 0, 'Guiga (sem casa) não vê eventos de ninguém');
  ok((await rows('select * from public.profiles')).length === 1, 'Guiga só vê o próprio perfil');
  ok((await rows('select * from public.households')).length === 0, 'Guiga não vê casas de ninguém');
  ok(await fails(`insert into public.events (title, date) values ('x', '2026-11-04')`), 'Sem casa não consegue criar eventos');
});
let code;
await as(G, async () => { code = (await rows(`select * from public.create_household('Guiga & Kiko')`))[0].invite_code; });
ok(/^[A-Z2-9]{8}$/.test(code), `Casa criada com código ${code}`);
await as(K, async () => { await rows(`select * from public.join_household('${code.toLowerCase().slice(0, 4)}-${code.slice(4)}')`); });
ok((await rows(`select household_id from public.profiles where id = '${K}'`))[0].household_id ===
   (await rows(`select household_id from public.profiles where id = '${G}'`))[0].household_id, 'Kiko entrou com o código (mesmo escrito em minúsculas e com hífen)');
await as(X, async () => {
  ok(await fails(`select * from public.join_household('${code}')`), 'Intruso NÃO entra com o mesmo código (casa já tem 2)');
  ok(await fails(`select * from public.join_household('AAAAAAAA')`), 'Código inventado é recusado');
});
await as(G, async () => { ok(await fails(`select * from public.join_household('${code}')`), 'Quem já tem casa não entra noutra'); });

// ---------- 3. isolamento ----------
console.log('\n3. Isolamento entre casas');
await as(G, async () => {
  await db.query(`insert into public.events (title, date) values ('Vacinas Jaime', '2026-11-05')`);
  const evs = await rows('select title from public.events');
  ok(evs.length === 1 && evs[0].title === 'Vacinas Jaime', 'Guiga só vê o evento da sua casa (não vê o "Jantar avó")');
  ok((await rows('select * from public.profiles')).length === 2, 'Guiga vê só Guiga + Kiko');
  ok((await rows('select * from storage.objects')).length === 0, 'Guiga não vê as fotos do Lourenço');
  ok((await rows('select * from public.photos')).length === 0, 'Guiga não vê os registos de fotos do Lourenço');
  ok((await rows('select * from public.daily_moments')).length === 0, 'Guiga não vê o momento da foto da outra casa');
  ok((await rows('select * from public.households')).length === 1, 'Guiga só vê a sua casa');
  ok(await fails(`insert into public.events (title, date, household_id) values ('hack', '2026-11-05', '${hL}')`), 'Não consegue criar eventos na casa do Lourenço');
  const upd = await db.query(`update public.events set title = 'hack' where household_id = '${hL}'`);
  ok(upd.affectedRows === 0, 'Não consegue alterar eventos do Lourenço (0 alterados)');
  const del = await db.query(`delete from public.events where household_id = '${hL}'`);
  ok(del.affectedRows === 0, 'Não consegue apagar eventos do Lourenço (0 apagados)');
  ok(await fails(`update public.events set household_id = '${hL}'`), 'Não consegue mudar um evento seu para outra casa');
  ok(await fails(`update public.profiles set household_id = '${hL}' where id = auth.uid()`), 'Não consegue mudar-se para a casa do Lourenço');
  ok(await fails(`insert into public.households (name, invite_code) values ('x', 'ZZZZZZZZ')`), 'Não consegue criar casas à mão');
  ok(await fails(`update public.households set invite_code = 'ZZZZZZZZ'`), 'Não consegue mudar o código de convite');
  ok(await fails(`insert into public.daily_moments (household_id, date, at) values ('${hL}', '2026-11-05', now())`), 'Não consegue mexer no momento da foto');
  ok(await fails(`insert into storage.objects (bucket_id, name) values ('photos', '${hL}/hack.jpg')`), 'Não consegue enviar fotos para a pasta do Lourenço');
  const myH = (await rows('select public.my_household() h'))[0].h;
  ok(!(await fails(`insert into storage.objects (bucket_id, name) values ('photos', '${myH}/foto.jpg')`)), 'Consegue enviar fotos para a sua pasta');
  ok(await fails(`select * from public.push_log`), 'Não consegue ler o registo interno de envios');
  await db.query(`update public.profiles set name = 'Guiga' where id = auth.uid()`);
  ok((await rows(`select name from public.profiles where id = auth.uid()`))[0].name === 'Guiga', 'Consegue mudar o próprio nome');
  const other = await db.query(`update public.profiles set name = 'hack' where id = '${K}'`);
  ok(other.affectedRows === 0, 'Não consegue mudar o nome do Kiko');
});
await as(L, async () => {
  const evs = await rows('select title from public.events');
  ok(evs.length === 1 && evs[0].title === 'Jantar avó', 'Lourenço não vê o evento da Guiga & Kiko');
  ok((await rows('select * from storage.objects')).length === 1, 'Lourenço não vê a foto da Guiga');
});

// ---------- 4. sem sessão ----------
console.log('\n4. Sem sessão (qualquer pessoa da internet)');
await as(null, async () => {
  for (const t of ['events', 'tasks', 'shopping_items', 'special_dates', 'jar_items', 'photos', 'kids', 'profiles', 'households', 'daily_moments']) {
    const r = await rows(`select * from public.${t}`).catch(() => []);
    ok(r.length === 0, `Sem sessão não vê nada em ${t}`);
  }
  ok((await rows('select * from storage.objects')).length === 0, 'Sem sessão não vê fotos');
  ok(await fails(`select * from public.create_household('x')`), 'Sem sessão não cria casas');
});

// ---------- 5. apagar conta ----------
console.log('\n5. Apagar conta');
await as(K, async () => { await db.query('select public.delete_my_account()'); });
ok((await rows(`select * from auth.users where id = '${K}'`)).length === 0, 'Conta do Kiko apagada');
ok((await rows(`select count(*)::int n from public.events where title = 'Vacinas Jaime'`))[0].n === 1, 'Dados da casa ficam (a Guiga ainda lá está)');
await as(G, async () => { await db.query('select public.delete_my_account()'); });
ok((await rows(`select count(*)::int n from public.events where title = 'Vacinas Jaime'`))[0].n === 0, 'Último a sair: os dados da casa são apagados');
ok((await rows(`select count(*)::int n from public.events where title = 'Jantar avó'`))[0].n === 1, 'Os dados do Lourenço não são tocados');

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
