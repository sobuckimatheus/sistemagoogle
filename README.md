# Painel GBP

SaaS de gestão e otimização de Perfil de Empresa no Google, para donos de negócio local e agências.

- [PRD-gbp-dashboard.md](PRD-gbp-dashboard.md) — escopo da V1, riscos das integrações, fases
- [fluxo-ux.md](fluxo-ux.md) — fluxo de experiência do usuário
- [TASKS.md](TASKS.md) — backlog com 11 épicas e critérios de aceite
- [RUNBOOK.md](RUNBOOK.md) — operação, incidentes, rotação de segredos, restore

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Auth + Postgres) · Prisma 7 · Tailwind 4

## Começando

```bash
pnpm install
cp .env.example .env    # preencha os valores
pnpm db:generate
pnpm dev
```

O app não sobe sem as variáveis obrigatórias — a validação em `src/lib/env/`
falha no boot dizendo exatamente qual está faltando. As integrações que ainda
não têm credencial (Google, SerpApi, Google Ads, Anthropic, Stripe) estão como
opcionais e passam a ser exigidas conforme cada épica avança.

## Duas conexões com o banco, de propósito

O Supabase expõe caminhos diferentes para o mesmo Postgres, e o projeto usa os
dois:

| Variável | Host / porta | Quem usa | Por quê |
|---|---|---|---|
| `DATABASE_URL` | pooler, 6543 | runtime, via driver adapter em `src/lib/prisma.ts` | transaction pooler; sem ele cada invocação serverless abre conexão nova e esgota o banco |
| `DIRECT_URL` | pooler, 5432 | migrations, via `prisma.config.ts` | session pooler; a porta 6543 é modo transação e quebra o DDL que o migrate emite |

**Não use `db.<projeto>.supabase.co` no `DIRECT_URL`.** Esse host de conexão
direta só tem registro AAAA — é IPv6 puro. Em rede sem saída IPv6 (a maioria
das residenciais e boa parte dos CIs) o Prisma falha com `P1001: Can't reach
database server`, que parece projeto pausado ou firewall e não é nenhum dos
dois. O session pooler, na porta 5432 do mesmo host do `DATABASE_URL`, atende
por IPv4 e suporta o DDL das migrations.

No Prisma 7 as URLs não ficam mais no `schema.prisma` — o schema só declara o
provider.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | servidor de desenvolvimento (Turbopack) |
| `pnpm build` | build de produção |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | gera o Prisma Client |
| `pnpm db:migrate` | aplica migrations (`migrate deploy`) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm test` | testes unitários |
| `pnpm test:integration` | testes contra um Postgres efêmero |
| `pnpm test:e2e` | E2E com Playwright |
| `pnpm volume:testar` | diagnostica a fonte de volume de busca |
| `pnpm stripe:precos` | cria produtos e preços no Stripe |

`SKIP_ENV_VALIDATION=1` desliga a validação de env — existe para CI e para
build sem acesso aos segredos, nunca para runtime.

## Estrutura

```
prisma/
  schema.prisma       25 models: multi-tenant, OAuth, série histórica, billing
  migrations/         0_init, 1_defaults, 2_seed, 3_lacunas, 4_billing, 5_rate_limit
sql/                  os mesmos SQL aplicados manualmente + verificação
src/
  app/                rotas (App Router)
    api/cron/         jobs protegidos por CRON_SECRET
    login, cadastro, recuperar-senha, nova-senha
    conta/            configurações da conta, membros, convites e plano
    convite/[token]/  aceite de convite
    negocio/[id]/     módulos de produto de cada negócio
  lib/
    env/              validação das variáveis: client.ts e server.ts, separados
    prisma.ts         client singleton com driver adapter
    supabase/         clients de browser, server e middleware
    sync/             sincronização, alertas e registro de execução dos jobs
    volume/           fontes de volume de busca, trocáveis por env
    billing/          Stripe, planos e regras de acesso por assinatura
  middleware.ts       renovação de sessão e proteção de rotas
```

## Jobs e o registro de execução

Os três crons (`vercel.json`) gravam em `sync_runs`: início, fim, itens
processados e erro. É o que responde "por que este negócio ficou dois dias sem
dado" sem depender do log da plataforma, que expira.

O mesmo registro serve de lock: uma execução `RUNNING` para o mesmo job e
negócio faz a invocação seguinte pular em vez de duplicar o trabalho. Execução
`RUNNING` parada há mais de 30 minutos é considerada abandonada — processo
serverless morre sem chegar ao `finally`, e sem esse prazo o negócio ficaria
travado para sempre.

`/api/cron/monitor-jobs` vigia a **ausência** de execução, que é o modo de
falha que ninguém percebe: job que quebra grava FAILED e gera alerta, job que
para de ser agendado não gera nada e a tela segue mostrando dado velho como se
fosse de hoje. Aponte também um monitor externo para essa rota — um vigia que
depende do mesmo cron que ele vigia não vigia nada.

## Volume de busca

`Keyword.volume` vem do Keyword Planner do Google, por uma de três fontes
trocáveis em `VOLUME_PROVIDER` (`src/lib/volume/`):

| `VOLUME_PROVIDER` | Custo | Precisão | Depende de |
|---|---|---|---|
| `google-ads` | zero | média fechada, com conta que investe | developer token aprovado |
| `dataforseo` | pago por consulta | fechada (contas de Ads deles) | saldo na conta |
| `mangools` | plano da conta | número público, arredondado | plano que libere a API |

O Google Ads é o destino: mesmo dado, de graça e na origem. Os outros dois
existem porque a aprovação do developer token não depende de nós — pode
demorar semanas ou ser recusada.

Isso **não** substitui o SerpApi, que faz outra coisa: posição no Maps para a
Análise de Mercado. Volume e ranking são dados diferentes, não fontes
concorrentes.

O volume é buscado na criação do termo, por um botão manual e pelo job mensal
`/api/cron/volume-keywords` — o Keyword Planner publica média mensal, então
consultar com mais frequência gastaria operação para reescrever o mesmo número.

## Página isca (a raiz, e `/verificador`)

**A raiz serve duas páginas.** Sem sessão é a isca; com sessão é o painel. A
pergunta "em que posição minha empresa aparece?" é o que traz a pessoa, e
mandá-la para um formulário de login antes de responder perde a visita.
`/verificador` continua existindo para campanhas e links diretos.

Por isso a raiz saiu da proteção do middleware — e lá a comparação é por
**igualdade**, nunca por prefixo: `startsWith("/")` valeria para toda rota e
abriria o produto inteiro.

Travas contra abuso, em `src/lib/rate-limit.ts`:

| Trava | Padrão | Variável | Por quê |
|---|---|---|---|
| autocomplete por IP | 30/h | `LIMITE_ANONIMO_AUTOCOMPLETE` | Places API é cobrada por consulta |
| busca por IP | 5/h | `LIMITE_ANONIMO_BUSCA` | uma pessoa não precisa de mais para se convencer |
| **teto global** | 300/dia | `LIMITE_ANONIMO_BUSCA_DIA` | limite por IP não segura robô: IP é barato de trocar |

**`0` desliga a trava** — existe para a fase de testes, não para produção
aberta. Vazio usa o padrão.

O teto global protege o saldo pré-pago. Cada verificação mede 25 pontos e
custa US$ 0,05, então 300/dia é um pior caso de US$ 15/dia: perde-se um dia de
campanha, não a conta. **Multiplique por 0,05 antes de mexer nesse número**, e
se a fonte voltar a ser o SerpApi baixe drasticamente — lá são 100 buscas por
mês, ou seja, quatro verificações.

Quem está logado não passa por nenhuma dessas travas: já paga pela cota.

## Visibilidade, não posição

Medir a posição a partir do endereço do próprio negócio dá **sempre primeiro
lugar**: a distância é zero e o Maps ordena por proximidade além de
relevância. Medido assim, todo cliente se sente líder — e um número que nunca
dói não vende nada.

`src/lib/ranking/grade.ts` mede **25 pontos** (grade 5x5, 1,5 km entre pontos —
cantos a 4,2 km) e calcula duas coisas:

- **Visibilidade** — média de `(21 − posição) / 20` sobre os pontos onde há
  mercado; ausência conta zero.
- **Posição na região** — a colocação do negócio no ranking regional: todos os
  concorrentes recebem a média das posições deles nos mesmos 25 pontos, a
  lista é ordenada por essa média e então numerada 1, 2, 3…

**A manchete é a colocação na própria lista que a tela mostra** — literalmente
o mesmo número, então não há como divergirem. Duas tentativas anteriores
falharam nisso: a lista vinha de um ponto só (o negócio aparecia em 1º com
manchete 14º), e depois exibia a média arredondada (várias linhas seguidas com
"12º", como se fossem empate).

A média com fração fica guardada no histórico, onde serve para comparar duas
medições — entre 3,2 e 3,8 há progresso que o inteiro esconderia.

Pontos onde o Google não devolve resultado nenhum ficam **fora da conta**:
área sem esse tipo de negócio não é culpa de quem está sendo medido, e contar
puniria quem tem mato em volta.

**Calibração contra o Localo**, dois negócios reais:

| Espaçamento | Dra. Samantha (Localo: 3) | Somare (Localo: 16) |
|---|---|---|
| 3 km | 7,4 | 14,9 |
| **1,5 km** | **3,7** | 9,8 |

Nenhum espaçamento único reproduz os dois: o Localo distribui os pontos de
forma não uniforme, densos no centro e esparsos fora. Ficamos com 1,5 km
porque numa grade de 3 km os cantos caem a 8,5 km, e as ausências de lá
afundavam a média de quem domina a própria cidade.

**O número depende da área medida** — é decisão de produto, não fato da
natureza. Ampliar a grade piora a posição de todo mundo; estreitar melhora. O
que não muda é a ordem relativa: quem está mal continua atrás.

A lista de concorrentes usa a **mesma conta**: cada um aparece com sua
posição média nos mesmos 25 pontos. Antes ela vinha de um ponto só — o
endereço do negócio analisado, onde ele é sempre primeiro —, e a tela dizia
"sua posição média é 14º" logo acima de uma lista em que ele figurava em 1º.

**Custo: US$ 0,05 por verificação** (25 × US$ 0,002). É o número a multiplicar
antes de mexer no teto diário em `LIMITES`.

## Posição no Maps

`src/lib/ranking/` escolhe a fonte, com a mesma ideia da camada de volume:

| Fonte | Custo | Traz foto | Observação |
|---|---|---|---|
| DataForSEO (padrão) | US$ 0,002/busca | sim (`main_image`) | `place_id` compatível com o autocomplete |
| SerpApi (reserva) | 100 buscas/mês no grátis | não | não sustenta página pública |

**A Places API não serve para isso.** Ela devolve lugares que casam com um
texto, ordenados por relevância *da API* — não é a lista que o usuário vê no
Maps. Usar essa ordem como "sua posição" seria inventar um número.

A foto do negócio selecionado também vem do DataForSEO: a Places API não
devolve `photos` para a chave deste projeto (RUNBOOK §3.05), e a busca extra
custa US$ 0,002 — barato o bastante para o cartão parecer real.

## Limites de uso

`src/lib/rate-limit.ts` protege a fatura, não o servidor: um botão de análise
clicado em loop queima as 100 buscas mensais do SerpApi em dois minutos. O
contador fica no banco porque cada invocação serverless tem a própria memória —
um limite em memória seria multiplicado pelo número de instâncias quentes.
Janela deslizante, por conta e por recurso; os números estão todos em `LIMITES`.

## Billing

Checkout e portal do Stripe em `/conta/plano`; o webhook fica em
`/api/stripe/webhook`. Duas decisões que valem saber antes de mexer:

- **Quem muda o estado da assinatura é o webhook, não o retorno do navegador.**
  A URL de sucesso qualquer um digita; o evento assinado, não.
- **`stripe_events` é a idempotência.** O id do evento é gravado como chave
  primária antes do processamento — o Stripe reentrega em timeout e pode
  entregar duas vezes em paralelo, e a violação de unicidade é a única
  checagem atômica disponível. Se o processamento falhar, a linha é removida
  para que a reentrega tenha efeito.

Inadimplência não apaga dado (`src/lib/billing/plano.ts`): PAST_DUE e CANCELED
mantêm leitura completa do histórico; o que trava é criar, publicar e gastar
cota paga. PAST_DUE ainda sincroniza — o Google não reentrega histórico fora
da janela dele, então parar por um cartão vencido é dano permanente.

Para o checkout funcionar de fato faltam dois passos operacionais: criar os
produtos no Stripe e preencher `Plan.stripePriceId` (E9-01/E9-02 no
[TASKS.md](TASKS.md)). Sem `STRIPE_SECRET_KEY` a tela de planos ainda abre,
explicando que o checkout está indisponível.

O webhook precisa ser registrado no Stripe apontando para
`/api/stripe/webhook`, ouvindo `checkout.session.completed`,
`customer.subscription.*` e `invoice.payment_failed`. Em desenvolvimento:
`stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Testes

Três suítes, com custos diferentes de rodar:

| Suíte | Precisa de | O que só ela pega |
|---|---|---|
| `pnpm test` | nada | fórmulas estimadas, auditoria, criptografia, regras de plano, e a auditoria estática de isolamento |
| `pnpm test:integration` | Postgres efêmero | o lock dos jobs (advisory lock em transação), idempotência do provisionamento, janela do rate limit |
| `pnpm test:e2e` | Postgres + navegador | cadastro até o primeiro painel, com um Supabase Auth de mentira |

A suíte de integração recusa rodar contra host que não seja local ou banco sem
`test` no nome — duas checagens, porque um banco chamado `..._test` hospedado
remotamente ainda seria o banco de alguém.

## E-mail

Convite de equipe e alerta crítico saem pelo Resend. Sem `RESEND_API_KEY` o app
funciona igual: o convite continua válido e o link aparece na tela para copiar,
e o alerta continua na central — só o e-mail não sai.

## Estado atual

Fundação (E0), autenticação e multi-tenant (E1), conexão com o Google (E2),
integrações (E3), jobs (E4), dashboard (E5), módulos de produto (E6–E8), o
código de billing (E9-03 a E9-07) e a parte de qualidade da E10 que não depende
de infraestrutura nova (E10-01, E10-04, E10-05, E10-06 parcial, E10-08).

Falta: os passos operacionais do Stripe (E9-01/E9-02), a política de downgrade
(E9-08, pendente de decisão de produto), testes de integração com banco efêmero
(E10-02), E2E com Playwright (E10-03), Sentry (E10-06) e os itens de deploy e
rotação de segredos (E10-07/E10-09). Ver [TASKS.md](TASKS.md) e o
[RUNBOOK.md](RUNBOOK.md).
