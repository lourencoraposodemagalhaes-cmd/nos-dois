import { useState } from 'preact/hooks';
import { useTable, insert, update, remove, myId } from '../lib/store.js';
import { shortDate, toISO } from '../lib/dates.js';
import { Icon, PageHeader, Sheet, Empty, usePeople } from '../ui.jsx';

/** Alternar entre "Datas" e "Jarro" (partilham o separador "Nós"). */
export function NosSwitch({ current }) {
  return (
    <div class="segmented wide">
      <a href="#datas" class={current === 'datas' ? 'on' : ''}><Icon name="heart" size={16} /> Datas</a>
      <a href="#jarro" class={current === 'jarro' ? 'on' : ''}><Icon name="jar" size={16} /> Jarro</a>
    </div>
  );
}

// Posição "aleatória" mas estável de cada papel dentro do jarro.
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

function JarArt({ items, shaking }) {
  const people = usePeople();
  const shown = items.slice(0, 40);
  return (
    <svg class={`jar-art ${shaking ? 'shake' : ''}`} viewBox="0 0 200 220" aria-hidden="true">
      <rect x="62" y="8" width="76" height="20" rx="6" class="jar-lid" />
      <path class="jar-glass" d="M70 28h60v12c0 6 30 14 30 40v104c0 16-12 28-28 28H68c-16 0-28-12-28-28V80c0-26 30-34 30-40V28Z" />
      <clipPath id="jar-clip">
        <path d="M44 84c0-22 30-30 30-40h52c0 10 30 18 30 40v100c0 14-10 24-24 24H68c-14 0-24-10-24-24Z" />
      </clipPath>
      <g clip-path="url(#jar-clip)">
        {shown.map((it, i) => {
          const h = hash(it.id);
          const row = Math.floor(i / 6), col = i % 6;
          const x = 50 + col * 18 + (h % 9) - 4;
          const y = 190 - row * 14 - (h % 7);
          const rot = (h % 60) - 30;
          return (
            <rect x={x} y={y} width="22" height="11" rx="2"
              transform={`rotate(${rot} ${x + 11} ${y + 5})`}
              fill={people.byId(it.created_by)?.color ?? '#a855f7'} opacity="0.85" />
          );
        })}
      </g>
      <path class="jar-shine" d="M58 96c0-10 4-16 10-20" />
    </svg>
  );
}

export function Jarro() {
  const items = useTable('jar_items');
  const people = usePeople();
  const [text, setText] = useState('');
  const [shaking, setShaking] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [showMine, setShowMine] = useState(false);
  const [editing, setEditing] = useState(null);

  const inJar = items.filter((i) => i.status === 'jar');
  const drawn = items.filter((i) => i.status === 'drawn').sort((a, b) => (b.drawn_at ?? '').localeCompare(a.drawn_at ?? ''));
  const done = items.filter((i) => i.status === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
  const mine = inJar.filter((i) => i.created_by === myId());
  const theirs = inJar.length - mine.length;
  const author = (it) => (it.created_by === myId() ? 'ti' : people.byId(it.created_by)?.name ?? '—');

  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    insert('jar_items', { text: t[0].toUpperCase() + t.slice(1), status: 'jar' });
    setText('');
  };

  const draw = () => {
    if (!inJar.length || shaking) return;
    const pick = inJar[Math.floor(Math.random() * inJar.length)];
    navigator.vibrate?.(200);
    setShaking(true);
    setTimeout(() => {
      setShaking(false);
      update('jar_items', pick.id, { status: 'drawn', drawn_at: new Date().toISOString() });
      setRevealed(pick);
    }, 900);
  };

  const markDone = (it) => update('jar_items', it.id, { status: 'done', done_at: new Date().toISOString() });
  const putBack = (it) => update('jar_items', it.id, { status: 'jar', drawn_at: null });

  return (
    <section>
      <PageHeader title="O nosso jarro" subtitle={inJar.length === 1 ? '1 papel no jarro' : `${inJar.length} papéis no jarro`} />
      <NosSwitch current="jarro" />

      <div class="card jar-card">
        <JarArt items={inJar} shaking={shaking} />
        <button class="btn primary jar-btn" onClick={draw} disabled={!inJar.length || shaking}>
          {shaking ? 'A abanar o jarro…' : inJar.length ? '🎲 Tirar um papel' : 'O jarro está vazio'}
        </button>
        <p class="hint center">
          Tu: {mine.length} {mine.length === 1 ? 'papel' : 'papéis'}
          {people.partner && <> · {people.partner.name}: {theirs} {theirs === 1 ? 'papel' : 'papéis'} 🤫</>}
        </p>
      </div>

      <form class="add-bar" onSubmit={add}>
        <input placeholder="Escrever um papel… (ex: piquenique)" value={text} onInput={(e) => setText(e.target.value)}
          enterkeyhint="done" autocomplete="off" />
        <button class="btn primary sm" type="submit" aria-label="Pôr no jarro"><Icon name="plus" /></button>
      </form>
      <p class="hint">O que escreves fica em segredo até sair no sorteio.</p>

      {drawn.length > 0 && (
        <>
          <h3 class="section-title">Saiu do jarro</h3>
          <div class="list">
            {drawn.map((it) => (
              <div class="card item jar-drawn">
                <span class="special-ico"><Icon name="jar" size={18} /></span>
                <div class="grow">
                  <strong class="wrap">{it.text}</strong>
                  <small>Escrito por {author(it)}{it.drawn_at ? ` · saiu a ${shortDate(toISO(new Date(it.drawn_at)))}` : ''}</small>
                  <div class="row gap-s jar-actions">
                    <button class="pill accent" onClick={() => markDone(it)}>✓ Já fizemos</button>
                    <button class="pill" onClick={() => putBack(it)}>Voltar ao jarro</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mine.length > 0 && (
        <>
          <button class="link-btn" onClick={() => setShowMine(!showMine)}>
            {showMine ? 'Esconder' : 'Ver'} os meus papéis ({mine.length})
          </button>
          {showMine && (
            <div class="card list-card">
              {mine.map((it) => (
                <button class="shop-row text-btn" onClick={() => setEditing(it)}><span>{it.text}</span></button>
              ))}
            </div>
          )}
        </>
      )}

      {done.length > 0 && (
        <>
          <h3 class="section-title">Já fizemos ({done.length})</h3>
          <div class="card list-card">
            {done.map((it) => (
              <div class="shop-row jar-done-row">
                <span class="grow"><span>{it.text}</span></span>
                <small>{it.done_at ? shortDate(toISO(new Date(it.done_at))) : ''}</small>
                <button class="icon-btn" aria-label="Voltar ao jarro" title="Voltar ao jarro" onClick={() => putBack(it)}>
                  <Icon name="repeat" size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && <Empty icon="jar" title="O jarro está vazio" text="Cada um escreve ideias de atividades. Depois tiram uma à sorte!" />}

      {revealed && <Reveal item={revealed} author={author(revealed)} onClose={() => setRevealed(null)}
        onDone={() => { markDone(revealed); setRevealed(null); }}
        onBack={() => { putBack(revealed); setRevealed(null); }} />}
      {editing && <PaperSheet item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Reveal({ item, author, onClose, onDone, onBack }) {
  return (
    <div class="sheet-backdrop reveal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="paper" role="dialog" aria-modal="true" aria-label="Papel sorteado">
        <p class="eyebrow">Saiu do jarro…</p>
        <h2>{item.text}</h2>
        <small>Escrito por {author}</small>
        <button class="btn primary" onClick={onClose}>Bora! 🎉</button>
        <div class="row gap-s">
          <button class="btn ghost" onClick={onDone}>Já fizemos</button>
          <button class="btn ghost" onClick={onBack}>Voltar ao jarro</button>
        </div>
      </div>
    </div>
  );
}

function PaperSheet({ item, onClose }) {
  const [text, setText] = useState(item.text);
  const save = (e) => {
    e.preventDefault();
    if (text.trim()) update('jar_items', item.id, { text: text.trim() });
    onClose();
  };
  return (
    <Sheet title="Papel" onClose={onClose} onDelete={() => remove('jar_items', item.id)}>
      <form class="form" onSubmit={save}>
        <textarea class="big-input" rows="3" value={text} onInput={(e) => setText(e.target.value)} />
        <button class="btn primary" type="submit">Guardar</button>
      </form>
    </Sheet>
  );
}
