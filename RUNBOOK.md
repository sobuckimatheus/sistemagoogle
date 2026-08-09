# Runbook — Painel GBP

Operação do dia a dia e o que fazer quando algo quebra. Escrito para ser lido
por quem **não** construiu o sistema: cada procedimento diz o que rodar, o que
esperar e como saber que deu certo.

Complementa o [README.md](README.md) (arquitetura e decisões) e o
[TASKS.md](TASKS.md) (backlog).

---

## 1. Mapa rápido

| Componente | Onde vive | Como saber que está vivo |
|---|---|---|
| App (Next.js) | Vercel | a home carrega autenticada |
| Banco | Supabase Postgres | `sql/999_verify.sql` no SQL Editor |
| Jobs | Vercel Cron (`vercel.json`) | tabela `sync_runs` com linha recente |
| OAuth Google | Google Cloud Console | `google_connections.status = ACTIVE` |
| Billing | Stripe | webhook com entregas 200 no dashboard |
| E-mail | Resend | log da Resend, aba Emails |

Rotas de cron, todas protegidas por `CRON_SECRET` no header
`Authorization: Bearer <segredo>`:

| Rota | Frequência | O que faz |
|---|---|---|
| `/api/cron/sync-diario` | diária, 06:00 | desempenho, avaliações, auditoria, alertas |
| `/api/cron/snapshot-concorrentes` | semanal, seg 07:00 | snapshot dos concorrentes |
| `/api/cron/publicar-agendados` | de hora em hora | publica posts agendados |
| `/api/cron/monitor-jobs` | diária, 12:00 | alerta se um negócio parou de sincronizar |
| `/api/cron/volume-keywords` | mensal, dia 1º 05:00 | revalida o volume de busca na fonte configurada |

Disparo manual:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://SEUDOMINIO/api/cron/sync-diario
```

---

## 2. Allowlist do Google

**O prazo que não depende de você.** As Business Profile APIs vêm com cota 0
até a aprovação, que leva 7–10 dias úteis e é **por projeto do Cloud**, não por
API. A API v4 (avaliações e postagens) tem um pedido separado do geral — os
dois precisam ser protocolados.

Como saber em que pé está:

1. Google Cloud Console → APIs e Serviços → Painel → cota da API.
2. No app, o sintoma de allowlist pendente é `SyncRun` com status `PARTIAL` e
   `errorMessage` contendo "allowlist pendente" ou "API v4 sem allowlist".

Enquanto não aprovam, o produto funciona parcialmente **de propósito**: o sync
grava o que consegue em vez de falhar inteiro. Não trate `PARTIAL` como
incidente sem antes conferir a cota.

---

## 2.1 Login com Google (identidade)

Não confunda com a conexão do Business Profile: são dois fluxos com escopos
diferentes.

| | Login social (E1-02) | Conexão GBP |
|---|---|---|
| Onde | `/login` e `/cadastro` | `/conectar` |
| Escopo | identidade básica | `business.manage` |
| Quem gerencia | Supabase Auth | nosso `GoogleConnection`, token cifrado |

Para o botão funcionar: Supabase → Authentication → Providers → Google, com o
client id/secret de um OAuth client do Google Cloud, e o redirect
`https://<projeto>.supabase.co/auth/v1/callback` cadastrado lá. Sem isso o
botão devolve "provider is not enabled".

**Recuperação de senha** usa o template de e-mail do próprio Supabase
(Authentication → Email Templates → Reset Password). O link precisa apontar
para `/auth/callback?proximo=/nova-senha`, que é o que a tela
`/recuperar-senha` já envia como `redirectTo` — confira se a URL está na lista
de Redirect URLs permitidas do projeto, senão o link volta para a home.

## 3. Billing das APIs

| API | Modelo | O que estoura primeiro |
|---|---|---|
| Google Business Profile | cota por projeto | requisições/minuto no sync de contas grandes |
| Places API (New) | por consulta | snapshot semanal de concorrentes |
| SerpApi | 100 buscas/mês no grátis | Análise de Mercado |
| Google Ads (Keyword Planner) | operações/dia, sem custo por consulta | volume de palavras-chave |
| Mangools (KWFinder) | keyword lookups do plano | volume, quando é a fonte ativa |
| Anthropic | por token | gerações de texto |

O rate limiting da aplicação (`src/lib/rate-limit.ts`) protege por conta e por
hora: SerpApi 10, Places 30, IA 40, volume de busca 12. Ajuste os números lá —
é o único lugar.

### 3.0 Escolha da fonte de volume

`VOLUME_PROVIDER` decide: `google-ads` ou `mangools`. Em branco, usa o Google
Ads quando configurado e cai no Mangools. Nenhuma fonte configurada não é erro
— a tela mostra "volume indisponível" e o resto do módulo funciona.

| Fonte | Burocracia | Custo | Precisão |
|---|---|---|---|
| Google Ads | MCC + aprovação do developer token | zero | média fechada, com conta que investe |
| Mangools (KWFinder) | só a chave de API | plano da conta (há plano gratuito) | número público do Planner, arredondado |

O Mangools é ponte, não destino: ele revende o mesmo dado do Keyword Planner,
mas a versão pública dele. Quando o developer token sair, troque
`VOLUME_PROVIDER` para `google-ads` — nada mais muda.

Verificação, para qualquer uma das duas:

```bash
pnpm volume:testar
pnpm volume:testar "pizzaria bh"
```

**Mangools:** o token aparece em `mangools.com/api-token` mesmo no plano
gratuito, mas o que varia entre planos é o limite de *keyword lookups* — 401 e
403 costumam ser plano sem acesso à API, e 429 é limite atingido. Requisição
idêntica dentro de 24h não conta de novo, então repita a mesma consulta ao
depurar em vez de variar o termo.

### 3.1 Google Ads (Keyword Planner)

O destino. Quatro variáveis:
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`,
`GOOGLE_ADS_REFRESH_TOKEN` e, quando a conta é gerenciada por uma MCC,
`GOOGLE_ADS_LOGIN_CUSTOMER_ID`. O client OAuth é o mesmo do resto
(`GOOGLE_CLIENT_ID`/`SECRET`), mas o refresh token é próprio, com escopo
`https://www.googleapis.com/auth/adwords`.

Três armadilhas, em ordem de frequência:

1. **Developer token em nível Explorer.** O token sai automaticamente nesse
   nível, e ele **não** libera o Keyword Planner: a resposta é 403 com
   `DEVELOPER_TOKEN_NOT_APPROVED` e a mensagem "not allowed for use with
   explorer access". Peça **acesso básico** em Ferramentas e configurações →
   Central de API, na MCC. Nenhum ajuste de configuração contorna isso.

   Cuidado para não confundir os dois 403 possíveis: com `login-customer-id`
   preenchido, um gerente que ainda não gerencia a conta responde
   `USER_PERMISSION_DENIED`, que **mascara** o erro do token. Para saber qual
   é qual, teste sem o `login-customer-id` — se o usuário tem acesso direto à
   conta (confira em `customers:listAccessibleCustomers`), ele nem é
   necessário.
2. **Precisão depende do investimento.** Conta sem gasto relevante recebe
   faixas ("1 mil – 10 mil") em vez da média fechada. É por isso que a conta
   configurada aqui deve ser a que de fato investe, não uma conta limpa criada
   para a integração.
3. **Versão da API expira.** `VERSAO` em `src/lib/google/ads.ts` e em
   `scripts/testar-volume.ts` (hoje `v21`)
   é aposentada em cerca de um ano e a chamada passa a responder 404
   `UNSUPPORTED_VERSION`. É o motivo mais comum de uma integração que
   funcionava parar sozinha — confira a versão antes de suspeitar de
   credencial.

Volume nulo na tela não é necessariamente erro: o Google não tem dado para todo
termo, e `volumeSyncedAt` avança mesmo assim para o job não reconsultar o mesmo
termo eternamente.

### 3.2 Como obter as credenciais do Google Ads

Ordem importa: sem MCC não existe Central de API, e sem developer token
aprovado o refresh token não serve para nada.

**1. Conta de administrador (MCC), se ainda não houver**

A Central de API só aparece em conta de administrador. Se a conta que investe é
avulsa, crie uma MCC em `ads.google.com/home/tools/manager-accounts` e vincule
a conta existente a ela (na MCC: Contas → Vincular conta existente; o dono da
conta aceita o convite). Nada muda nas campanhas.

**2. Developer token**

Na MCC: Ferramentas e configurações → Configuração → **Central de API**. O
token aparece na hora, com nível **Teste** — que responde apenas sobre contas
de teste e devolve dado irreal. Na mesma tela, solicite **Acesso básico**: é um
formulário sobre a empresa e o uso pretendido. Descreva o uso real (ferramenta
interna que consulta volume de busca do Keyword Planner para clientes da
agência). A aprovação costuma levar de um a alguns dias úteis; conta com
investimento ativo ajuda.

→ `GOOGLE_ADS_DEVELOPER_TOKEN`

**3. Customer IDs**

O número de 10 dígitos no topo da tela do Google Ads, no formato
`123-456-7890`. **Grave só os dígitos.**

- `GOOGLE_ADS_CUSTOMER_ID` — a conta que será consultada, que deve ser a que
  investe (é o gasto dela que destrava a média fechada).
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` — o id da **MCC**, obrigatório quando a conta
  acima é gerenciada por ela. Conta avulsa não precisa.

**4. Habilitar a API e preparar o client OAuth**

No mesmo projeto do Google Cloud que já usa o Business Profile:

1. APIs e Serviços → Biblioteca → ative **Google Ads API**.
2. Tela de consentimento OAuth → adicione o escopo
   `https://www.googleapis.com/auth/adwords`.
3. Credenciais → o client OAuth existente → em URIs de redirecionamento
   autorizados, adicione `https://developers.google.com/oauthplayground`.

⚠️ **Se a tela de consentimento estiver em "Testing", o refresh token expira em
7 dias** e a integração morre sozinha em uma semana. Publique o app (status
"Em produção") antes de gerar o token definitivo.

**5. Refresh token**

Em `developers.google.com/oauthplayground`:

1. Engrenagem → marque **Use your own OAuth credentials** → cole o
   `GOOGLE_CLIENT_ID` e o `GOOGLE_CLIENT_SECRET`.
2. Passo 1: em vez de escolher da lista, digite o escopo
   `https://www.googleapis.com/auth/adwords` → **Authorize APIs**.
3. Entre com a conta Google que **tem acesso à conta de Ads** — não é
   necessariamente a mesma do Business Profile.
4. Passo 2: **Exchange authorization code for tokens** → copie o
   *refresh token*.

→ `GOOGLE_ADS_REFRESH_TOKEN`

**6. Conferir**

```bash
pnpm volume:testar                 # termo padrão
pnpm volume:testar "pizzaria bh"   # termo específico
```

O script renova o token, faz a chamada real e traduz os erros comuns em causa
provável (token em nível de teste, escopo errado, versão aposentada, id com
hífen). Se o volume vier sempre redondo — 1000, 10000 —, é a conta sem gasto
suficiente, não bug.

**Quando a cota estourar:** o cliente HTTP (`src/lib/http.ts`) trata 429 com
backoff e não derruba o job. Um 429 recorrente aparece no log da Vercel com o
nome da API. Suba o plano da API ou baixe o limite em `LIMITES`.

---

## 4. Incidentes comuns

### 4.1 `P1001: Can't reach database server`

**Causa quase certa:** `DIRECT_URL` apontando para `db.<projeto>.supabase.co`.
Esse host só tem registro AAAA — é IPv6 puro, e a maioria das redes não tem
saída IPv6.

```bash
host -t A db.<projeto>.supabase.co   # "has no A record" confirma
```

**Correção:** use o session pooler, porta 5432 do mesmo host do `DATABASE_URL`,
com usuário `postgres.<projeto>`. Não é a mesma coisa que a porta 6543, que é
modo transação e quebra o DDL das migrations.

Se o host estiver certo e ainda falhar: projeto pausado por inatividade
(Supabase → Project Settings → geral) ou senha rotacionada.

### 4.2 Um negócio parou de atualizar

1. `SELECT * FROM sync_runs WHERE "businessId" = '...' ORDER BY "startedAt" DESC LIMIT 10;`
2. Leia `status` e `errorMessage`:
   - `PARTIAL` + "allowlist" → seção 2, não é incidente.
   - `FAILED` + "token revogado"/"REVOKED" → o cliente revogou o acesso no
     Google. Ele precisa reconectar em `/conectar`.
   - Nenhuma linha recente → o job não rodou: seção 4.3.
3. Sync manual: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/sync-diario`

### 4.3 Os jobs pararam de rodar

Sintoma: `sync_runs` sem linhas novas, e `/api/cron/monitor-jobs` gerando
alertas de "sem sincronização há mais de 36 horas".

Verifique, nesta ordem:

1. Vercel → Project → Cron Jobs: o agendamento existe e está ativo? Crons são
   desabilitados automaticamente em projetos no plano Hobby ociosos.
2. `CRON_SECRET` mudou sem atualizar a env de produção? O sintoma é 401.
3. Execução travada em `RUNNING`: o lock expira sozinho em 30 minutos. Para
   destravar antes:
   ```sql
   UPDATE sync_runs SET status = 'FAILED', "finishedAt" = now()
   WHERE status = 'RUNNING' AND "startedAt" < now() - interval '30 minutes';
   ```

### 4.4 Pagamento aprovado mas o plano não mudou

O estado da assinatura só muda pelo webhook. Verifique:

1. Stripe → Developers → Webhooks: a entrega falhou (não-2xx)? O Stripe
   reentrega sozinho por até 3 dias.
2. `SELECT * FROM stripe_events ORDER BY "processedAt" DESC LIMIT 20;` — se o
   evento não está lá, ele não chegou; se está, foi processado.
3. `STRIPE_WEBHOOK_SECRET` da produção é o do endpoint de produção? O segredo
   do `stripe listen` local é diferente e causa 400 "assinatura inválida".

### 4.5 E-mails não chegam

Sem `RESEND_API_KEY`, o envio é ignorado com aviso no log — por decisão, não
por bug: convite continua válido (o link aparece na tela) e alerta continua na
central. Com a chave configurada, o suspeito seguinte é o `EMAIL_FROM`: o
domínio precisa estar verificado no Resend, e `onboarding@resend.dev` só
entrega para o dono da conta.

---

## 5. Rotação de segredos

Ordem importa: rotacione, atualize a env, **depois** reimplante.

| Segredo | Onde gerar | Efeito colateral |
|---|---|---|
| Senha do banco | Supabase → Database → Reset password | atualizar `DATABASE_URL` **e** `DIRECT_URL` |
| `CRON_SECRET` | `openssl rand -hex 32` | crons falham com 401 até o redeploy |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` | **destrutivo**: torna ilegível todo token OAuth já gravado; todos os clientes precisam reconectar. Ver 5.1 |
| Chaves Google/SerpApi/Anthropic | console de cada provedor | nenhum, se trocado sem intervalo |
| `GOOGLE_ADS_REFRESH_TOKEN` | OAuth Playground, escopo `adwords` | revogar o antigo no Google só depois do deploy |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | revogar a antiga só depois do deploy |
| Service role do Supabase | Supabase → API | ignora RLS: trate como senha do banco |

### 5.1 Trocar a ENCRYPTION_KEY sem quebrar tudo

Não existe caminho automático hoje. O formato do valor cifrado é
`v1.<iv>.<tag>.<cifra>` — o prefixo de versão existe justamente para permitir
uma rotação com duas chaves (decifra com a antiga, cifra com a nova). Se a
rotação for necessária, implemente esse caminho **antes**; trocar a chave direto
obriga todos os clientes a refazer o OAuth.

---

## 6. Backup e restore

O Supabase faz backup automático diário (retenção conforme o plano; o plano
gratuito não garante). Antes de qualquer migration destrutiva, backup manual:

```bash
pg_dump "$DIRECT_URL" --no-owner --format=custom --file=backup-$(date +%F).dump
```

Restore em um projeto novo:

```bash
pg_restore --dbname="$DIRECT_URL_DESTINO" --no-owner --clean --if-exists backup-2026-01-01.dump
```

Depois de restaurar, rode `sql/999_verify.sql` e confira: tabelas, enums, FKs,
defaults de `id`, triggers de `updatedAt`, e as linhas de `plans` e
`segment_benchmarks` — sem os planos, nenhum provisionamento de usuário novo
funciona.

**O que o backup do banco não cobre:** os tokens OAuth continuam cifrados com a
`ENCRYPTION_KEY`. Restaurar o banco em um ambiente com outra chave devolve
tokens ilegíveis. Guarde a chave junto da política de backup, no gerenciador de
segredos — nunca no dump.

---

## 7. Deploy

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # o que o CI roda
pnpm db:migrate                                          # migrations, antes do deploy
```

Migrations rodam contra o `DIRECT_URL` (session pooler) e são aplicadas
**antes** do código novo subir — o inverso deixa o app pedindo colunas que não
existem.

Previews da Vercel precisam apontar para um banco de staging. Nunca reaproveite
a env de produção em preview: qualquer PR passaria a escrever no banco real.

---

## 8. Checklist de go-live

- [ ] Allowlist do Google aprovado (geral **e** v4)
- [ ] Produtos e preços criados no Stripe (`pnpm stripe:precos`) e webhook registrado
- [ ] Preços e limites dos planos revisados por quem vende (não os do seed)
- [ ] `RESEND_API_KEY` e domínio verificado
- [ ] Todos os segredos de desenvolvimento rotacionados (seção 5)
- [ ] Env de preview apontando para banco de staging
- [ ] Monitor externo apontado para `/api/cron/monitor-jobs`
- [ ] Backup manual feito e restore testado ao menos uma vez
