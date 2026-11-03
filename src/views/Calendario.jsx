import { useState } from 'preact/hooks';
import { useTable, insert, update, remove } from '../lib/store.js';
import { today, monthGrid, monthName, WEEK_SHORT, longDate, time, parse, nextOccurrence } from '../lib/dates.js';
import { Icon, PageHeader, PersonDot, PersonPicker, Sheet, Field, Fab, Empty, usePeople, personLabel } from '../ui.jsx';

export const sortEvents = (a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '');

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
  for (const e of events) (byDay[e.date] ??= []).push(e);

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
                  {evs.slice(0, 3).map((e) => <PersonDot person={e.person} size={5} />)}
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
        {dayEvents.map((e) => <EventRow event={e} onClick={() => setEditing(e)} />)}
      </div>

      <Fab label="Novo evento" onClick={() => setEditing({ date: selected })} />
      {editing && <EventSheet event={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function EventRow({ event, onClick, showDate }) {
  const people = usePeople();
  return (
    <button class="card item" onClick={onClick}>
      <div class="time-col">
        {event.start_time ? <><b>{time(event.start_time)}</b>{event.end_time && <small>{time(event.end_time)}</small>}</> : <small>dia todo</small>}
      </div>
      <span class="bar" style={{ background: people.byId(event.person)?.color ?? 'var(--both)' }} />
      <div class="grow">
        <strong>{event.title}</strong>
        <small>{showDate ? `${showDate} · ` : ''}{personLabel(event.person, people)}{event.notes ? ` · ${event.notes}` : ''}</small>
      </div>
    </button>
  );
}

export function EventSheet({ event, onClose }) {
  const isNew = !event.id;
  const [f, setF] = useState({
    title: '', date: today(), start_time: '', end_time: '', person: null, notes: '', ...event,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const row = {
      title: f.title.trim(), date: f.date, person: f.person,
      start_time: f.start_time || null, end_time: (f.start_time && f.end_time) || null, notes: f.notes?.trim() || null,
    };
    isNew ? insert('events', row) : update('events', event.id, row);
    onClose();
  };

  return (
    <Sheet title={isNew ? 'Novo evento' : 'Evento'} onClose={onClose}
      onDelete={!isNew && (() => remove('events', event.id))}>
      <form onSubmit={save} class="form">
        <input class="big-input" placeholder="O que é?" value={f.title} onInput={set('title')} autofocus={isNew} />
        <Field label="Quem"><PersonPicker value={f.person} onChange={(person) => setF({ ...f, person })} /></Field>
        <Field label="Dia"><input type="date" required value={f.date} onInput={set('date')} /></Field>
        <div class="row gap">
          <Field label="Início"><input type="time" value={f.start_time ?? ''} onInput={set('start_time')} /></Field>
          <Field label="Fim"><input type="time" value={f.end_time ?? ''} onInput={set('end_time')} disabled={!f.start_time} /></Field>
        </div>
        <Field label="Notas"><textarea rows="2" value={f.notes ?? ''} onInput={set('notes')} placeholder="Opcional" /></Field>
        <button class="btn primary" type="submit">{isNew ? 'Adicionar' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
}
