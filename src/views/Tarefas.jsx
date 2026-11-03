import { useState } from 'preact/hooks';
import { useTable, insert, update, remove, myId } from '../lib/store.js';
import { today, friendly, nextDue } from '../lib/dates.js';
import { Icon, PageHeader, PersonPicker, Sheet, Field, Fab, Empty, usePeople, personLabel, itemColor } from '../ui.jsx';

const RECUR = { none: 'Não repete', daily: 'Todos os dias', weekly: 'Todas as semanas', monthly: 'Todos os meses' };

export const sortTasks = (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at);

/** Concluir: tarefas recorrentes passam para a próxima data em vez de ficarem feitas. */
export function toggleTask(task) {
  if (!task.done && task.recurrence !== 'none') {
    update('tasks', task.id, { due_date: nextDue(task) });
    return;
  }
  update('tasks', task.id, task.done
    ? { done: false, done_at: null, done_by: null }
    : { done: true, done_at: new Date().toISOString(), done_by: myId() });
}

export function Tarefas() {
  const tasks = useTable('tasks');
  const people = usePeople();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const match = (t) => {
    if (filter === 'all') return true;
    if (filter.startsWith('kid:')) return t.kid_id === filter.slice(4);
    const who = filter === 'me' ? myId() : people.partner?.id;
    return t.person === who || (!t.person && !t.kid_id);
  };
  const open = tasks.filter((t) => !t.done && match(t)).sort(sortTasks);
  const done = tasks.filter((t) => t.done && match(t)).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));

  return (
    <section>
      <PageHeader title="Tarefas" subtitle={`${open.length} por fazer`} />
      <div class="segmented wide">
        {[['all', 'Todas'], ['me', 'Minhas'], ['partner', people.partner ? `${people.partner.name}` : 'Parceiro(a)'],
          ...people.kids.map((k) => [`kid:${k.id}`, `${k.emoji ?? ''} ${k.name}`.trim()])].map(([k, l]) => (
          <button class={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {open.length === 0 && <Empty icon="check" title="Tudo feito!" text="Nada por fazer. Aproveitem 🎉" />}
      <div class="list">{open.map((t) => <TaskRow task={t} onOpen={() => setEditing(t)} />)}</div>

      {done.length > 0 && (
        <>
          <button class="link-btn" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Esconder' : 'Mostrar'} feitas ({done.length})
          </button>
          {showDone && (
            <div class="list">
              {done.map((t) => <TaskRow task={t} onOpen={() => setEditing(t)} />)}
              <button class="link-btn danger" onClick={() => confirm('Apagar todas as tarefas feitas?') && done.forEach((t) => remove('tasks', t.id))}>
                Apagar feitas
              </button>
            </div>
          )}
        </>
      )}

      <Fab label="Nova tarefa" onClick={() => setEditing({})} />
      {editing && <TaskSheet task={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function TaskRow({ task, onOpen }) {
  const people = usePeople();
  const late = !task.done && task.due_date && task.due_date < today();
  const color = itemColor(task, people);
  return (
    <div class={`card item task ${task.done ? 'done' : ''}`}>
      <button class="checkbox" style={{ '--c': color }} aria-label={task.done ? 'Marcar por fazer' : 'Marcar feita'}
        onClick={() => toggleTask(task)}>
        {task.done && <svg viewBox="0 0 24 24" width="16" height="16"><path d="m6 12 4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>}
      </button>
      <button class="grow text-btn" onClick={onOpen}>
        <strong>{task.title}</strong>
        <small>
          {personLabel(task.person, people, task.kid_id)}
          {task.due_date && <> · <span class={late ? 'late' : ''}>{friendly(task.due_date)}</span></>}
          {task.recurrence !== 'none' && <> · <span class="inline-ico"><Icon name="repeat" size={12} /></span></>}
        </small>
      </button>
    </div>
  );
}

function TaskSheet({ task, onClose }) {
  const isNew = !task.id;
  const [f, setF] = useState({ title: '', person: null, due_date: '', recurrence: 'none', ...task });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const row = {
      title: f.title.trim(), person: f.person, recurrence: f.recurrence,
      due_date: f.due_date || (f.recurrence !== 'none' ? today() : null),
    };
    if (f.kid_id || task.kid_id) row.kid_id = f.kid_id ?? null;
    isNew ? insert('tasks', { ...row, done: false }) : update('tasks', task.id, row);
    onClose();
  };

  return (
    <Sheet title={isNew ? 'Nova tarefa' : 'Tarefa'} onClose={onClose}
      onDelete={!isNew && (() => remove('tasks', task.id))}>
      <form onSubmit={save} class="form">
        <input class="big-input" placeholder="O que há para fazer?" value={f.title} onInput={set('title')} autofocus={isNew} />
        <Field label="Quem"><PersonPicker value={f.person} kid={f.kid_id} onChange={(person, kid_id) => setF({ ...f, person, kid_id })} /></Field>
        <Field label="Até quando"><input type="date" value={f.due_date ?? ''} onInput={set('due_date')} /></Field>
        <Field label="Repetir">
          <select value={f.recurrence} onChange={set('recurrence')}>
            {Object.entries(RECUR).map(([k, l]) => <option value={k}>{l}</option>)}
          </select>
        </Field>
        <button class="btn primary" type="submit">{isNew ? 'Adicionar' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
}
