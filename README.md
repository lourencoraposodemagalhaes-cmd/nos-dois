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
5. **Project Settings → API Keys**: copiar o **Project URL** e a **Publishable key**.

### 2. GitHub (alojamento)
1. Criar um repositório (ex.: `nos-dois`) e enviar este código para lá.
2. Pôr o **Project URL** e a chave **publishable** em `.env.production`.
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

## Notificações

Resumo às 8:00 (hora de Lisboa), datas especiais (7 dias antes, véspera e no dia),
lembretes 30 min antes dos eventos e avisos quando o outro adiciona um evento ou tarefa.

1. **SQL Editor**: correr [`supabase/notifications.sql`](supabase/notifications.sql).
2. **SQL Editor**: guardar o segredo partilhado no Vault:
   `select vault.create_secret('<segredo>', 'notify_secret');`
3. **Edge Functions → Deploy a new function → Via Editor**: nome `notify`, colar
   [`supabase/functions/notify/index.ts`](supabase/functions/notify/index.ts) → Deploy.
   Nos detalhes da função, desligar **Verify JWT** (o relógio chama-a sem sessão).
4. **Edge Functions → Secrets**: `VAPID_KEYS` (JSON com as chaves VAPID em JWK) e
   `NOTIFY_SECRET` (o mesmo segredo do passo 2).
5. A chave pública VAPID vai em `.env.production` (`VITE_VAPID_PUBLIC_KEY`).
6. Na app: ⚙️ → **Ativar notificações** → **Enviar notificação de teste**.

## Foto do dia e recordações

Uma vez por dia, a uma hora aleatória (dias úteis 9h–18h, fim de semana 11h–19h, hora de Lisboa),
os dois recebem "📸 Hora da foto do dia!". Só se vê a foto do outro depois de publicar a sua.
Uma vez por dia aparece também uma recordação ao acaso (fotos com mais de 7 dias).

1. **SQL Editor**: correr [`supabase/photos.sql`](supabase/photos.sql) (tabelas, Storage privado, triggers).
2. **Edge Functions → notify → Code**: colar a versão atual de `supabase/functions/notify/index.ts` → Deploy.

## Widget (resumo do dia)

Com a app gratuita **Scriptable**: copiar [`widget/nos-dois-widget.js`](widget/nos-dois-widget.js) para um
script novo, correr uma vez para iniciar sessão e adicionar um widget Scriptable ao ecrã principal.
Mostra eventos de hoje, tarefas, compras, próxima data especial e se a foto do dia está por tirar.

## Ideias para depois
- Despesas partilhadas, plano de refeições, notas.
