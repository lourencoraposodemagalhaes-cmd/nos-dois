import { useState } from 'preact/hooks';
import { useTable, insert, update, remove } from '../lib/store.js';
import { nextOccurrence, shortDate, friendly, today } from '../lib/dates.js';
import { Icon, PageHeader, Sheet, Field, Fab, Empty } from '../ui.jsx';
import { NosSwitch } from './Jarro.jsx';

export const KINDS = {
  anniversary: { label: 'Aniversário de casal', icon: 'rings', noun: 'anos juntos' },
  birthday: { label: 'Aniversário', icon: 'cake', noun: 'anos' },
  other: { label: 'Outra data', icon: 'star', noun: 'anos' },
};

/** Datas especiais ordenadas pela próxima ocorrência. */
export function upcomingSpecials(specials) {
  return specials
    .map((s) => ({ ...s, next: nextOccurrence(s) }))
    .filter((s) => s.next.days >= 0)
    .sort((a, b) => a.next.days - b.next.days);
}

export function countdown(days) {
  if (days === 0) return 'É hoje! 🎉';
  if (days === 1) return 'Amanhã';
  return `Faltam ${days} dias`;
}

export function Datas() {
  const specials = useTable('special_dates');
  const [editing, setEditing] = useState(null);
  const list = upcomingSpecials(specials);
  const past = specials.filter((s) => !s.yearly && s.date < today());

  return (
    <section>
      <PageHeader title="Datas especiais" subtitle="Para não esquecer" />
      <NosSwitch current="datas" />
      {specials.length === 0 && <Empty icon="heart" title="Ainda sem datas" text="Aniversários, o dia em que se conheceram, viagens…" />}

      {list[0] && <Hero s={list[0]} onClick={() => setEditing(list[0])} />}

      <div class="list">
        {list.slice(1).map((s) => <SpecialRow s={s} onClick={() => setEditing(s)} />)}
        {past.map((s) => <SpecialRow s={{ ...s, next: { date: s.date, days: -1 } }} onClick={() => setEditing(s)} />)}
      </div>

      <Fab label="Nova data" onClick={() => setEditing({})} />
      {editing && <SpecialSheet s={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Hero({ s, onClick }) {
  const k = KINDS[s.kind] ?? KINDS.other;
  return (
    <button class="card hero" onClick={onClick}>
      <span class="hero-ico"><Icon name={k.icon} size={26} /></span>
      <span class="hero-days">{s.next.days === 0 ? '🎉' : s.next.days}</span>
      <span class="hero-unit">{s.next.days === 0 ? 'É hoje!' : s.next.days === 1 ? 'dia' : 'dias'}</span>
      <strong>{s.title}</strong>
      <small>{friendly(s.next.date)}{s.next.years ? ` · ${s.next.years} ${k.noun}` : ''}</small>
    </button>
  );
}

export function SpecialRow({ s, onClick }) {
  const k = KINDS[s.kind] ?? KINDS.other;
  return (
    <button class="card item" onClick={onClick}>
      <span class="special-ico"><Icon name={k.icon} size={18} /></span>
      <div class="grow">
        <strong>{s.title}</strong>
        <small>{shortDate(s.next.date)}{s.next.years ? ` · ${s.next.years} ${k.noun}` : ''}</small>
      </div>
      <span class="badge">{s.next.days < 0 ? 'passou' : s.next.days === 0 ? 'hoje' : `${s.next.days}d`}</span>
    </button>
  );
}

function SpecialSheet({ s, onClose }) {
  const isNew = !s.id;
  const [f, setF] = useState({ title: '', date: '', kind: 'anniversary', yearly: true, notes: '', ...s });
  const save = (e) => {
    e.preventDefault();
    if (!f.title.trim() || !f.date) return;
    const row = { title: f.title.trim(), date: f.date, kind: f.kind, yearly: f.yearly, notes: f.notes?.trim() || null };
    isNew ? insert('special_dates', row) : update('special_dates', s.id, row);
    onClose();
  };
  return (
    <Sheet title={isNew ? 'Nova data' : 'Data especial'} onClose={onClose}
      onDelete={!isNew && (() => remove('special_dates', s.id))}>
      <form onSubmit={save} class="form">
        <input class="big-input" placeholder="ex: O dia em que nos conhecemos" value={f.title}
          onInput={(e) => setF({ ...f, title: e.target.value })} autofocus={isNew} />
        <Field label="Tipo">
          <div class="segmented">
            {Object.entries(KINDS).map(([key, k]) => (
              <button type="button" class={f.kind === key ? 'on' : ''} onClick={() => setF({ ...f, kind: key })}>
                <Icon name={k.icon} size={16} /> {k.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </Field>
        <Field label={f.yearly ? 'Data original (ex: ano em que começou)' : 'Data'}>
          <input type="date" required value={f.date} onInput={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <label class="switch-row">
          <span>Repete todos os anos</span>
          <input type="checkbox" class="switch" checked={f.yearly} onChange={(e) => setF({ ...f, yearly: e.target.checked })} />
        </label>
        <Field label="Notas"><textarea rows="2" placeholder="Ideias de prenda, restaurante…" value={f.notes ?? ''}
          onInput={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button class="btn primary" type="submit">{isNew ? 'Adicionar' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
}
