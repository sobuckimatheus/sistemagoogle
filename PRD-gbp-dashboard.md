# PRD — Plataforma de Gestão de Google Meu Negócio (nome provisório: "Painel GBP")

## 1. Contexto e motivação

Hoje o Bethel Marketing (criadorsite) tem um módulo de Google Meu Negócio embutido no
painel do site builder, com: conexão OAuth por mentorado, edição de Perfil (nome, telefone,
site, descrição, horários, endereço, categorias, serviços), Avaliações (listar + responder
com rascunho de IA), Desempenho (Performance API, sem histórico salvo), Auditoria (nota
0-100 + checklist calculado na hora), Concorrentes (Places API), Rank no Mapa (grid via
SerpApi) e Análise Mercado (busca de negócio + rank por palavra-chave + volume via
DataForSEO).

Esse módulo provou o conceito e validou as integrações (todas funcionando em produção).
O objetivo agora é **extrair isso para um produto standalone**, no modelo de
Localo/Lumora: um SaaS dedicado a otimização de Perfil de Empresa no Google, vendido a
donos de negócio local e agências, com um dashboard central de métricas e valor percebido
alto (visual "AAA", números grandes, estimativas de receita perdida).

## 2. Problema

Donos de negócio local não sabem:
- Se o perfil do Google está bem otimizado (ou o que falta).
- Se estão ranqueando bem no Maps para as buscas que importam.
- Se estão respondendo avaliações a tempo, e como isso afeta o ranking.
- Quanto tráfego/ligações/rotas o Google está gerando, e se está crescendo.
- Como estão perante a concorrência direta.

Agências (como a Bethel) precisam de uma ferramenta para **provar valor** ao cliente com
números concretos e management assistido por IA (responder avaliação, gerar plano de ação),
sem depender de ferramentas caras de terceiros (Localo, BrightLocal).

## 3. Público-alvo

- **Primário:** dono de pequeno negócio local (clínica, salão, estúdio, prestador de
  serviço) que já tem um Perfil de Empresa no Google.
- **Secundário:** agências/consultores de marketing local que gerenciam vários clientes
  (multi-tenant: 1 agência → N negócios).

## 4. Objetivos e métricas de sucesso (produto)

- Ativação: % de contas que completam a conexão OAuth + primeiro sync em < 5 min.
- Retenção: uso semanal do dashboard (o "vs. mês anterior" só faz sentido com retorno
  recorrente).
- Ação: % de avaliações respondidas em até 48h (métrica que o próprio produto expõe).
- Upsell: número de negócios conectados por conta de agência.

## 5. Escopo da V1

### 5.1 Onboarding e conexão
- Login/cadastro (e-mail+senha ou Google) do usuário da plataforma (dono de agência ou
  do negócio).
- **Conectar Google Meu Negócio via OAuth** (decisão confirmada — ver seção 9).
- Após conectar: listar os Perfis de Empresa (locations) disponíveis na conta Google e
  permitir selecionar quais rastrear (suporta 1 ou vários negócios por conexão, para
  agências).
- Sync inicial: captura o primeiro snapshot completo do perfil (dados usados na Auditoria
  e no Dashboard).

### 5.2 Dashboard principal (a tela "Lumora")
Cards de topo (todos com comparação vs. período anterior, exige série histórica):
- Nota geral do perfil (0–100, nosso cálculo de Auditoria).
- Visualizações, Ligações, Solicitações de rota, Cliques no site (Performance API).
- Avaliações: nota média + contagem total.

Blocos abaixo:
- **Receita perdida (estimativa)** — métrica calculada, não vem do Google (ver 5.9).
- **Principais motivos** — derivado do checklist/auditoria (top itens pendentes,
  ordenados por peso).
- **Desempenho financeiro estimado** — faturamento atribuído ao Google (estimativa),
  clientes conquistados, ticket médio.
- **Fontes de receita** — proporção Search vs Maps vs Direct (a partir do
  impressionsBreakdown que já calculamos, com estimativa de conversão em receita).
- **Conversão do perfil** — visualizações → ação (ligação+rota+clique site) / views,
  comparado a uma "média do segmento" (ver 5.9, precisa de benchmark).
- **Maior oportunidade agora** — 1 recomendação de maior impacto, gerada por IA a partir
  da auditoria (já existe essa lógica, só precisa virar "destaque").

### 5.3 Perfil & Auditoria
Reaproveita 1:1 o que já existe: editar nome/telefone/site/descrição/horários/
endereço/categorias/serviços via Business Information API; nota 0–100 + checklist com
pesos (categoria, descrição, horários, serviços, endereço, nº avaliações, nota média,
% respondidas).
**Novo:** salvar o resultado da auditoria como snapshot (`AuditSnapshot`) toda vez que
rodar, para exibir evolução da nota no tempo.

### 5.4 Avaliações
Reaproveita 1:1: listar via API v4, gerar rascunho de resposta com IA (tom configurável
por negócio), publicar/editar resposta.
**Novo:** cache local das reviews (`Review`) para não depender de nova chamada à API v4 a
cada carregamento do dashboard, e para alimentar Alertas (nova avaliação, avaliação
negativa) e a métrica "% respondidas em 48h" com precisão histórica.

### 5.5 Desempenho
Reaproveita a lógica de agregação por métrica (visualizações, ligações, rotas, cliques,
conversas, agendamentos) e o breakdown Search vs Maps.
**Novo, crítico:** persistir os pontos diários (`PerformanceDaily`) via job periódico, em
vez de só buscar ao vivo — é o que permite o gráfico de evolução, o "vs. mês anterior" real
(hoje calculado só no momento da consulta) e comparar qualquer intervalo de datas sem
esperar a API responder toda vez.

### 5.6 Concorrentes
Reaproveita: Places API (New) para achar concorrentes por categoria+cidade, mantendo a
ordem de relevância do Google (não reordenar por nota/score, conforme feedback do
usuário no sistema atual). Mostrar nº de avaliações como referência.
**Novo:** snapshot periódico (`CompetitorSnapshot`) para mostrar evolução do concorrente
(está crescendo mais rápido que eu?).

### 5.7 Rank Tracking (SerpApi)
Duas modalidades já validadas no sistema atual:
- **Rank simples / grid pequeno** (3x3, 5x5) a partir da localização do próprio negócio,
  com ranking competitivo (todos os negócios vistos na grade, ordenados por posição
  média + cobertura).
- **Análise de Mercado**: busca de QUALQUER negócio pelo nome (útil para prospecção —
  agência analisa um lead antes de fechar contrato), palavra-chave sugerida por IA ou
  digitada, retorna posição + ranking completo da cidade (ordem real do Google, sem
  reordenar).

**Novo:** histórico de checagens (`RankCheck` + `RankCheckPoint`) para o usuário
comparar a evolução do rank por palavra-chave ao longo do tempo (é o principal recurso
pago do Localo — "veja como melhorou depois das minhas ações").

### 5.8 Palavras-chave e volume de busca
Reaproveita: sugestão de keywords por IA (baseada em categoria+cidade) e volume mensal
via DataForSEO (Google Ads Keyword Planner data), cacheado (`Keyword.volume`,
atualização mensal — volume não muda minuto a minuto).

### 5.9 Métricas estimadas ("growth hacking" do dashboard)
Não existem na API do Google — são fórmulas calculadas em cima dos dados reais, para dar
o efeito "dinheiro na mesa" do dashboard de referência. Definir fórmulas explícitas e
documentadas (não fingir que é dado oficial):
- `receita_atual = clientes_estimados * ticket_medio`, onde
  `clientes_estimados = (ligações + rotas + cliques_site) * taxa_conversao_padrao_segmento`
- `receita_perdida = receita_potencial(benchmark_top_do_segmento) - receita_atual`
- `conversao_do_perfil = (ligações + rotas + cliques_site) / visualizações`
- `benchmark_segmento`: precisa de uma tabela de referência por categoria (ver
  `SegmentBenchmark` no schema) — pode começar com valores fixos por categoria (fonte:
  benchmarks públicos de conversão de GBP) e evoluir para média real da base de clientes
  da plataforma quando houver volume.
- Ticket médio e taxa de conversão devem ser **configuráveis pelo usuário** por negócio
  (campo no onboarding: "qual seu ticket médio?"), com um valor default por categoria se
  não preenchido.

⚠️ Risco de credibilidade: se a estimativa for muito diferente da realidade do cliente,
gera desconfiança. Sempre expor "Entenda como calculamos isso" (link para a fórmula).

### 5.10 Checklist de Ações e Alertas
- `ChecklistItem`: gerado a partir da Auditoria + Recomendações IA, com status
  (open/done/dismissed), permite ao usuário marcar como feito manualmente.
- `Alert`: gerado por job periódico comparando snapshots — nova avaliação, avaliação
  ≤3 estrelas, queda de nota média, sem post/foto nova há N dias, sem sync há N dias
  (token expirado), queda de posição no rank tracking.

### 5.11 Postagens (Google Posts)
Não construído no sistema atual (ficou como "em breve"). V1 do produto standalone:
criar/agendar/publicar Google Posts via API v4 (`localPosts`), com geração de texto por
IA. Persistir em `Post` com estado (draft/scheduled/published) para o dashboard mostrar
"frequência de postagem" (é citado como "principal motivo" no dashboard de referência).

### 5.12 Relatórios
Exportar PDF/CSV do dashboard por período — feature de fechamento de ciclo com cliente
(mensal). V1 pode ser server-side render do próprio dashboard para PDF; não precisa de
template dedicado no MVP.

## 6. Fora de escopo da V1

- Gestão de fotos do perfil (upload via API v4 `media`) — variação do que já existe em
  Posts, mas API de mídia tem particularidades próprias; adiar.
- Multi-idioma.
- App mobile nativo.
- Integração de billing além de "1 plano pago simples" (Stripe checkout básico).
- Grid de rank tracking grande (7x7+) — custo de SerpApi não compensa até validar
  demanda paga.
- Backlinks / SEO de site (fora do escopo de "Google Meu Negócio").

## 7. Arquitetura de alto nível

- **Multi-tenant real desde o início:** `Account` (a agência ou o dono individual) → N
  `Business` (cada Perfil de Empresa rastreado) → 1 `GoogleConnection` por Business (o
  Google exige que a autorização seja por conta Google conectada; uma `GoogleConnection`
  pode listar múltiplos `Business` se a conta Google tiver acesso a vários locais, mas
  cada `Business` guarda o vínculo explícito para simplificar consultas).
- **Job de sync periódico (cron)** é obrigatório para o produto funcionar como descrito
  (histórico, alertas, "vs. período anterior"). Sugestão: sync diário de
  Performance/Reviews/Auditoria, sync semanal de Concorrentes/Rank (mais caro em API).
- **APIs externas usadas** (todas já integradas e validadas no sistema atual):
  - Google **My Business Account Management API** — listar contas/locais.
  - Google **Business Information API** — ler/editar perfil (nome, categoria, horário,
    endereço, serviços, descrição).
  - Google **Business Profile Performance API** — métricas diárias + palavras-chave de
    busca (`searchkeywords/impressions/monthly`).
  - Google **My Business API v4 (legada)** — única fonte de avaliações e posts; exige
    allowlist separado.
  - Google **Places API (New)** — dados públicos de concorrentes (nome, nota, nº
    avaliações, categoria, site, horários); requer billing ativo no Google Cloud.
  - **SerpApi** — ranking real do Google Maps por palavra-chave/localização (rank
    tracking e "Análise Mercado"), sem OAuth, cota grátis 100/mês.
  - **DataForSEO** — volume de busca mensal (Google Ads Keyword Planner); requer conta
    com billing ativado (não funciona nem em sandbox sem isso).
  - **Claude (Anthropic)** — geração de rascunho de resposta a avaliação, recomendações
    de auditoria, sugestão de palavras-chave, geração de posts.

## 8. Riscos e constraints técnicas conhecidas (lições do sistema atual)

- **Aprovação de allowlist do Google**: Business Profile APIs vêm com cota 0 até o
  Google aprovar um pedido de acesso (formulário formal, ~7–10 dias úteis). É por
  **projeto no Google Cloud**, não por API individual — mas cada API ainda precisa ser
  **ativada** manualmente na Biblioteca.
  - Impacto: onboarding de um projeto novo (ex: white-label para outra agência) não é
    instantâneo. Documentar isso no runbook de deploy.
- **API v4 (reviews/posts) é separada** das APIs novas (Account Management, Business
  Information, Performance) e pode dar 403 mesmo com as outras funcionando — allowlist
  próprio.
- **Places API exige billing ativo** no Google Cloud (cartão cadastrado), mesmo com cota
  grátis mensal.
- **DataForSEO**: "verificar conta" na prática = ativar billing (cartão/depósito
  mínimo). Sandbox também fica bloqueado sem isso — não há teste 100% grátis.
- **SerpApi**: cota grátis é 100 buscas/mês; um grid 5x5 consome 25 de uma vez. Em
  produção com vários clientes, migrar para plano pago cedo.
- **WhatsApp não é rastreável pela API do Google** — cliques no botão de WhatsApp do
  perfil não aparecem como métrica separada (ficam ocultos dentro de "cliques no site"
  se o link estiver nesse campo, ou não são capturados). Se o produto quiser essa
  métrica, precisa de rastreamento próprio (não é escopo do GBP).
- **Ranking depende de localização de quem busca** — não existe "1º lugar" absoluto;
  todo rank é relativo a um ponto geográfico. Comunicar isso claramente na UI para não
  gerar expectativa errada.
- **Concorrentes: não reordenar por métrica própria** — a ordem que importa para o
  cliente é a ordem real do Google (relevância da busca), não uma nota/score inventada;
  isso foi feedback direto de uso no sistema atual e deve ser regra de produto.

## 9. Decisão confirmada: conexão via OAuth do Google

Sim — cada `Business` precisa estar vinculado a uma conta Google autorizada via OAuth
(escopo `business.manage`), porque:
1. É a **única forma oficial** de obter permissão de escrita (responder avaliação,
   editar perfil, criar post).
2. Dados privados (Performance, Reviews próprias, edição) exigem essa autorização —
   não existe API pública para esses dados.
3. Dados **públicos** (posição no ranking, concorrentes) não exigem OAuth — usam
   SerpApi/Places API livremente, e isso já é aproveitado para a feature de
   "Análise Mercado" (analisar até um negócio que não é cliente ainda, para
   prospecção).

Modelo de permissão: o dono do negócio (ou alguém com acesso de gerente) faz o OAuth.
Para agências, o ideal a médio prazo é usar convite de "gerente" no próprio GBP (o
cliente adiciona o e-mail da agência como gerente do perfil) — permite a agência
conectar vários clientes com **uma única conta Google própria**, sem pedir a senha do
cliente. Vale avaliar isso como opção B no onboarding (reduz fricção para agências).

## 10. Modelo de dados (visão de alto nível — detalhe no schema.prisma)

- `User` / `Account` — usuário da plataforma e o tenant (agência ou dono individual).
- `GoogleConnection` — tokens OAuth (por usuário/conta Google conectada).
- `Business` — cada Perfil de Empresa rastreado (equivale ao `GbpLocation` atual).
- `PerformanceDaily` — série temporal de métricas diárias (novo — não existia
  persistência real).
- `Review` — cache local de avaliações + estado de resposta.
- `AuditSnapshot` — nota + checklist congelados por data (para gráfico de evolução).
- `Competitor` / `CompetitorSnapshot` — concorrentes rastreados + evolução.
- `Keyword` / `RankCheck` / `RankCheckPoint` — palavras rastreadas e histórico de
  posição (simples ou grid).
- `Post` — Google Posts criados/agendados.
- `ChecklistItem` — itens acionáveis com status.
- `Alert` — notificações geradas.
- `SegmentBenchmark` — valores de referência por categoria para as métricas estimadas.
- `Report` — metadados de relatórios exportados.
- `Plan` / `Subscription` — billing (se for produto comercial desde o dia 1).

## 11. Fases sugeridas

1. **Fase 0** — Auth, GoogleConnection, cadastro de Business, sync inicial (Perfil +
   Auditoria). Sem histórico ainda.
2. **Fase 1** — Job de sync diário (Performance + Reviews), dashboard com números reais
   (sem estimativas ainda), Avaliações com resposta IA.
3. **Fase 2** — Histórico/gráficos (depende da Fase 1 rodar por >1 período), Checklist,
   Alertas básicos.
4. **Fase 3** — Rank Tracking + Análise Mercado + Concorrentes (as features "uau" de
   venda).
5. **Fase 4** — Métricas estimadas (receita perdida, benchmark), Postagens, Relatórios.
6. **Fase 5** — Billing/planos, white-label para agências, convite de gerente (reduz
   fricção OAuth).
