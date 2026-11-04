// Entrar / criar conta / recuperar palavra-passe / criar ou entrar numa casa.
import { useState } from 'preact/hooks';
import { signIn, signUp, resetPassword, updatePassword, createHousehold, joinHousehold, signOut } from '../lib/store.js';
import { Icon } from '../ui.jsx';

const APP = import.meta.env.VITE_APP_NAME;

const ERRORS = {
  'Invalid login credentials': 'Email ou palavra-passe errados.',
  'Email not confirmed': 'Ainda não confirmaste o email. Vê a tua caixa de correio.',
  'User already registered': 'Já existe uma conta com este email. Experimenta entrar.',
  'Password should be at least 6 characters.': 'A palavra-passe tem de ter pelo menos 6 caracteres.',
  'Código inválido.': 'Código inválido. Confirma com o teu par.',
};
const msg = (e) => ERRORS[e?.message] ?? e?.message ?? 'Algo correu mal.';

function Shell({ subtitle, children }) {
  return (
    <div class="login">
      <div class="login-logo"><Icon name="heart" size={40} /></div>
      <h1>{APP}</h1>
      <p class="muted">{subtitle}</p>
      {children}
    </div>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState('login'); // login | signup | forgot
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (m) => { setMode(m); setError(''); setInfo(''); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else if (mode === 'signup') {
        const needsConfirm = await signUp(email.trim(), password, name.trim());
        if (needsConfirm) setInfo('Conta criada! Enviámos-te um email: abre o link para confirmar e depois entra aqui.');
      } else {
        await resetPassword(email.trim());
        setInfo('Se existir uma conta com este email, vais receber um link para escolher uma nova palavra-passe.');
      }
    } catch (err) { setError(msg(err)); }
    setBusy(false);
  };

  return (
    <Shell subtitle={mode === 'signup' ? 'Cria a tua conta' : mode === 'forgot' ? 'Recuperar palavra-passe' : 'A nossa casa, organizada.'}>
      <form class="form" onSubmit={submit}>
        {mode === 'signup' && (
          <input placeholder="O teu nome" autocomplete="given-name" required value={name} onInput={(e) => setName(e.target.value)} />
        )}
        <input type="email" placeholder="Email" autocomplete="username" required value={email} onInput={(e) => setEmail(e.target.value)} />
        {mode !== 'forgot' && (
          <input type="password" placeholder={mode === 'signup' ? 'Palavra-passe (mín. 6 caracteres)' : 'Palavra-passe'}
            autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={6}
            value={password} onInput={(e) => setPassword(e.target.value)} />
        )}
        {error && <p class="error">{error}</p>}
        {info && <p class="info">{info}</p>}
        <button class="btn primary" disabled={busy}>
          {busy ? 'Um momento…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>
      <div class="auth-links">
        {mode === 'login' ? (
          <>
            <button class="link-btn" onClick={() => go('signup')}>Ainda não tenho conta</button>
            <button class="link-btn muted-link" onClick={() => go('forgot')}>Esqueci-me da palavra-passe</button>
          </>
        ) : (
          <button class="link-btn" onClick={() => go('login')}>Já tenho conta: entrar</button>
        )}
      </div>
    </Shell>
  );
}

export function NewPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await updatePassword(password); } catch (err) { setError(msg(err)); setBusy(false); }
  };
  return (
    <Shell subtitle="Escolhe uma nova palavra-passe">
      <form class="form" onSubmit={submit}>
        <input type="password" placeholder="Nova palavra-passe (mín. 6 caracteres)" autocomplete="new-password"
          required minLength={6} value={password} onInput={(e) => setPassword(e.target.value)} />
        {error && <p class="error">{error}</p>}
        <button class="btn primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
      </form>
    </Shell>
  );
}

/** Depois de criar conta: criar a casa ou entrar na do par com o código. */
export function Onboarding() {
  const [mode, setMode] = useState(null); // null | create | join
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { mode === 'create' ? await createHousehold(value) : await joinHousehold(value); }
    catch (err) { setError(msg(err)); setBusy(false); }
  };

  return (
    <Shell subtitle="Falta só um passo">
      {!mode ? (
        <div class="form">
          <button class="choice" onClick={() => setMode('create')}>
            <span>🏡</span><b>Criar a nossa casa</b><small>Sou o primeiro a entrar. Depois convido o meu par.</small>
          </button>
          <button class="choice" onClick={() => setMode('join')}>
            <span>🔑</span><b>Tenho um código</b><small>O meu par já criou a casa e deu-me o código.</small>
          </button>
          <button class="link-btn muted-link" onClick={() => signOut()}>Sair</button>
        </div>
      ) : (
        <form class="form" onSubmit={submit}>
          {mode === 'create' ? (
            <input placeholder="Nome da casa (ex: Ana & Rui)" value={value} onInput={(e) => setValue(e.target.value)} maxLength={40} />
          ) : (
            <input class="code-input" placeholder="CÓDIGO" required value={value} autocapitalize="characters"
              onInput={(e) => setValue(e.target.value.toUpperCase())} maxLength={12} />
          )}
          {error && <p class="error">{error}</p>}
          <button class="btn primary" disabled={busy}>{busy ? 'Um momento…' : mode === 'create' ? 'Criar casa' : 'Entrar na casa'}</button>
          <button type="button" class="link-btn muted-link" onClick={() => { setMode(null); setError(''); }}>Voltar</button>
        </form>
      )}
    </Shell>
  );
}

/** Cartão para convidar o par (aparece enquanto a casa só tem uma pessoa). */
export function InviteCard({ house }) {
  const [copied, setCopied] = useState(false);
  if (!house) return null;
  const text = `Junta-te à nossa casa na app ${APP} 💛\n1. Abre ${location.origin + location.pathname}\n2. Cria a tua conta\n3. Escolhe "Tenho um código" e escreve: ${house.invite_code}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* cancelado */ }
  };
  return (
    <div class="card invite">
      <p class="eyebrow">Convida o teu par 💌</p>
      <div class="code">{house.invite_code}</div>
      <small>Quando entrar com este código, ficam os dois na mesma casa. Depois disso o código deixa de funcionar.</small>
      <button class="btn primary" onClick={share}>{copied ? 'Copiado!' : 'Enviar convite'}</button>
    </div>
  );
}
