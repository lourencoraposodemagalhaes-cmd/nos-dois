# Nós Dois 💛

App privada para dois: **calendário**, **tarefas**, **lista de compras** e **datas especiais**,
sincronizada em tempo real entre os dois iPhones.

- Web app instalável (PWA): sem App Store e sem Mac obrigatório.
- Dados no [Supabase](https://supabase.com) (plano gratuito). Só as duas contas criadas por vocês conseguem entrar.
- Publicada grátis no GitHub Pages.

Sem Supabase configurado, a app arranca em **modo demonstração** (dados guardados só no dispositivo).

---

## Configuração (uma vez, ~15 min)

### 1. Supabase (base de dados + login)
1. Criar conta em supabase.com → **New project** (região: *West EU (Ireland)* ou *Central EU (Frankfurt)*).
2. **SQL Editor → New query** → colar o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Sign In / Providers → Email**: desligar *Allow new users to sign up*
   (ninguém se consegue registar sozinho) e desligar *Confirm email*.
4. **Authentication → Users → Add user → Create new user**: criar o teu utilizador e o da Beatriz
   (email + palavra-passe, com *Auto Confirm User* ligado).
   > A base de dados recusa um terceiro utilizador.
5. **Project Settings → API**: copiar o **Project URL** e a chave **anon public**.

### 2. GitHub (alojamento)
1. Criar um repositório (ex.: `nos-dois`) e enviar este código para lá.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave anon public
3. **Settings → Pages → Source: GitHub Actions**.
4. Cada `git push` para `main` publica automaticamente em
   `https://<o-teu-utilizador>.github.io/nos-dois/`.

> A chave *anon* é pública por design. A proteção dos dados vem das regras RLS:
> só quem tem sessão iniciada **e** perfil na casa consegue ler ou escrever.

### 3. Instalar nos iPhones
1. Abrir o link no **Safari**.
2. Botão **Partilhar** → **Adicionar ao ecrã principal**.
3. Abrir pelo ícone e entrar com o email e a palavra-passe.

---

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencher (ou deixar vazio para modo demo)
npm run dev                  # abre em http://localhost:5173 (e na rede local, para testar no iPhone)
```

Estrutura:

```
src/
  main.jsx            app, separadores, login
  ui.jsx              componentes partilhados (ícones, folhas, seletor de pessoa)
  lib/store.js        dados: cache + Supabase em tempo real (ou modo demo)
  lib/dates.js        utilitários de datas
  views/              Hoje, Calendário, Tarefas, Compras, Datas
supabase/schema.sql   tabelas, segurança (RLS) e tempo real
```

## Ideias para depois
- Notificações push (lembrete de tarefas e de datas especiais) com uma Edge Function do Supabase.
- Despesas partilhadas, plano de refeições, notas.
