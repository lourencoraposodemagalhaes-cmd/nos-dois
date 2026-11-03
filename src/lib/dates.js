// Utilitários de datas. Todas as datas são strings 'AAAA-MM-DD' em hora local.

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => toISO(new Date());

export function addDays(iso, n) {
  const d = parse(iso); d.setDate(d.getDate() + n); return toISO(d);
}

export function addMonths(iso, n) {
  const d = parse(iso);
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const WEEK_SHORT = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // começa à segunda

const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const monthName = (m) => cap(MONTHS[m]);

/** "hoje", "amanhã", "ontem", ou "quinta, 5 nov". */
export function friendly(iso) {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  const d = parse(iso);
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function longDate(iso) {
  const d = parse(iso);
  return cap(`${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`);
}

export const shortDate = (iso) => { const d = parse(iso); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };

export const time = (t) => (t ? t.slice(0, 5) : '');

/** Grelha do mês (6 semanas, começa à segunda). */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

/** Próxima ocorrência (>= hoje) de uma data especial, e quantos anos faz. */
export function nextOccurrence(special, from = today()) {
  if (!special.yearly) {
    return { date: special.date, days: daysBetween(from, special.date), years: null };
  }
  const [y, m, d] = special.date.split('-').map(Number);
  const fy = parse(from).getFullYear();
  const at = (year) => {
    // 29 fev em anos não bissextos → 28 fev
    const last = new Date(year, m, 0).getDate();
    return toISO(new Date(year, m - 1, Math.min(d, last)));
  };
  let next = at(fy);
  if (next < from) next = at(fy + 1);
  const years = parse(next).getFullYear() - y;
  return { date: next, days: daysBetween(from, next), years: years > 0 ? years : null };
}

/** Próxima data de uma tarefa recorrente. */
export function nextDue(task) {
  const base = task.due_date && task.due_date > today() ? task.due_date : (task.due_date ?? today());
  let next = base;
  const step = (iso) => task.recurrence === 'daily' ? addDays(iso, 1)
    : task.recurrence === 'weekly' ? addDays(iso, 7) : addMonths(iso, 1);
  do { next = step(next); } while (next <= today());
  return next;
}

// ---------- eventos de vários dias ----------
export const eventEnd = (e) => (e.end_date && e.end_date > e.date ? e.end_date : e.date);
export const isMultiDay = (e) => eventEnd(e) !== e.date;
export const eventCovers = (e, iso) => e.date <= iso && iso <= eventEnd(e);

/** Todos os dias que um evento ocupa (limitado a um ano, por segurança). */
export function eventDays(e) {
  const days = [];
  for (let d = e.date, i = 0; d <= eventEnd(e) && i < 366; d = addDays(d, 1), i++) days.push(d);
  return days;
}

/** "3–7 nov" ou "28 nov – 2 dez". */
export function rangeLabel(e) {
  const a = parse(e.date), b = parse(eventEnd(e));
  const m = (d) => MONTHS[d.getMonth()].slice(0, 3);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${m(b)}`;
  return `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`;
}
