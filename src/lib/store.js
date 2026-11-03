// Camada de dados: um cache em memória de todas as tabelas, sincronizado
// com o Supabase em tempo real. Sem configuração, corre em "modo demo"
// guardando tudo no próprio telemóvel (localStorage).
import { useEffect, useState } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const DEMO = !URL || !KEY;
export const TABLES = ['profiles', 'events', 'tasks', 'shopping_items', 'special_dates'];

const supabase = DEMO ? null : createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ---------- estado + subscrições ----------
const state = Object.fromEntries(TABLES.map((t) => [t, []]));
let session = null;
let loaded = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

function setRows(table, rows) {
  state[table] = rows;
  if (DEMO) saveDemo();
  emit();
}

function upsertLocal(table, row) {
  const rows = state[table];
  const i = rows.findIndex((r) => r.id === row.id);
  setRows(table, i === -1 ? [...rows, row] : rows.map((r, j) => (j === i ? { ...r, ...row } : r)));
}

function removeLocal(table, id) {
  setRows(table, state[table].filter((r) => r.id !== id));
}

/** Hook: devolve as linhas de uma tabela e re-renderiza quando mudam. */
export function useTable(table) {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return state[table];
}

/** Hook: sessão atual e se os dados já carregaram. */
export function useSession() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return { session, loaded };
}

export const myId = () => session?.user?.id ?? null;

// ---------- escrita ----------
const uuid = () => crypto.randomUUID();

export async function insert(table, values) {
  const row = { id: uuid(), created_at: new Date().toISOString(), created_by: myId(), ...values };
  upsertLocal(table, row); // otimista: aparece logo
  if (DEMO) return row;
  const { error } = await supabase.from(table).insert(row);
  if (error) { removeLocal(table, row.id); report(error); }
  return row;
}

export async function update(table, id, patch) {
  const before = state[table].find((r) => r.id === id);
  upsertLocal(table, { id, ...patch });
  if (DEMO) return;
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) { if (before) upsertLocal(table, before); report(error); }
}

export async function remove(table, id) {
  const before = state[table].find((r) => r.id === id);
  removeLocal(table, id);
  if (DEMO) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { if (before) upsertLocal(table, before); report(error); }
}

export async function removeWhere(table, predicate) {
  const ids = state[table].filter(predicate).map((r) => r.id);
  if (!ids.length) return;
  const before = state[table];
  setRows(table, before.filter((r) => !ids.includes(r.id)));
  if (DEMO) return;
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) { setRows(table, before); report(error); }
}

let errorHandler = (e) => alert(e.message);
export const onError = (fn) => { errorHandler = fn; };
const report = (e) => { console.error(e); errorHandler(e); };

// ---------- autenticação ----------
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (DEMO) return;
  await supabase.auth.signOut();
}

// ---------- arranque ----------
let channel = null;

async function loadAll() {
  const results = await Promise.all(TABLES.map((t) => supabase.from(t).select('*')));
  results.forEach(({ data, error }, i) => {
    if (error) report(error);
    else state[TABLES[i]] = data;
  });
  loaded = true;
  emit();
}

function subscribe() {
  channel?.unsubscribe();
  channel = supabase.channel('casa');
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
      if (p.eventType === 'DELETE') removeLocal(table, p.old.id);
      else upsertLocal(table, p.new);
    });
  }
  channel.subscribe();
}

export function start() {
  if (DEMO) return startDemo();
  supabase.auth.onAuthStateChange((_event, s) => {
    const changedUser = s?.user?.id !== session?.user?.id;
    session = s;
    if (!s) { loaded = false; TABLES.forEach((t) => (state[t] = [])); channel?.unsubscribe(); emit(); return; }
    emit();
    if (changedUser) { loadAll(); subscribe(); }
  });
  // Ao voltar à app (estava em segundo plano), volta a sincronizar tudo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session) loadAll();
  });
}

// ---------- modo demo ----------
const DEMO_KEY = 'nos-dois-demo-v1';

function saveDemo() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch { /* sem espaço / privado */ }
}

function startDemo() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { /* ignora */ }
  const data = saved ?? demoSeed();
  TABLES.forEach((t) => (state[t] = data[t] ?? []));
  session = { user: { id: state.profiles[0].id, email: 'demo@local' } };
  loaded = true;
  saveDemo();
  emit();
}

function demoSeed() {
  const a = 'demo-a', b = 'demo-b';
  const d = (offset) => {
    const x = new Date(); x.setDate(x.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };
  const r = (o) => ({ id: uuid(), created_at: new Date().toISOString(), ...o });
  return {
    profiles: [
      { id: a, name: 'Lourenço', color: '#3b82f6' },
      { id: b, name: 'Beatriz', color: '#f43f5e' },
    ],
    events: [
      r({ title: 'Jantar com os pais', date: d(0), start_time: '20:00', person: null }),
      r({ title: 'Dentista', date: d(2), start_time: '09:30', person: b }),
      r({ title: 'Futebol', date: d(3), start_time: '19:00', end_time: '20:30', person: a }),
    ],
    tasks: [
      r({ title: 'Pôr o lixo na rua', person: a, due_date: d(0), recurrence: 'weekly', done: false }),
      r({ title: 'Marcar revisão do carro', person: null, due_date: d(4), recurrence: 'none', done: false }),
      r({ title: 'Regar as plantas', person: b, due_date: d(1), recurrence: 'weekly', done: false }),
    ],
    shopping_items: [
      r({ name: 'Leite', quantity: '2', category: 'laticinios', checked: false }),
      r({ name: 'Bananas', category: 'fruta', checked: false }),
      r({ name: 'Pão', category: 'padaria', checked: false }),
      r({ name: 'Detergente', category: 'limpeza', checked: true }),
    ],
    special_dates: [
      r({ title: 'O nosso aniversário', date: '2019-' + d(12).slice(5), kind: 'anniversary', yearly: true }),
      r({ title: 'Aniversário da Beatriz', date: '1995-' + d(40).slice(5), kind: 'birthday', yearly: true }),
    ],
  };
}
