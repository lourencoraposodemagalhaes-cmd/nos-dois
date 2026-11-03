import { useState } from 'preact/hooks';
import { useTable, update, signOut, myId, DEMO } from '../lib/store.js';
import { today, addDays, longDate, friendly, eventCovers } from '../lib/dates.js';
import { Icon, PageHeader, Sheet, Field, usePeople } from '../ui.jsx';
import { EventRow, EventSheet, sortEvents, specialsOn } from './Calendario.jsx';
import { TaskRow, sortTasks } from './Tarefas.jsx';
import { upcomingSpecials, countdown, KINDS } from './Datas.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite';
}

export function Hoje({ go }) {
  const events = useTable('events');
  const tasks = useTable('tasks');
  const items = useTable('shopping_items');
  const specials = useTable('special_dates');
  const people = usePeople();
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(null);

  const t = today();
  const todayEvents = events.filter((e) => eventCovers(e, t)).sort(sortEvents);
  const soon = events.filter((e) => e.date > t && e.date <= addDays(t, 7))
    .sort((a, b) => a.date.localeCompare(b.date) || sortEvents(a, b)).slice(0, 4);
  const dueTasks = tasks.filter((x) => !x.done && x.due_date && x.due_date <= t).sort(sortTasks);
  const shopping = items.filter((i) => !i.checked).length;
  const next = upcomingSpecials(specials)[0];
  const todaySpecials = specialsOn(specials, t);

  return (
    <section>
      <PageHeader title={`${greeting()}${people.me ? `, ${people.me.name}` : ''}`} subtitle={longDate(t)}
        right={<button class="icon-btn" onClick={() => setSettings(true)} aria-label="Definições"><Icon name="gear" /></button>} />

      {todaySpecials.map((s) => (
        <div class="card celebrate"><Icon name={KINDS[s.kind]?.icon ?? 'heart'} size={22} /> Hoje é: <strong>{s.title}</strong></div>
      ))}

      <div class="tiles">
        <button class="card tile" onClick={() => go('tarefas')}>
          <span class="tile-ico t-tasks"><Icon name="check" /></span>
          <b>{dueTasks.length}</b><small>{dueTasks.length === 1 ? 'tarefa para hoje' : 'tarefas para hoje'}</small>
        </button>
        <button class="card tile" onClick={() => go('compras')}>
          <span class="tile-ico t-shop"><Icon name="cart" /></span>
          <b>{shopping}</b><small>{shopping === 1 ? 'item a comprar' : 'itens a comprar'}</small>
        </button>
        {next && (
          <button class="card tile wide" onClick={() => go('datas')}>
            <span class="tile-ico t-heart"><Icon name={KINDS[next.kind]?.icon ?? 'heart'} /></span>
            <div class="grow"><small>Próxima data especial</small><strong>{next.title}</strong></div>
            <span class="badge strong">{countdown(next.next.days)}</span>
          </button>
        )}
      </div>

      <h3 class="section-title">Hoje</h3>
      {todayEvents.length === 0
        ? <p class="muted pad">Nada no calendário para hoje.</p>
        : <div class="list">{todayEvents.map((e) => <EventRow event={e} day={t} onClick={() => setEditing(e)} />)}</div>}

      {dueTasks.length > 0 && (
        <>
          <h3 class="section-title">Tarefas</h3>
          <div class="list">{dueTasks.slice(0, 5).map((x) => <TaskRow task={x} onOpen={() => go('tarefas')} />)}</div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <h3 class="section-title">Próximos dias</h3>
          <div class="list">{soon.map((e) => <EventRow event={e} showDate={friendly(e.date)} onClick={() => setEditing(e)} />)}</div>
        </>
      )}

      {editing && <EventSheet event={editing} onClose={() => setEditing(null)} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </section>
  );
}

const COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function Settings({ onClose }) {
  const { me } = usePeople();
  const [name, setName] = useState(me?.name ?? '');
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  const save = (e) => {
    e.preventDefault();
    if (me && name.trim()) update('profiles', myId(), { name: name.trim(), color });
    onClose();
  };
  return (
    <Sheet title="Definições" onClose={onClose}>
      <form class="form" onSubmit={save}>
        <Field label="O meu nome"><input value={name} onInput={(e) => setName(e.target.value)} /></Field>
        <Field label="A minha cor">
          <div class="swatches">
            {COLORS.map((c) => (
              <button type="button" class={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }}
                aria-label={c} onClick={() => setColor(c)} />
            ))}
          </div>
        </Field>
        <button class="btn primary" type="submit">Guardar</button>
        {!DEMO && <button class="btn ghost" type="button" onClick={() => { signOut(); onClose(); }}>Terminar sessão</button>}
        {DEMO && <p class="hint">Modo demonstração: os dados ficam só neste dispositivo. Liga o Supabase para sincronizar entre os dois.</p>}
      </form>
    </Sheet>
  );
}
