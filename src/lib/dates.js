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

/** Repetição de uma data especial ('none' | 'daily' | 'weekly' | 'monthly' | 'yearly'). */
export const recurrenceOf = (s) => s.recurrence ?? (s.yearly ? 'yearly' : 'none');

/** Data no mês/ano pedido, com o dia "colado" ao fim do mês (31 → 30, 29 fev → 28). */
function clampDay(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate();
  return toISO(new Date(year, month, Math.min(day, last)));
}

/**
 * Próxima ocorrência (>= from) de uma data especial e quanto tempo passou desde o início.
 * Devolve { date, days, count, unit } — ex.: count 14, unit 'meses' num "mêsversário".
 */
export function nextOccurrence(special, from = today()) {
  const rec = recurrenceOf(special);
  const start = special.date;
  if (rec === 'none' || start >= from) {
    return { date: start, days: daysBetween(from, start), count: null, unit: null, years: null };
  }
  const [y, m, d] = start.split('-').map(Number);
  let next, count, unit;
  if (rec === 'daily') {
    next = from; count = daysBetween(start, next); unit = count === 1 ? 'dia' : 'dias';
  } else if (rec === 'weekly') {
    const weeks = Math.ceil(daysBetween(start, from) / 7);
    next = addDays(start, weeks * 7); count = weeks; unit = weeks === 1 ? 'semana' : 'semanas';
  } else if (rec === 'monthly') {
    const f = parse(from);
    let months = (f.getFullYear() - y) * 12 + (f.getMonth() - (m - 1));
    next = clampDay(y, m - 1 + months, d);
    if (next < from) { months += 1; next = clampDay(y, m - 1 + months, d); }
    count = months; unit = months === 1 ? 'mês' : 'meses';
  } else { // yearly
    const fy = parse(from).getFullYear();
    next = clampDay(fy, m - 1, d);
    if (next < from) next = clampDay(fy + 1, m - 1, d);
    count = parse(next).getFullYear() - y; unit = count === 1 ? 'ano' : 'anos';
  }
  return {
    date: next, days: daysBetween(from, next),
    count: count > 0 ? count : null, unit,
    years: rec === 'yearly' && count > 0 ? count : null,
  };
}

/** A data especial calha neste dia? */
export const occursOn = (special, iso) => nextOccurrence(special, iso).date === iso;

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
