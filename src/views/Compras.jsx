import { useState, useMemo } from 'preact/hooks';
import { useTable, insert, update, remove, removeWhere } from '../lib/store.js';
import { Icon, PageHeader, Sheet, Field, Empty } from '../ui.jsx';

export const CATEGORIES = {
  fruta: { label: 'Fruta e legumes', emoji: '🥦' },
  padaria: { label: 'Padaria', emoji: '🥖' },
  talho: { label: 'Talho e peixaria', emoji: '🥩' },
  laticinios: { label: 'Laticínios e ovos', emoji: '🧀' },
  mercearia: { label: 'Mercearia', emoji: '🥫' },
  congelados: { label: 'Congelados', emoji: '🧊' },
  bebidas: { label: 'Bebidas', emoji: '🧃' },
  limpeza: { label: 'Limpeza', emoji: '🧽' },
  higiene: { label: 'Higiene', emoji: '🧴' },
  casa: { label: 'Casa', emoji: '🏠' },
  outros: { label: 'Outros', emoji: '🛒' },
};

// Palpite de categoria a partir do nome (o utilizador pode sempre mudar).
const GUESS = [
  ['fruta', /banana|maç|pera|laranja|limã|uva|morango|kiwi|melão|melancia|ananás|abacate|tomate|alface|cebola|alho|batata|cenoura|courgette|pepino|pimento|brócolo|espinafre|cogumelo|legume|fruta|salada|abóbora|couve|coentro|salsa/i],
  ['padaria', /pão|pao|baguete|croissant|bolo|tosta|broa|bolacha/i],
  ['talho', /frango|carne|porco|vaca|bife|peru|salsicha|fiambre|presunto|chouriço|bacon|peixe|salmão|bacalhau|atum fresco|pescada|dourada|camarão|picad/i],
  ['laticinios', /leite|iogurte|queijo|manteiga|natas|ovo|requeijão|mozzarella|kefir/i],
  ['mercearia', /arroz|massa|esparguete|feijão|grão|lentilha|azeite|óleo|vinagre|sal\b|açúcar|farinha|café|chá|cereais|aveia|atum|salsicha|molho|ketchup|maionese|mel|compota|especiaria|caldo|enlatado|bolachas|chocolate|snack|batatas fritas/i],
  ['congelados', /congelad|gelado|pizza|douradinho/i],
  ['bebidas', /água|agua|sumo|cerveja|vinho|refrigerante|coca|leite de|bebida|gin|tónica/i],
  ['limpeza', /detergente|lixívia|esponja|lava|amaciador|limpa|saco.*lixo|desengordurante|pastilhas máquina/i],
  ['higiene', /champô|shampoo|gel|sabonete|pasta de dentes|escova|desodorizante|papel higiénico|lenço|algodão|creme|penso|cotonete|lâmina/i],
  ['casa', /pilha|lâmpada|vela|guardanapo|papel de cozinha|alumínio|película|rolo/i],
];
export const guessCategory = (name) => GUESS.find(([, re]) => re.test(name))?.[0] ?? 'outros';

export function Compras() {
  const items = useTable('shopping_items');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);

  const pending = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked).sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''));

  // Sugestões: itens já comprados antes que não estão por comprar agora.
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const pendingNames = new Set(pending.map((i) => i.name.toLowerCase()));
    const seen = new Map();
    for (const i of items) {
      const k = i.name.toLowerCase();
      if (k.includes(q) && !pendingNames.has(k) && !seen.has(k)) seen.set(k, i);
    }
    return [...seen.values()].slice(0, 4);
  }, [text, items]);

  const add = (name, base) => {
    const n = name.trim();
    if (!n) return;
    // Se já estava comprado, volta para a lista em vez de duplicar.
    const existing = items.find((i) => i.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      if (existing.checked) update('shopping_items', existing.id, { checked: false, checked_at: null });
    } else {
      insert('shopping_items', { name: n[0].toUpperCase() + n.slice(1), category: base?.category ?? guessCategory(n), checked: false });
    }
    setText('');
  };

  const groups = Object.keys(CATEGORIES)
    .map((k) => ({ k, items: pending.filter((i) => i.category === k).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);

  const toggle = (i) => update('shopping_items', i.id, i.checked
    ? { checked: false, checked_at: null } : { checked: true, checked_at: new Date().toISOString() });

  return (
    <section>
      <PageHeader title="Compras" subtitle={pending.length ? `${pending.length} por comprar` : 'Lista vazia'} />

      <form class="add-bar" onSubmit={(e) => { e.preventDefault(); add(text); }}>
        <input placeholder="Adicionar… (ex: leite)" value={text} onInput={(e) => setText(e.target.value)}
          enterkeyhint="done" autocomplete="off" />
        <button class="btn primary sm" type="submit" aria-label="Adicionar"><Icon name="plus" /></button>
      </form>
      {suggestions.length > 0 && (
        <div class="chips">
          {suggestions.map((s) => <button class="chip" onClick={() => add(s.name, s)}>+ {s.name}</button>)}
        </div>
      )}

      {pending.length === 0 && <Empty icon="cart" title="Nada para comprar" text="Escrevam acima o que falta em casa." />}

      {groups.map((g) => (
        <div class="group">
          <h3 class="section-title">{CATEGORIES[g.k].emoji} {CATEGORIES[g.k].label}</h3>
          <div class="card list-card">
            {g.items.map((i) => <ItemRow item={i} onToggle={() => toggle(i)} onOpen={() => setEditing(i)} />)}
          </div>
        </div>
      ))}

      {checked.length > 0 && (
        <div class="group">
          <div class="row between">
            <h3 class="section-title">No carrinho ({checked.length})</h3>
            <button class="link-btn" onClick={() => removeWhere('shopping_items', (i) => i.checked)}>Limpar</button>
          </div>
          <div class="card list-card">
            {checked.slice(0, 30).map((i) => <ItemRow item={i} onToggle={() => toggle(i)} onOpen={() => setEditing(i)} />)}
          </div>
          <p class="hint">Ao limpar, os itens continuam a aparecer como sugestão quando escreverem.</p>
        </div>
      )}

      {editing && <ItemSheet item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ItemRow({ item, onToggle, onOpen }) {
  return (
    <div class={`shop-row ${item.checked ? 'done' : ''}`}>
      <button class="checkbox round" onClick={onToggle} aria-label={item.checked ? 'Desmarcar' : 'Marcar comprado'}>
        {item.checked && <svg viewBox="0 0 24 24" width="14" height="14"><path d="m6 12 4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>}
      </button>
      <button class="grow text-btn" onClick={onOpen}>
        <span>{item.name}</span>
        {item.quantity && <span class="qty">{item.quantity}</span>}
      </button>
    </div>
  );
}

function ItemSheet({ item, onClose }) {
  const [f, setF] = useState({ quantity: '', ...item });
  const save = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    update('shopping_items', item.id, { name: f.name.trim(), quantity: f.quantity?.trim() || null, category: f.category });
    onClose();
  };
  return (
    <Sheet title="Item" onClose={onClose} onDelete={() => remove('shopping_items', item.id)}>
      <form onSubmit={save} class="form">
        <input class="big-input" value={f.name} onInput={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Quantidade"><input placeholder="ex: 2, 1 kg, pack de 6" value={f.quantity ?? ''} onInput={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Secção">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(CATEGORIES).map(([k, c]) => <option value={k}>{c.emoji} {c.label}</option>)}
          </select>
        </Field>
        <button class="btn primary" type="submit">Guardar</button>
      </form>
    </Sheet>
  );
}
