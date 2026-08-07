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
| DataForSEO | pré-pago, exige billing ativo | volume de palavras-chave |
| Anthropic | por token | gerações de texto |

O rate limiting da aplicação (`src/lib/rate-limit.ts`) protege por conta e por
hora: SerpApi 10, Places 30, IA 40. Ajuste os números lá — é o único lugar.

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
| Chaves Google/SerpApi/DataForSEO/Anthropic | console de cada provedor | nenhum, se trocado sem intervalo |
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
