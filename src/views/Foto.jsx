// Foto do dia (estilo BeReal) + recordações + álbum.
import { useState, useEffect, useRef } from 'preact/hooks';
import { useTable, remove, deleteFile, myId } from '../lib/store.js';
import { today, addDays, shortDate, longDate, daysBetween } from '../lib/dates.js';
import { postPhoto, usePhotoUrl, preload } from '../lib/photos.js';
import { Icon, PageHeader, Empty, Field, usePeople } from '../ui.jsx';
import { NosSwitch } from './Jarro.jsx';

const LATE_AFTER = 30 * 60000; // depois de 30 min, a foto fica "atrasada"
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignora */ } },
};

/** Estado da foto de hoje. */
export function useDaily() {
  const photos = useTable('photos');
  const moments = useTable('daily_moments');
  const { partner } = usePeople();
  const t = today();
  const moment = moments.find((m) => m.date === t);
  const [, tick] = useState(0);
  // Re-avalia quando chega a hora (sem esperar por outra mudança).
  useEffect(() => {
    if (!moment) return;
    const ms = new Date(moment.at) - Date.now();
    if (ms <= 0 || ms > 864e5) return;
    const id = setTimeout(() => tick((n) => n + 1), ms + 500);
    return () => clearTimeout(id);
  }, [moment?.at]);
  const daily = photos.filter((p) => p.kind === 'daily' && p.date === t);
  return {
    moment,
    // Sem momento definido (servidor ainda não escolheu) também deixa publicar.
    open: !moment || new Date(moment.at) <= new Date(),
    mine: daily.find((p) => p.created_by === myId()),
    theirs: partner ? daily.find((p) => p.created_by === partner.id) : null,
  };
}

/** Há foto por tirar? (para o pontinho no botão da câmara) */
export function usePhotoPending() {
  const d = useDaily();
  return d.moment && d.open && !d.mine;
}

// ---------- gestor de pop-ups (montado uma vez na app) ----------
let dismissedThisSession = false;

export function PhotoMoment({ forceOpen, onClose }) {
  const d = useDaily();
  const photos = useTable('photos');
  const [popup, setPopup] = useState(null); // 'daily' | {memory}

  useEffect(() => {
    if (forceOpen) { setPopup('daily'); return; }
    if (popup) return;
    const t = today();
    if (d.moment && d.open && !d.mine && !dismissedThisSession) { setPopup('daily'); return; }
    if (d.theirs && store.get(`seen-${d.theirs.id}`) !== '1' && !dismissedThisSession) { setPopup('daily'); return; }
    if (store.get('memory-day') !== t) {
      const old = photos.filter((p) => p.date <= addDays(t, -7));
      if (old.length) {
        store.set('memory-day', t);
        setPopup({ memory: old[Math.floor(Math.random() * old.length)] });
      }
    }
  }, [forceOpen, d.moment?.at, d.open, d.mine?.id, d.theirs?.id, photos.length]);

  const close = () => {
    dismissedThisSession = true;
    if (d.mine && d.theirs) store.set(`seen-${d.theirs.id}`, '1');
    setPopup(null);
    onClose?.();
  };

  if (!popup) return null;
  return (
    <div class="sheet-backdrop photo-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="photo-pop" role="dialog" aria-modal="true">
        <button class="icon-btn photo-x" onClick={close} aria-label="Fechar"><Icon name="x" /></button>
        {popup === 'daily' ? <DailyContent d={d} /> : <MemoryContent photo={popup.memory} />}
      </div>
    </div>
  );
}

function DailyContent({ d }) {
  const { partner } = usePeople();
  const name = partner?.name ?? 'O outro';

  if (!d.open) {
    return (
      <div class="photo-wait">
        <span class="photo-big-ico">⏳</span>
        <h2>Ainda não é hora</h2>
        <p class="muted">A hora da foto de hoje é surpresa. Vais receber uma notificação quando chegar!</p>
      </div>
    );
  }
  return (
    <>
      <p class="eyebrow">📸 Foto do dia · {shortDate(today())}</p>
      <h2 class="photo-title">{d.mine ? (d.theirs ? 'As vossas fotos de hoje' : `Agora é a vez de ${name}…`) : 'O que estás a fazer agora?'}</h2>
      <div class="photo-pair">
        {d.mine ? <PhotoCard photo={d.mine} label="Tu" /> : <Capture moment={d.moment} />}
        {d.theirs
          ? (d.mine ? <PhotoCard photo={d.theirs} label={name} /> : <PhotoCard photo={d.theirs} label={name} locked />)
          : <div class="photo-empty"><span>🙈</span><small>{name} ainda não publicou</small></div>}
      </div>
    </>
  );
}

function PhotoCard({ photo, label, locked }) {
  const url = usePhotoUrl(photo.path);
  return (
    <figure class={`photo-card ${locked ? 'locked' : ''}`}>
      {url ? <img src={url} alt={photo.caption ?? `Foto de ${label}`} /> : <div class="photo-loading" />}
      {locked && <div class="photo-lock"><span>🔒</span><small>Publica a tua para veres</small></div>}
      <figcaption>
        <b>{label}</b> · {hhmm(photo.created_at)}{photo.late && <span class="late-tag">atrasada ⏰</span>}
        {!locked && photo.caption && <span class="photo-caption">{photo.caption}</span>}
      </figcaption>
    </figure>
  );
}

function Capture({ moment }) {
  const input = useRef();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
  };
  const publish = async () => {
    setBusy(true); setError('');
    try {
      const late = moment ? Date.now() - new Date(moment.at) > LATE_AFTER : false;
      await postPhoto(file, { caption: caption.trim() || null, late });
    } catch (e) { setError(e.message || 'Não foi possível enviar.'); setBusy(false); }
  };

  return (
    <div class="photo-capture">
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      {preview ? (
        <>
          <img src={preview} alt="Pré-visualização" />
          <input class="photo-caption-input" placeholder="Legenda (opcional)" value={caption} onInput={(e) => setCaption(e.target.value)} maxLength={120} />
          <div class="row gap-s">
            <button class="btn ghost" onClick={() => input.current.click()} disabled={busy}>Outra</button>
            <button class="btn primary" onClick={publish} disabled={busy}>{busy ? 'A enviar…' : 'Publicar'}</button>
          </div>
          {error && <p class="error">{error}</p>}
        </>
      ) : (
        <button class="photo-shoot" onClick={() => input.current.click()}>
          <span>📷</span><b>Tirar foto</b><small>agora mesmo, sem filtros!</small>
        </button>
      )}
    </div>
  );
}

function MemoryContent({ photo }) {
  const people = usePeople();
  const url = usePhotoUrl(photo.path);
  const ago = daysBetween(photo.date, today());
  const agoLabel = ago >= 365 ? `há ${Math.floor(ago / 365)} ${ago >= 730 ? 'anos' : 'ano'}`
    : ago >= 60 ? `há ${Math.floor(ago / 30)} meses` : `há ${ago} dias`;
  return (
    <>
      <p class="eyebrow">🎞️ Recordação · {agoLabel}</p>
      <h2 class="photo-title">{longDate(photo.date)}</h2>
      <figure class="photo-card single">
        {url ? <img src={url} alt={photo.caption ?? 'Recordação'} /> : <div class="photo-loading" />}
        <figcaption>
          <b>{photo.created_by === myId() ? 'Tu' : people.byId(photo.created_by)?.name}</b>
          {photo.caption && <span class="photo-caption">{photo.caption}</span>}
        </figcaption>
      </figure>
    </>
  );
}

// ---------- álbum (Nós → Fotos) ----------
export function Fotos() {
  const photos = useTable('photos');
  const people = usePeople();
  const d = useDaily();
  const [viewing, setViewing] = useState(null);
  const [adding, setAdding] = useState(false);

  // Só mostra a foto de hoje do outro depois de publicares a tua.
  const visible = photos
    .filter((p) => !(p.kind === 'daily' && p.date === today() && p.created_by !== myId() && !d.mine))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  useEffect(() => { preload(visible.slice(0, 60).map((p) => p.path)).catch(() => {}); }, [photos.length]);

  return (
    <section>
      <PageHeader title="O nosso álbum" subtitle={`${visible.length} ${visible.length === 1 ? 'foto' : 'fotos'}`}
        right={<button class="pill" onClick={() => setAdding(true)}>+ Recordação</button>} />
      <NosSwitch current="fotos" />
      {visible.length === 0 && <Empty icon="camera" title="Ainda sem fotos" text="As fotos do dia ficam aqui. Também podem juntar recordações antigas." />}
      <div class="photo-grid">
        {visible.map((p) => <Thumb photo={p} onClick={() => setViewing(p)} />)}
      </div>
      {viewing && <Viewer photo={viewing} people={people} onClose={() => setViewing(null)} />}
      {adding && <AddMemory onClose={() => setAdding(false)} />}
    </section>
  );
}

function Thumb({ photo, onClick }) {
  const url = usePhotoUrl(photo.path);
  return (
    <button class="thumb" onClick={onClick} aria-label={shortDate(photo.date)}>
      {url && <img src={url} alt="" loading="lazy" />}
      <span>{shortDate(photo.date)}</span>
    </button>
  );
}

function Viewer({ photo, people, onClose }) {
  const url = usePhotoUrl(photo.path);
  const mine = photo.created_by === myId();
  const del = async () => {
    if (!confirm('Apagar esta foto?')) return;
    remove('photos', photo.id);
    deleteFile(photo.path);
    onClose();
  };
  return (
    <div class="sheet-backdrop photo-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="photo-pop">
        <button class="icon-btn photo-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        <p class="eyebrow">{photo.kind === 'daily' ? '📸 Foto do dia' : '🎞️ Recordação'}</p>
        <h2 class="photo-title">{longDate(photo.date)}</h2>
        <figure class="photo-card single">
          {url ? <img src={url} alt={photo.caption ?? ''} /> : <div class="photo-loading" />}
          <figcaption>
            <b>{mine ? 'Tu' : people.byId(photo.created_by)?.name}</b>
            {photo.kind === 'daily' && <> · {hhmm(photo.created_at)}</>}
            {photo.late && <span class="late-tag">atrasada ⏰</span>}
            {photo.caption && <span class="photo-caption">{photo.caption}</span>}
          </figcaption>
        </figure>
        {mine && <button class="link-btn danger" onClick={del}>Apagar foto</button>}
      </div>
    </div>
  );
}

function AddMemory({ onClose }) {
  const input = useRef();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [date, setDate] = useState(today());
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true); setError('');
    try { await postPhoto(file, { kind: 'memory', date, caption: caption.trim() || null }); onClose(); }
    catch (e) { setError(e.message || 'Não foi possível enviar.'); setBusy(false); }
  };

  return (
    <div class="sheet-backdrop photo-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="photo-pop">
        <button class="icon-btn photo-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        <p class="eyebrow">🎞️ Nova recordação</p>
        <input ref={input} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
        {preview
          ? <img class="memory-preview" src={preview} alt="" onClick={() => input.current.click()} />
          : <button class="photo-shoot" onClick={() => input.current.click()}><span>🖼️</span><b>Escolher foto</b><small>da galeria do iPhone</small></button>}
        <div class="form">
          <Field label="Quando foi?"><input type="date" value={date} max={today()} onInput={(e) => setDate(e.target.value)} /></Field>
          <Field label="Legenda"><input placeholder="ex: Primeira viagem juntos ✈️" value={caption} onInput={(e) => setCaption(e.target.value)} /></Field>
          {error && <p class="error">{error}</p>}
          <button class="btn primary" disabled={!file || busy} onClick={save}>{busy ? 'A enviar…' : 'Guardar no álbum'}</button>
        </div>
      </div>
    </div>
  );
}
