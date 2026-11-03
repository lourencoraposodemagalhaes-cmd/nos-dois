// Nós Dois — widget com o resumo do dia (para a app Scriptable no iPhone).
//
// Como instalar:
//   1. Instalar a app "Scriptable" (grátis, App Store).
//   2. Scriptable → "+" → colar este código → dar o nome "Nós Dois".
//   3. Tocar em ▶︎ uma vez e iniciar sessão com o email e palavra-passe da app.
//   4. Ecrã principal → manter premido → "+" → Scriptable → escolher tamanho →
//      "Adicionar widget" → tocar no widget → Script: "Nós Dois".
//
// A sessão fica guardada no Porta-chaves do iPhone (Keychain), nunca no código.

const SUPABASE_URL = 'https://mirfhmyfoemfiwabpsuj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RAl4LSlgcN4cV-rk_6lNTw_nrN_la37';
const APP_URL = 'https://lourencoraposodemagalhaes-cmd.github.io/nos-dois/#hoje';
const KC = 'nos-dois-session';

// ---------- cores ----------
const C = {
  bg: Color.dynamic(new Color('#f6f3ef'), new Color('#1c1a18')),
  text: Color.dynamic(new Color('#1d1b19'), new Color('#f3efea')),
  muted: Color.dynamic(new Color('#8a837b'), new Color('#9b948c')),
  accent: Color.dynamic(new Color('#e2553f'), new Color('#f26b55')),
  both: new Color('#a855f7'),
};

// ---------- datas (hora do iPhone) ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const hhmm = (t) => (t ? t.slice(0, 5) : '');

function nextOccurrence(s, from) {
  if (!s.yearly) return { date: s.date, days: daysBetween(from, s.date) };
  const [y, m, d] = s.date.split('-').map(Number);
  const at = (year) => iso(new Date(year, m - 1, Math.min(d, new Date(year, m, 0).getDate())));
  let next = at(parse(from).getFullYear());
  if (next < from) next = at(parse(from).getFullYear() + 1);
  return { date: next, days: daysBetween(from, next), years: parse(next).getFullYear() - y };
}

// ---------- sessão ----------
async function authRequest(grant, body) {
  const r = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`);
  r.method = 'POST';
  r.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  r.body = JSON.stringify(body);
  const json = await r.loadJSON();
  if (!json.access_token) throw new Error(json.error_description || json.msg || 'Sessão inválida');
  const s = { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: json.expires_at, user_id: json.user.id };
  Keychain.set(KC, JSON.stringify(s));
  return s;
}

async function askLogin() {
  const a = new Alert();
  a.title = 'Nós Dois 💛';
  a.message = 'Entra com o email e a palavra-passe da app (só é preciso uma vez).';
  a.addTextField('Email');
  a.addSecureTextField('Palavra-passe');
  a.addAction('Entrar');
  a.addCancelAction('Cancelar');
  if ((await a.presentAlert()) === -1) return null;
  return authRequest('password', { email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) });
}

async function getSession() {
  let s = Keychain.contains(KC) ? JSON.parse(Keychain.get(KC)) : null;
  if (!s) return config.runsInWidget ? null : askLogin();
  if (s.expires_at * 1000 < Date.now() + 120000) {
    try { s = await authRequest('refresh_token', { refresh_token: s.refresh_token }); }
    catch (e) { Keychain.remove(KC); return config.runsInWidget ? null : askLogin(); }
  }
  return s;
}

async function rest(s, path) {
  const r = new Request(`${SUPABASE_URL}/rest/v1/${path}`);
  r.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` };
  const json = await r.loadJSON();
  if (!Array.isArray(json)) throw new Error(json.message || 'Erro ao ler dados');
  return json;
}

// ---------- dados ----------
async function loadData(s) {
  const t = iso(new Date());
  const [profiles, events, tasks, shopping, specials, moments, photos] = await Promise.all([
    rest(s, 'profiles?select=id,name,color'),
    rest(s, `events?select=*&date=lte.${addDays(t, 1)}&date=gte.${addDays(t, -60)}`),
    rest(s, `tasks?select=*&done=eq.false&due_date=lte.${t}`),
    rest(s, 'shopping_items?select=id&checked=eq.false'),
    rest(s, 'special_dates?select=*'),
    rest(s, `daily_moments?select=*&date=eq.${t}`).catch(() => []),
    rest(s, `photos?select=created_by&kind=eq.daily&date=eq.${t}`).catch(() => []),
  ]);
  const me = s.user_id;
  const mine = (x) => !x.person || x.person === me;
  const end = (e) => (e.end_date && e.end_date > e.date ? e.end_date : e.date);
  const covers = (e, d) => e.date <= d && d <= end(e);
  const byTime = (a, b) => (a.start_time || '').localeCompare(b.start_time || '');
  const color = (person) => {
    const p = profiles.find((x) => x.id === person);
    return p ? new Color(p.color) : C.both;
  };
  const next = specials.map((x) => ({ ...x, n: nextOccurrence(x, t) }))
    .filter((x) => x.n.days >= 0).sort((a, b) => a.n.days - b.n.days)[0];
  const moment = moments[0];
  return {
    today: t,
    name: profiles.find((p) => p.id === me)?.name,
    todayEvents: events.filter((e) => covers(e, t)).sort(byTime),
    tomorrowEvents: events.filter((e) => covers(e, addDays(t, 1))).sort(byTime),
    tasks: tasks.filter(mine).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    shopping: shopping.length,
    next,
    photoPending: !!moment && new Date(moment.at) <= new Date() && !photos.some((p) => p.created_by === me),
    color,
    isMultiDayMiddle: (e) => e.date !== t,
  };
}

// ---------- desenho ----------
function text(stack, str, { size = 13, weight = 'regular', color = C.text, lines = 1 } = {}) {
  const font = weight === 'bold' ? Font.boldSystemFont(size)
    : weight === 'semibold' ? Font.semiboldSystemFont(size)
      : weight === 'medium' ? Font.mediumSystemFont(size) : Font.systemFont(size);
  const t = stack.addText(str);
  t.font = font; t.textColor = color; t.lineLimit = lines;
  return t;
}

function eventLine(w, d, e, size) {
  const row = w.addStack();
  row.layoutHorizontally(); row.centerAlignContent();
  text(row, '●', { size: size - 3, color: d.color(e.person) });
  row.addSpacer(5);
  const when = e.start_time && !d.isMultiDayMiddle(e) ? hhmm(e.start_time) : 'dia todo';
  text(row, when, { size: size - 1, weight: 'semibold', color: C.muted });
  row.addSpacer(6);
  text(row, e.title, { size, weight: 'medium' });
}

function specialLabel(next) {
  if (!next) return null;
  const when = next.n.days === 0 ? 'é hoje! 🎉' : next.n.days === 1 ? 'amanhã' : `em ${next.n.days} dias`;
  return `💛 ${next.title} ${when}`;
}

function header(w, d, size) {
  const h = w.addStack();
  h.layoutHorizontally(); h.centerAlignContent();
  text(h, 'Nós Dois', { size, weight: 'bold', color: C.accent });
  h.addSpacer();
  const now = new Date();
  text(h, `${WEEK[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`, { size: size - 1, weight: 'semibold', color: C.muted });
}

function footer(w, d, size) {
  const parts = [];
  parts.push(`✅ ${d.tasks.length}`);
  parts.push(`🛒 ${d.shopping}`);
  const f = w.addStack();
  f.layoutHorizontally(); f.centerAlignContent();
  text(f, parts.join('   '), { size, weight: 'semibold' });
  const sp = specialLabel(d.next);
  if (sp) { f.addSpacer(10); text(f, sp, { size: size - 1, color: C.muted }); }
}

function buildSmall(w, d) {
  header(w, d, 12);
  w.addSpacer(6);
  if (d.photoPending) { text(w, '📸 Foto por tirar!', { size: 12, weight: 'semibold', color: C.accent }); w.addSpacer(4); }
  if (d.todayEvents.length) {
    d.todayEvents.slice(0, d.photoPending ? 2 : 3).forEach((e) => eventLine(w, d, e, 12));
  } else {
    text(w, 'Sem eventos hoje', { size: 12, color: C.muted });
  }
  w.addSpacer();
  text(w, `✅ ${d.tasks.length}   🛒 ${d.shopping}`, { size: 13, weight: 'semibold' });
  if (d.next) text(w, `💛 ${d.next.n.days === 0 ? 'hoje!' : `${d.next.n.days}d`} · ${d.next.title}`, { size: 11, color: C.muted });
}

function buildMedium(w, d, large) {
  header(w, d, 13);
  w.addSpacer(8);
  if (d.photoPending) {
    text(w, '📸 A foto do dia está por tirar!', { size: 13, weight: 'semibold', color: C.accent });
    w.addSpacer(6);
  }
  const max = large ? 6 : (d.photoPending ? 2 : 3);
  if (d.todayEvents.length) {
    d.todayEvents.slice(0, max).forEach((e, i) => { if (i) w.addSpacer(3); eventLine(w, d, e, 14); });
    if (d.todayEvents.length > max) text(w, `+${d.todayEvents.length - max} eventos`, { size: 11, color: C.muted });
  } else {
    text(w, 'Nada no calendário para hoje ✨', { size: 14, color: C.muted });
  }

  if (large) {
    if (d.tasks.length) {
      w.addSpacer(10);
      text(w, 'TAREFAS', { size: 11, weight: 'bold', color: C.muted });
      w.addSpacer(3);
      d.tasks.slice(0, 5).forEach((t) => {
        const late = t.due_date < d.today;
        text(w, `${late ? '⚠️' : '○'}  ${t.title}`, { size: 13, color: late ? C.accent : C.text });
      });
      if (d.tasks.length > 5) text(w, `+${d.tasks.length - 5} tarefas`, { size: 11, color: C.muted });
    }
    if (d.tomorrowEvents.length) {
      w.addSpacer(10);
      text(w, 'AMANHÃ', { size: 11, weight: 'bold', color: C.muted });
      w.addSpacer(3);
      d.tomorrowEvents.slice(0, 3).forEach((e) => eventLine(w, { ...d, isMultiDayMiddle: (x) => x.date !== addDays(d.today, 1) }, e, 13));
    }
  }
  w.addSpacer();
  footer(w, d, 13);
}

// ---------- ecrã bloqueado ----------
/** Próximo evento de hoje: o que ainda não começou, senão o primeiro do dia. */
function nextEvent(d) {
  const now = new Date();
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const timed = d.todayEvents.filter((e) => e.start_time && !d.isMultiDayMiddle(e));
  return timed.find((e) => hhmm(e.start_time) >= nowHM) || d.todayEvents.find((e) => !e.start_time || d.isMultiDayMiddle(e)) || null;
}
const eventShort = (d, e) => (e.start_time && !d.isMultiDayMiddle(e) ? `${hhmm(e.start_time)} ${e.title}` : e.title);

function buildRectangular(w, d) {
  w.setPadding(0, 0, 0, 0);
  const e = nextEvent(d);
  const first = d.photoPending ? '📸 Foto do dia por tirar' : e ? `📅 ${eventShort(d, e)}` : '📅 Nada para hoje';
  text(w, first, { size: 15, weight: 'semibold', color: Color.white() });
  text(w, `✅ ${d.tasks.length} ${d.tasks.length === 1 ? 'tarefa' : 'tarefas'}  ·  🛒 ${d.shopping}`, { size: 14, color: Color.white() });
  if (d.next) {
    const when = d.next.n.days === 0 ? 'hoje!' : d.next.n.days === 1 ? 'amanhã' : `${d.next.n.days} dias`;
    text(w, `💛 ${d.next.title} · ${when}`, { size: 14, color: Color.white() });
  } else if (d.photoPending && e) {
    text(w, `📅 ${eventShort(d, e)}`, { size: 14, color: Color.white() });
  }
}

function buildInline(w, d) {
  const e = nextEvent(d);
  text(w, d.photoPending ? '📸 Foto do dia por tirar' : e ? `📅 ${eventShort(d, e)}` : `✅ ${d.tasks.length}  🛒 ${d.shopping}`);
}

function buildCircular(w, d) {
  w.setPadding(0, 0, 0, 0);
  w.addSpacer();
  const top = w.addStack(); top.addSpacer(); text(top, d.photoPending ? '📸' : '✅', { size: 14 }); top.addSpacer();
  const mid = w.addStack(); mid.addSpacer(); text(mid, String(d.tasks.length), { size: 22, weight: 'bold', color: Color.white() }); mid.addSpacer();
  w.addSpacer();
}

function message(w, title, body) {
  if ((config.widgetFamily || '').startsWith('accessory')) { text(w, `Nós Dois: ${title}`, { size: 13, lines: 3 }); return; }
  text(w, 'Nós Dois', { size: 13, weight: 'bold', color: C.accent });
  w.addSpacer(6);
  text(w, title, { size: 14, weight: 'semibold', lines: 2 });
  w.addSpacer(4);
  text(w, body, { size: 12, color: C.muted, lines: 4 });
}

// ---------- arranque ----------
async function main() {
  // Aberto na app Scriptable: menu simples.
  if (!config.runsInWidget && Keychain.contains(KC)) {
    const a = new Alert();
    a.title = 'Nós Dois 💛';
    a.addAction('Pré-visualizar widget');
    a.addDestructiveAction('Terminar sessão');
    a.addCancelAction('Fechar');
    const i = await a.presentSheet();
    if (i === 1) { Keychain.remove(KC); return; }
    if (i === -1) return;
  }

  const family = config.widgetFamily || 'medium';
  const lock = family.startsWith('accessory'); // ecrã bloqueado: sem fundo, letras brancas
  const w = new ListWidget();
  if (!lock) w.backgroundColor = C.bg;
  w.setPadding(14, 16, 14, 16);
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);

  try {
    const s = await getSession();
    if (!s) {
      message(w, 'Falta iniciar sessão', 'Abre a app Scriptable e toca no script "Nós Dois" para entrar.');
    } else {
      const d = await loadData(s);
      if (family === 'accessoryRectangular') buildRectangular(w, d);
      else if (family === 'accessoryInline') buildInline(w, d);
      else if (family === 'accessoryCircular') buildCircular(w, d);
      else if (family === 'small') buildSmall(w, d);
      else buildMedium(w, d, family === 'large' || family === 'extraLarge');
    }
  } catch (e) {
    message(w, 'Não foi possível atualizar', String(e.message || e));
  }

  if (config.runsInWidget) Script.setWidget(w);
  else if (family === 'small') await w.presentSmall();
  else await w.presentMedium();
  Script.complete();
}

await main();
