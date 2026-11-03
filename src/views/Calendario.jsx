import { useState } from 'preact/hooks';
import { useTable, insert, update, remove } from '../lib/store.js';
import { today, monthGrid, monthName, WEEK_SHORT, longDate, time, parse, nextOccurrence, eventDays, eventEnd, isMultiDay, rangeLabel } from '../lib/dates.js';
import { Icon, PageHeader, PersonDot, PersonPicker, Sheet, Field, Fab, Empty, usePeople, personLabel, itemColor } from '../ui.jsx';

// Eventos de vários dias primeiro, depois por hora.
export const sortEvents = (a, b) => (isMultiDay(b) - isMultiDay(a)) || (a.start_time ?? '').localeCompare(b.start_time ?? '');

/** Datas especiais que caem num certo dia (para mostrar no calendário). */
export function specialsOn(specials, iso) {
  return specials.filter((s) => (s.yearly ? s.date.slice(5) === iso.slice(5) && s.date <= iso : s.date === iso));
}

export function Calendario() {
  const events = useTable('events');
  const specials = useTable('special_dates');
  const [selected, setSelected] = useState(today());
  const [view, setView] = useState(() => { const d = parse(today()); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [editing, setEditing] = useState(null);

  const move = (n) => setView(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = parse(today()); setView({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today()); };

  const byDay = {};
  for (const e of events) for (const d of eventDays(e)) (byDay[d] ??= []).push(e);

  const dayEvents = (byDay[selected] ?? []).slice().sort(sortEvents);
  const daySpecials = specialsOn(specials, selected);

  return (
    <section>
      <PageHeader title={`${monthName(view.m)}`} subtitle={String(view.y)}
        right={
          <div class="row gap-s">
            <button class="pill" onClick={goToday}>Hoje</button>
            <button class="icon-btn" onClick={() => move(-1)} aria-label="Mês anterior"><Icon name="chevL" /></button>
            <button class="icon-btn" onClick={() => move(1)} aria-label="Mês seguinte"><Icon name="chevR" /></button>
          </div>
        } />

      <div class="card month">
        <div class="month-head">{WEEK_SHORT.map((d) => <span>{d}</span>)}</div>
        <div class="month-grid">
          {monthGrid(view.y, view.m).map((c) => {
            const evs = byDay[c.iso] ?? [];
            const sp = specialsOn(specials, c.iso).length > 0;
            return (
              <button key={c.iso}
                class={['day', !c.inMonth && 'out', c.iso === today() && 'today', c.iso === selected && 'sel'].filter(Boolean).join(' ')}
                onClick={() => setSelected(c.iso)}>
                <span class="num">{c.day}</span>
                <span class="marks">
                  {sp && <span class="heart-mark"><Icon name="heart" size={8} /></span>}
                  {evs.slice(0, 3).map((e) => <PersonDot person={e.person} kid={e.kid_id} size={5} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <h3 class="section-title">{longDate(selected)}</h3>
      {daySpecials.map((s) => {
        const o = nextOccurrence(s, selected);
        return (
          <div class="card item special-row">
            <span class="special-ico"><Icon name="heart" size={18} /></span>
            <div class="grow"><strong>{s.title}</strong>{o.years && <small>{o.years} anos</small>}</div>
          </div>
        );
      })}
      {dayEvents.length === 0 && daySpecials.length === 0 && (
        <Empty icon="calendar" title="Dia livre" text="Toca no + para adicionar um evento." />
      )}
      <div class="list">
        {dayEvents.map((e) => <EventRow event={e} day={selected} onClick={() => setEditing(e)} />)}
      </div>

      <Fab label="Novo evento" onClick={() => setEditing({ date: selected })} />
      {editing && <EventSheet event={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function EventRow({ event, onClick, showDate, day }) {
  const people = usePeople();
  const multi = isMultiDay(event);
  // Num evento de vários dias: hora de início no 1.º dia, hora de fim no último, "dia todo" no meio.
  let timeCol;
  if (multi && day && day !== event.date) {
    timeCol = day === eventEnd(event) && event.end_time
      ? <><small>até</small><b>{time(event.end_time)}</b></>
      : <small>dia todo</small>;
  } else if (event.start_time) {
    timeCol = <><b>{time(event.start_time)}</b>{event.end_time && !multi && <small>{time(event.end_time)}</small>}</>;
  } else {
    timeCol = <small>dia todo</small>;
  }
  const when = multi ? rangeLabel(event) : showDate;
  return (
    <button class="card item" onClick={onClick}>
      <div class="time-col">{timeCol}</div>
      <span class="bar" style={{ background: itemColor(event, people) }} />
      <div class="grow">
        <strong>{event.title}</strong>
        <small>{when ? `${when} · ` : ''}{personLabel(event.person, people, event.kid_id)}{event.notes ? ` · ${event.notes}` : ''}</small>
      </div>
    </button>
  );
}

export function EventSheet({ event, onClose }) {
  const isNew = !event.id;
  const [f, setF] = useState({
    title: '', date: today(), start_time: '', end_time: '', person: null, notes: '', ...event,
  });
  const [multi, setMulti] = useState(isMultiDay({ date: f.date, end_date: f.end_date }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const endDate = multi && f.end_date && f.end_date > f.date ? f.end_date : null;
    const row = {
      title: f.title.trim(), date: f.date, person: f.person,
      start_time: f.start_time || null, end_time: (f.end_time && (f.start_time || endDate)) || null, notes: f.notes?.trim() || null,
    };
    // Só envia end_date quando é preciso (compatível com bases de dados antigas).
    if (endDate || event.end_date) row.end_date = endDate;
    if (f.kid_id || event.kid_id) row.kid_id = f.kid_id ?? null;
    isNew ? insert('events', row) : update('events', event.id, row);
    onClose();
  };

  const toggleMulti = (on) => {
    setMulti(on);
    if (on && !(f.end_date > f.date)) {
      const d = parse(f.date); d.setDate(d.getDate() + 1);
      setF({ ...f, end_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    }
  };

  return (
    <Sheet title={isNew ? 'Novo evento' : 'Evento'} onClose={onClose}
      onDelete={!isNew && (() => remove('events', event.id))}>
      <form onSubmit={save} class="form">
        <input class="big-input" placeholder="O que é?" value={f.title} onInput={set('title')} autofocus={isNew} />
        <Field label="Quem"><PersonPicker value={f.person} kid={f.kid_id} onChange={(person, kid_id) => setF({ ...f, person, kid_id })} /></Field>
        <label class="switch-row">
          <span>Vários dias</span>
          <input type="checkbox" class="switch" checked={multi} onChange={(e) => toggleMulti(e.target.checked)} />
        </label>
        {multi ? (
          <>
            <div class="row gap">
              <Field label="De"><input type="date" required value={f.date} onInput={set('date')} /></Field>
              <Field label="Até"><input type="date" required min={f.date} value={f.end_date ?? ''} onInput={set('end_date')} /></Field>
            </div>
            <div class="row gap">
              <Field label="Hora de início"><input type="time" value={f.start_time ?? ''} onInput={set('start_time')} /></Field>
              <Field label="Hora de fim"><input type="time" value={f.end_time ?? ''} onInput={set('end_time')} /></Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Dia"><input type="date" required value={f.date} onInput={set('date')} /></Field>
            <div class="row gap">
              <Field label="Início"><input type="time" value={f.start_time ?? ''} onInput={set('start_time')} /></Field>
              <Field label="Fim"><input type="time" value={f.end_time ?? ''} onInput={set('end_time')} disabled={!f.start_time} /></Field>
            </div>
          </>
        )}
        <Field label="Notas"><textarea rows="2" value={f.notes ?? ''} onInput={set('notes')} placeholder="Opcional" /></Field>
        <button class="btn primary" type="submit">{isNew ? 'Adicionar' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
}
