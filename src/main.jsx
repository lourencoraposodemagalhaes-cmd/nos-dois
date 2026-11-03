import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { start, useSession, signIn, onError, DEMO } from './lib/store.js';
import { Icon } from './ui.jsx';
import { Hoje } from './views/Hoje.jsx';
import { Calendario } from './views/Calendario.jsx';
import { Tarefas } from './views/Tarefas.jsx';
import { Compras } from './views/Compras.jsx';
import { Datas } from './views/Datas.jsx';
import './styles.css';

const TABS = [
  { id: 'hoje', label: 'Hoje', icon: 'home', View: Hoje },
  { id: 'calendario', label: 'Calendário', icon: 'calendar', View: Calendario },
  { id: 'tarefas', label: 'Tarefas', icon: 'check', View: Tarefas },
  { id: 'compras', label: 'Compras', icon: 'cart', View: Compras },
  { id: 'datas', label: 'Datas', icon: 'heart', View: Datas },
];

const readTab = () => { const h = location.hash.slice(1); return TABS.some((t) => t.id === h) ? h : 'hoje'; };

function App() {
  const { session, loaded } = useSession();
  const [tab, setTab] = useState(readTab);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener('hashchange', onHash);
    onError((e) => { setToast(e.message || 'Algo correu mal'); setTimeout(() => setToast(null), 4000); });
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => { location.hash = id; window.scrollTo(0, 0); };

  if (!session) return <Login />;
  if (!loaded) return <div class="splash"><div class="spinner" /></div>;

  const { View } = TABS.find((t) => t.id === tab);
  return (
    <>
      <main class="page"><View go={go} /></main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <a href={`#${t.id}`} class={t.id === tab ? 'on' : ''} onClick={() => window.scrollTo(0, 0)}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      {toast && <div class="toast" role="alert">{toast}</div>}
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await signIn(email.trim(), password); }
    catch (err) { setError(err.message === 'Invalid login credentials' ? 'Email ou palavra-passe errados.' : err.message); }
    finally { setBusy(false); }
  };

  return (
    <div class="login">
      <div class="login-logo"><Icon name="heart" size={40} /></div>
      <h1>Nós Dois</h1>
      <p class="muted">A nossa casa, organizada.</p>
      <form class="form" onSubmit={submit}>
        <input type="email" placeholder="Email" autocomplete="username" required value={email} onInput={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Palavra-passe" autocomplete="current-password" required value={password} onInput={(e) => setPassword(e.target.value)} />
        {error && <p class="error">{error}</p>}
        <button class="btn primary" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

if (DEMO) console.info('Nós Dois: modo demonstração (sem Supabase configurado).');
start();
registerSW({ immediate: true });
render(<App />, document.getElementById('app'));
