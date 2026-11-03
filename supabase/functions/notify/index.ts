// Nós Dois — envio de notificações (Supabase Edge Function "notify").
//
// Chamada de três formas:
//  - {type:"tick"}   pelo relógio (pg_cron) de 10 em 10 min → resumo da manhã,
//                    datas especiais, lembretes 30 min antes dos eventos e
//                    a "hora da foto do dia" (hora aleatória, estilo BeReal)
//  - {type:"change"} pelos triggers da base de dados → "a Beatriz adicionou…"
//  - {type:"test"}   pela app (com sessão iniciada) → notificação de teste
//
// Segredos necessários (Edge Functions → Secrets):
//   VAPID_KEYS     JSON com {publicKey, privateKey} em formato JWK
//   NOTIFY_SECRET  o mesmo valor guardado no Vault como "notify_secret"
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidos automaticamente.

import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const TZ = 'Europe/Lisbon';
const MORNING = 8 * 60; // 8:00
const APP_URL = 'https://lourencoraposodemagalhaes-cmd.github.io/nos-dois/';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const appServer = await webpush.ApplicationServer.new({
  contactInformation: APP_URL,
  vapidKeys: await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS')!)),
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------- utilitários ----------
type Row = Record<string, any>;
type Note = { title: string; body: string; url?: string; tag?: string };

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function lisbonNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}

const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const eventEnd = (e: Row) => (e.end_date && e.end_date > e.date ? e.end_date : e.date);

function friendly(date: string, today: string) {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  const d = parse(date);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function nextOccurrence(s: Row, from: string) {
  if (!s.yearly) return { date: s.date, days: daysBetween(from, s.date), years: null as number | null };
  const [y, m, d] = s.date.split('-').map(Number);
  const fy = Number(from.slice(0, 4));
  const at = (year: number) => {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return iso(new Date(Date.UTC(year, m - 1, Math.min(d, last))));
  };
  let next = at(fy);
  if (next < from) next = at(fy + 1);
  const years = Number(next.slice(0, 4)) - y;
  return { date: next, days: daysBetween(from, next), years: years > 0 ? years : null };
}

/** Para quem é: uma pessoa, ou os dois quando person é null. */
const forUser = (person: string | null, userId: string) => !person || person === userId;

/** Marca uma chave como enviada; devolve false se já tinha sido. */
async function once(key: string) {
  const { error } = await db.from('push_log').insert({ key });
  return !error;
}

async function send(userIds: string[], note: Note) {
  if (!userIds.length) return 0;
  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', userIds);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s: Row) => {
    try {
      await appServer.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(note), { ttl: 6 * 3600, urgency: webpush.Urgency.High });
      sent++;
    } catch (e) {
      const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push falhou', status, String(e));
    }
  }));
  return sent;
}

// ---------- foto do dia ----------
// Janela em que pode calhar a hora da foto (hora de Lisboa).
const PHOTO_WINDOW = { weekday: [9 * 60, 18 * 60], weekend: [11 * 60, 19 * 60] };

/** Converte "AAAA-MM-DD" + minutos (hora de Lisboa) num instante UTC. */
function lisbonToUtc(date: string, minutes: number) {
  const guess = new Date(`${date}T00:00:00Z`).getTime() + minutes * 60000;
  // Diferença entre Lisboa e UTC nesse momento (0 ou +60 min).
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(guess));
  const local = Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
  let offset = local - minutes; if (offset < -720) offset += 1440; if (offset > 720) offset -= 1440;
  return new Date(guess - offset * 60000);
}

async function photoMoment(today: string, people: Row[]) {
  let { data: moment } = await db.from('daily_moments').select('*').eq('date', today).maybeSingle();
  if (!moment) {
    const dow = parse(today).getUTCDay();
    const [a, b] = dow === 0 || dow === 6 ? PHOTO_WINDOW.weekend : PHOTO_WINDOW.weekday;
    const minutes = a + Math.floor(Math.random() * (b - a));
    await db.from('daily_moments').upsert({ date: today, at: lisbonToUtc(today, minutes).toISOString() },
      { onConflict: 'date', ignoreDuplicates: true });
    ({ data: moment } = await db.from('daily_moments').select('*').eq('date', today).maybeSingle());
  }
  if (!moment || moment.notified_at || new Date(moment.at) > new Date()) return;
  // Marca como avisado só se ainda não estava (evita avisos repetidos).
  const { data: claimed } = await db.from('daily_moments').update({ notified_at: new Date().toISOString() })
    .eq('date', today).is('notified_at', null).select();
  if (!claimed?.length) return;
  await send(people.map((p: Row) => p.id), {
    title: '📸 Hora da foto do dia!', body: 'Mostra ao outro o que estás a fazer agora mesmo.', url: '#hoje', tag: `photo-${today}`,
  });
}

// ---------- relógio ----------
async function tick() {
  const now = lisbonNow();
  const today = now.date;
  const [{ data: profiles }, { data: events }] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('events').select('*').lte('date', addDays(today, 1)).gte('date', addDays(today, -366)),
  ]);
  const people = profiles ?? [];

  await photoMoment(today, people);

  // Lembrete 30 min antes (no 1.º dia de cada evento com hora).
  for (const e of events ?? []) {
    if (e.date !== today || !e.start_time) continue;
    const diff = toMin(e.start_time) - now.minutes;
    if (diff <= 0 || diff > 30) continue;
    if (!(await once(`soon:${e.id}:${today}`))) continue;
    await send(people.filter((p: Row) => forUser(e.person, p.id)).map((p: Row) => p.id), {
      title: `⏰ ${e.title}`,
      body: `Daqui a ${diff} min (${hhmm(e.start_time)})${e.notes ? ` · ${e.notes}` : ''}`,
      url: '#calendario', tag: `soon-${e.id}`,
    });
  }

  // Resumo da manhã + datas especiais (uma vez por dia, a partir das 8:00).
  if (now.minutes < MORNING || now.minutes >= MORNING + 60) return;

  const [{ data: tasks }, { data: specials }] = await Promise.all([
    db.from('tasks').select('*').eq('done', false).lte('due_date', today),
    db.from('special_dates').select('*'),
  ]);

  for (const s of specials ?? []) {
    const o = nextOccurrence(s, today);
    if (![0, 1, 7].includes(o.days)) continue;
    if (!(await once(`special:${s.id}:${o.date}:${o.days}`))) continue;
    const extra = o.years ? ` (${o.years} ${s.kind === 'anniversary' ? 'anos juntos' : 'anos'})` : '';
    const note = o.days === 0
      ? { title: `🎉 Hoje: ${s.title}`, body: `É hoje!${extra}${s.notes ? ` · ${s.notes}` : ''}` }
      : o.days === 1
        ? { title: `💛 Amanhã: ${s.title}`, body: `Está tudo preparado?${extra}${s.notes ? ` · ${s.notes}` : ''}` }
        : { title: `🎁 Daqui a uma semana: ${s.title}`, body: `Ainda dá tempo para a prenda.${extra}${s.notes ? ` · ${s.notes}` : ''}` };
    await send(people.map((p: Row) => p.id), { ...note, url: '#datas', tag: `special-${s.id}` });
  }

  for (const p of people) {
    if (!(await once(`morning:${today}:${p.id}`))) continue;
    const evs = (events ?? [])
      .filter((e: Row) => e.date <= today && today <= eventEnd(e) && forUser(e.person, p.id))
      .sort((a: Row, b: Row) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    const ts = (tasks ?? []).filter((t: Row) => forUser(t.person, p.id));
    if (!evs.length && !ts.length) continue; // dia livre: não incomoda

    const lines: string[] = [];
    if (evs.length) {
      lines.push('📅 ' + evs.map((e: Row) =>
        e.start_time && e.date === today ? `${e.title} às ${hhmm(e.start_time)}` : e.title).join(', '));
    }
    if (ts.length) {
      const late = ts.filter((t: Row) => t.due_date < today).length;
      lines.push(`✅ ${ts.length} ${ts.length === 1 ? 'tarefa' : 'tarefas'}${late ? ` (${late} em atraso)` : ''}: `
        + ts.slice(0, 3).map((t: Row) => t.title).join(', ') + (ts.length > 3 ? '…' : ''));
    }
    await send([p.id], { title: `☀️ Bom dia, ${p.name}`, body: lines.join('\n'), url: '#hoje', tag: `morning-${today}` });
  }

  // Limpeza do registo (mais de 30 dias).
  await db.from('push_log').delete().lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
}

// ---------- "quando o outro mexe" ----------
async function change(msg: Row) {
  const r = msg.record as Row;
  const actorId = msg.actor as string | null;
  const { data: profiles } = await db.from('profiles').select('*');
  const actor = profiles?.find((p: Row) => p.id === actorId);
  const other = profiles?.find((p: Row) => p.id !== actorId);
  if (!actor || !other) return;
  if (r.person && r.person !== other.id) return; // é só de quem o criou

  const today = lisbonNow().date;
  // Bebé / filho (tabela opcional "kids").
  let kid: Row | null = null;
  if (r.kid_id) ({ data: kid } = await db.from('kids').select('*').eq('id', r.kid_id).maybeSingle());
  const kidLabel = kid ? `${kid.emoji ?? ''} ${kid.name}`.trim() : null;
  if (msg.table === 'events') {
    const when = friendly(r.date, today) + (r.end_date && r.end_date > r.date ? ` até ${friendly(r.end_date, today)}` : '')
      + (r.start_time ? `, ${hhmm(r.start_time)}` : '');
    await send([other.id], {
      title: `📅 ${actor.name} adicionou ${kidLabel ? `um evento: ${kidLabel}` : r.person ? 'um evento para ti' : 'um evento para os dois'}`,
      body: `${r.title} · ${when}`, url: '#calendario', tag: `event-${r.id}`,
    });
  } else if (msg.table === 'photos') {
    if (r.kind === 'daily') {
      const { data: theirs } = await db.from('photos').select('id')
        .eq('kind', 'daily').eq('date', r.date).eq('created_by', other.id).limit(1);
      await send([other.id], {
        title: `📸 ${actor.name} publicou a foto do dia`,
        body: theirs?.length ? 'Vem ver! 👀' : 'Publica a tua para a conseguires ver 👀',
        url: '#hoje', tag: `photo-${r.date}`,
      });
    } else {
      await send([other.id], { title: `🎞️ ${actor.name} juntou uma recordação ao álbum`, body: r.caption ?? '', url: '#fotos', tag: `memory-${r.id}` });
    }
  } else if (msg.table === 'tasks') {
    const due = r.due_date ? ` · até ${friendly(r.due_date, today)}` : '';
    await send([other.id], {
      title: kidLabel ? `✅ ${actor.name} adicionou uma tarefa: ${kidLabel}`
        : r.person ? `✅ ${actor.name} atribuiu-te uma tarefa` : `✅ ${actor.name} adicionou uma tarefa para os dois`,
      body: `${r.title}${due}`, url: '#tarefas', tag: `task-${r.id}`,
    });
  }
}

// ---------- entrada ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const msg = await req.json().catch(() => ({}));

    // Teste a partir da app: autenticado com a sessão do utilizador.
    if (msg.type === 'test') {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
      const { data } = await db.auth.getUser(token);
      if (!data.user) return json({ error: 'sem sessão' }, 401);
      const sent = await send([data.user.id], {
        title: '💛 Nós Dois', body: 'As notificações estão a funcionar!', url: '#hoje', tag: 'test',
      });
      return json({ sent });
    }

    // Restante: só o relógio e os triggers (com o segredo partilhado).
    if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) return json({ error: 'proibido' }, 403);
    if (msg.type === 'tick') await tick();
    else if (msg.type === 'change') await change(msg);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
