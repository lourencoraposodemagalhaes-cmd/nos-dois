import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { start, useSession, onError, useTable, myId, DEMO } from './lib/store.js';
import { AuthScreen, NewPassword, Onboarding } from './views/Conta.jsx';
import { Icon } from './ui.jsx';
import { Hoje } from './views/Hoje.jsx';
import { Calendario } from './views/Calendario.jsx';
import { Tarefas } from './views/Tarefas.jsx';
import { Compras } from './views/Compras.jsx';
import { Datas } from './views/Datas.jsx';
import { Jarro } from './views/Jarro.jsx';
import { Fotos, PhotoMoment } from './views/Foto.jsx';
import './styles.css';

const TABS = [
  { id: 'hoje', label: 'Hoje', icon: 'home', View: Hoje },
  { id: 'calendario', label: 'Calendário', icon: 'calendar', View: Calendario },
  { id: 'tarefas', label: 'Tarefas', icon: 'check', View: Tarefas },
  { id: 'compras', label: 'Compras', icon: 'cart', View: Compras },
  { id: 'datas', label: 'Nós', icon: 'heart', View: Datas, also: ['jarro', 'fotos'] },
];

// Páginas que não têm separador próprio (vivem dentro de outro).
const PAGES = { ...Object.fromEntries(TABS.map((t) => [t.id, t.View])), jarro: Jarro, fotos: Fotos };

const readTab = () => { const h = location.hash.slice(1); return Object.hasOwn(PAGES, h) ? h : 'hoje'; };

function App() {
  const { session, loaded, recovering } = useSession();
  const profiles = useTable('profiles');
  const [tab, setTab] = useState(readTab);
  const [toast, setToast] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener('hashchange', onHash);
    addEventListener('open-photo', () => setPhotoOpen(true));
    onError((e) => { setToast(e.message || 'Algo correu mal'); setTimeout(() => setToast(null), 4000); });
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => { location.hash = id; window.scrollTo(0, 0); };

  if (recovering) return <NewPassword />;
  if (!session) return <AuthScreen />;
  if (!loaded) return <div class="splash"><div class="spinner" /></div>;
  const me = profiles.find((p) => p.id === myId());
  if (!DEMO && !me?.household_id) return <Onboarding />;

  const View = PAGES[tab];
  return (
    <>
      <main class="page"><View go={go} /></main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <a href={`#${t.id}`} class={t.id === tab || t.also?.includes(tab) ? 'on' : ''} onClick={() => window.scrollTo(0, 0)}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <PhotoMoment forceOpen={photoOpen} onClose={() => setPhotoOpen(false)} />
      {toast && <div class="toast" role="alert">{toast}</div>}
    </>
  );
}


if (DEMO) console.info('Nós Dois: modo demonstração (sem Supabase configurado).');
start();
registerSW({ immediate: true });
render(<App />, document.getElementById('app'));
