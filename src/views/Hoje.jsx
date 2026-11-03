import { useState, useEffect } from 'preact/hooks';
import { useTable, update, insert, remove, signOut, myId, DEMO, sendTestPush } from '../lib/store.js';
import { pushStatus, enablePush, disablePush } from '../lib/push.js';
import { today, addDays, longDate, friendly, eventCovers } from '../lib/dates.js';
import { Icon, PageHeader, Sheet, Field, usePeople } from '../ui.jsx';
import { EventRow, EventSheet, sortEvents, specialsOn } from './Calendario.jsx';
import { TaskRow, sortTasks } from './Tarefas.jsx';
import { upcomingSpecials, countdown, KINDS } from './Datas.jsx';
import { usePhotoPending } from './Foto.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite';
}

export function Hoje({ go }) {
  const events = useTable('events');
  const tasks = useTable('tasks');
  const items = useTable('shopping_items');
  const specials = useTable('special_dates');
  const jar = useTable('jar_items');
  const people = usePeople();
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(null);
  const photoPending = usePhotoPending();

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
        right={
          <div class="row">
            <button class="icon-btn has-dot" onClick={() => dispatchEvent(new Event('open-photo'))} aria-label="Foto do dia">
              <Icon name="camera" />{photoPending && <span class="red-dot" />}
            </button>
            <button class="icon-btn" onClick={() => setSettings(true)} aria-label="Definições"><Icon name="gear" /></button>
          </div>
        } />

      <PushBanner />

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
        <button class="card tile wide" onClick={() => go('jarro')}>
          <span class="tile-ico t-jar"><Icon name="jar" /></span>
          <div class="grow"><small>Jarro de atividades</small><strong>{jar.filter((j) => j.status === 'jar').length} papéis à espera</strong></div>
          <span class="badge strong">Tirar 🎲</span>
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
        <Field label="Notificações"><PushControls /></Field>
        <Family />
        {!DEMO && <button class="btn ghost" type="button" onClick={() => { signOut(); onClose(); }}>Terminar sessão</button>}
        {DEMO && <p class="hint">Modo demonstração: os dados ficam só neste dispositivo. Liga o Supabase para sincronizar entre os dois.</p>}
      </form>
    </Sheet>
  );
}

// ---------- notificações ----------
function usePushStatus() {
  const [status, setStatus] = useState(null);
  const refresh = () => pushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  useEffect(() => { refresh(); }, []);
  return [status, refresh];
}

/** Cartão no ecrã "Hoje" enquanto as notificações não estiverem ativas neste iPhone. */
function PushBanner() {
  const [status, refresh] = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('push-banner-hidden') === '1'; } catch { return false; } });
  if (status !== 'off' || hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem('push-banner-hidden', '1'); } catch { /* ignora */ } };
  const on = async () => {
    setBusy(true);
    try { await enablePush(); } catch (e) { alert(e.message); }
    setBusy(false); refresh();
  };
  return (
    <div class="card push-banner">
      <span class="tile-ico t-heart"><Icon name="bell" /></span>
      <div class="grow">
        <strong>Ativar notificações</strong>
        <small>Resumo às 8h, datas especiais e lembretes.</small>
      </div>
      <button class="pill accent" onClick={on} disabled={busy}>{busy ? '…' : 'Ativar'}</button>
      <button class="icon-btn" onClick={hide} aria-label="Agora não"><Icon name="x" size={18} /></button>
    </div>
  );
}

function PushControls() {
  const [status, refresh] = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { await fn(); } catch (e) { setMsg(e.message || 'Algo correu mal'); }
    setBusy(false); refresh();
  };
  if (status === null) return <p class="hint">A verificar…</p>;
  if (status === 'install') return <p class="hint">No iPhone, as notificações só funcionam com a app adicionada ao ecrã principal (Safari → Partilhar → Adicionar ao ecrã principal).</p>;
  if (status === 'unsupported') return <p class="hint">Este dispositivo não suporta notificações.</p>;
  if (status === 'denied') return <p class="hint">As notificações estão bloqueadas. Ativa-as nas definições do telemóvel → Notificações → {import.meta.env.VITE_APP_NAME}.</p>;
  return (
    <div class="form">
      {status === 'on' ? (
        <>
          <p class="hint">✅ Ativas neste dispositivo: resumo às 8h, datas especiais, lembretes 30 min antes dos eventos e avisos quando o outro adiciona algo.</p>
          <button type="button" class="btn ghost" disabled={busy} onClick={() => run(async () => {
            const r = await sendTestPush();
            setMsg(r?.sent ? 'Enviada! Deve chegar dentro de segundos.' : 'Não foi enviada nenhuma notificação.');
          })}>Enviar notificação de teste</button>
          <button type="button" class="link-btn danger" disabled={busy} onClick={() => run(disablePush)}>Desativar neste dispositivo</button>
        </>
      ) : (
        <button type="button" class="btn ghost" disabled={busy} onClick={() => run(enablePush)}>🔔 Ativar notificações</button>
      )}
      {msg && <p class="hint">{msg}</p>}
    </div>
  );
}

// ---------- família (bebés, filhos, animais: sem conta própria) ----------
const KID_EMOJI = ['👶', '🧒', '👧', '👦', '🐶', '🐱'];

function Family() {
  const { kids } = usePeople();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👶');
  if (!kids.length && !import.meta.env.VITE_KIDS) return null;
  const add = () => {
    if (!name.trim()) return;
    insert('kids', { name: name.trim(), emoji, color: COLORS[(kids.length + 3) % COLORS.length] });
    setName('');
  };
  return (
    <Field label="Família">
      <div class="form">
        {kids.map((k) => (
          <div class="kid-row">
            <span class="dot" style={{ width: '12px', height: '12px', background: k.color }} />
            <span class="grow">{k.emoji} {k.name}</span>
            <button type="button" class="icon-btn danger" aria-label={`Remover ${k.name}`}
              onClick={() => confirm(`Remover ${k.name}? Os eventos e tarefas ficam, mas passam a ser "dos dois".`) && remove('kids', k.id)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
        <div class="row gap-s">
          <select value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: '76px', flex: 'none' }} aria-label="Emoji">
            {KID_EMOJI.map((e) => <option value={e}>{e}</option>)}
          </select>
          <input placeholder="Nome (ex: Jaime)" value={name} onInput={(e) => setName(e.target.value)} />
          <button type="button" class="btn primary sm" onClick={add} aria-label="Adicionar"><Icon name="plus" /></button>
        </div>
      </div>
    </Field>
  );
}
