// Componentes partilhados entre os ecrãs.
import { useEffect } from 'preact/hooks';
import { useTable, myId } from './lib/store.js';

// ---------- ícones (traço, 24px) ----------
const paths = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  check: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="m8 12 3 3 5-6" /></>,
  cart: <><path d="M3 4h2.5l2.2 11h10.8l2-8H6.6" /><circle cx="9.5" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></>,
  heart: <path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.9 4 7.3 4c2 0 3.6 1.1 4.7 2.7C13.1 5.1 14.7 4 16.7 4c3.4 0 5.7 3.3 4.5 6.7C19.5 15.4 12 20 12 20Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  repeat: <><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  cake: <><path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8Z" /><path d="M4 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M12 11V7" /><path d="M12 7c-1 0-1.5-.8-1.5-1.5S12 3 12 3s1.5 1.8 1.5 2.5S13 7 12 7Z" /></>,
  rings: <><circle cx="9" cy="14" r="5" /><circle cx="15" cy="14" r="5" /><path d="m10 5 2-2 2 2" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
};

export function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ---------- pessoas ----------
export function usePeople() {
  const profiles = useTable('profiles');
  const me = profiles.find((p) => p.id === myId());
  const partner = profiles.find((p) => p.id !== myId());
  const byId = (id) => profiles.find((p) => p.id === id);
  return { profiles, me, partner, byId };
}

/** Bolinha de cor da pessoa (ou das duas, se for "os dois"). */
export function PersonDot({ person, size = 10 }) {
  const { profiles, byId } = usePeople();
  const p = person ? byId(person) : null;
  const style = { width: `${size}px`, height: `${size}px` }; // Preact 11 não acrescenta 'px' sozinho
  if (p) return <span class="dot" style={{ ...style, background: p.color }} title={p.name} />;
  const [a, b] = profiles;
  return (
    <span class="dot" title="Os dois"
      style={{ ...style, background: `linear-gradient(135deg, ${a?.color ?? '#999'} 50%, ${b?.color ?? '#999'} 50%)` }} />
  );
}

export function personLabel(person, people) {
  if (!person) return 'Os dois';
  return person === people.me?.id ? 'Eu' : people.byId(person)?.name ?? '—';
}

/** Escolher: eu / parceiro(a) / os dois. */
export function PersonPicker({ value, onChange }) {
  const people = usePeople();
  const opts = [
    { id: people.me?.id, label: 'Eu' },
    { id: people.partner?.id, label: people.partner?.name ?? 'Parceiro(a)' },
    { id: null, label: 'Os dois' },
  ];
  return (
    <div class="segmented" role="radiogroup">
      {opts.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.id}
          class={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          <PersonDot person={o.id} /> {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- folha (modal que sobe de baixo) ----------
export function Sheet({ title, onClose, children, onDelete }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
          <h2>{title}</h2>
          {onDelete
            ? <button type="button" class="icon-btn danger" aria-label="Apagar"
                onClick={() => { if (confirm('Apagar?')) { onDelete(); onClose(); } }}><Icon name="trash" /></button>
            : <span style={{ width: '40px' }} />}
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return <label class="field"><span>{label}</span>{children}</label>;
}

export function Fab({ onClick, label }) {
  return <button class="fab" onClick={onClick} aria-label={label}><Icon name="plus" size={26} /></button>;
}

export function Empty({ icon, title, text }) {
  return (
    <div class="empty">
      <Icon name={icon} size={36} />
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <header class="page-head">
      <div>
        {subtitle && <p class="eyebrow">{subtitle}</p>}
        <h1>{title}</h1>
      </div>
      {right}
    </header>
  );
}
