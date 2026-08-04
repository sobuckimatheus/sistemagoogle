# Fluxo de experiência do usuário — Painel GBP

Derivado de `PRD-gbp-dashboard.md` (escopo V1) + `schema.prisma`.
Nós com `[( )]` representam escrita/leitura no banco, com o model Prisma envolvido.

```mermaid
flowchart TD

%% ─────────────────────────────────────────────────────────────
%% ENTRADA / AUTENTICAÇÃO
%% ─────────────────────────────────────────────────────────────
subgraph AUTH["1. Entrada e autenticacao"]
  A0["Visitante acessa o app"] --> A1{"Ja tem conta?"}
  A1 -- "Nao" --> A2["Cadastro: email+senha ou Google"]
  A1 -- "Sim" --> A3["Login"]

  A2 --> A4[("Supabase Auth cria identidade / User.id = id do Supabase")]
  A4 --> A5[("Cria Account nome da agencia ou do negocio")]
  A5 --> A6[("Cria AccountMember role=OWNER")]
  A6 --> A7[("Cria Subscription status=TRIALING no Plan tier=FREE")]
  A7 --> ON1

  A3 --> A8{"Credenciais validas?"}
  A8 -- "Nao" --> A9["Erro de login / recuperar senha"] --> A3
  A8 -- "Sim" --> A10{"Usuario pertence a alguma Account? AccountMember"}
  A10 -- "Nao" --> A5
  A10 -- "Sim, varias" --> A11["Seletor de Account tenant ativo"] --> A12
  A10 -- "Sim, uma" --> A12{"Account tem GoogleConnection status=ACTIVE?"}
  A12 -- "Nao" --> ON1
  A12 -- "Sim" --> A13{"Account tem ao menos 1 Business ACTIVE?"}
  A13 -- "Nao" --> ON7
  A13 -- "Sim" --> A14["Seletor de Business perfil ativo"] --> DASH0
end

%% ─────────────────────────────────────────────────────────────
%% ONBOARDING / CONEXAO GOOGLE
%% ─────────────────────────────────────────────────────────────
subgraph ONB["2. Onboarding e conexao com o Google"]
  ON1["Tela: conecte seu Perfil de Empresa no Google"]
  ON1 --> ON2{"Modelo de acesso escolhido"}
  ON2 -- "A: o dono do negocio autoriza" --> ON3
  ON2 -- "B: cliente adiciona a agencia como gerente no GBP" --> ON2b["Instrucoes para o cliente adicionar o email da agencia como gerente"] --> ON3
  ON3["Redirect para consent screen do Google escopo business.manage"]
  ON3 --> ON4{"Usuario autorizou?"}
  ON4 -- "Nao / cancelou" --> ON5["Mensagem: sem autorizacao nao ha leitura de metricas nem escrita"] --> ON1
  ON4 -- "Sim" --> ON6[("GoogleConnection: accessToken e refreshToken criptografados, tokenExpiry, scopes, googleAccountEmail, connectedByUserId, status=ACTIVE")]

  ON6 --> ON7["Lista contas e locais via My Business Account Management API"]
  ON7 --> ON8{"Resposta da API"}
  ON8 -- "403 / cota 0 allowlist pendente" --> ON9["Tela de bloqueio: acesso as Business Profile APIs em aprovacao, prazo ~7-10 dias uteis"] --> ON9b["Usuario e notificado quando liberar"]
  ON8 -- "Nenhum local encontrado" --> ON10["Aviso: essa conta Google nao gerencia nenhum perfil, trocar de conta ou pedir acesso de gerente"] --> ON1
  ON8 -- "OK, N locais" --> ON11["Usuario seleciona quais locais rastrear multi-select"]

  ON11 --> ON12{"Selecao excede Plan.maxBusinesses?"}
  ON12 -- "Sim" --> BILL1
  ON12 -- "Nao" --> ON13[("Cria 1 Business por location: locationName unico, gbpAccountName, placeId, googleConnectionId, status=ACTIVE")]

  ON13 --> ON14["Sync inicial do perfil via Business Information API"]
  ON14 --> ON15[("Business: title, primaryCategory + gcid, additionalCategories, description, phone, website, endereco, lat/lng, lastSyncedAt")]
  ON15 --> ON16["Busca historico disponivel de Performance ultimos ~30 dias"]
  ON16 --> ON17[("PerformanceDaily: 1 linha por dia com viewsSearch, viewsMaps, calls, websiteClicks, directionRequests, conversations, bookings")]
  ON17 --> ON18{"API v4 avaliacoes liberada?"}
  ON18 -- "403 allowlist proprio da v4" --> ON19["Modulo Avaliacoes e Postagens marcado como indisponivel, resto do produto segue funcionando"] --> ON20
  ON18 -- "OK" --> ON19b[("Review: cache local por gbpReviewId, starRating, comment, replyText, repliedAt")] --> ON20

  ON20["Executa auditoria inicial 0-100 com pesos: categoria, descricao, horarios, servicos, endereco, nº avaliacoes, nota media, % respondidas"]
  ON20 --> ON21[("AuditSnapshot: score + checksJson")]
  ON21 --> ON22[("ChecklistItem gerados por area e prioridade, status=OPEN")]
  ON22 --> ON23["Pergunta de ativacao: qual seu ticket medio? e taxa de conversao se souber"]
  ON23 --> ON24{"Usuario preencheu?"}
  ON24 -- "Sim" --> ON25[("Business.ticketMedio e Business.taxaConversaoManual")]
  ON24 -- "Pular" --> ON26[("Fallback: SegmentBenchmark pela categoria avgTicket, avgConversionRate")]
  ON25 --> DASH0
  ON26 --> DASH0
end

%% ─────────────────────────────────────────────────────────────
%% DASHBOARD
%% ─────────────────────────────────────────────────────────────
subgraph DASH["3. Dashboard principal"]
  DASH0["Dashboard do Business selecionado"]
  DASH0 --> DASH1["Seletor de periodo 7d / 30d / 90d / customizado, com comparacao vs periodo anterior"]
  DASH1 --> DASH2{"Ha serie historica suficiente para comparar?"}
  DASH2 -- "Nao, conta nova" --> DASH3["Cards mostram valor absoluto + aviso: comparativo disponivel apos o proximo ciclo de sync"] --> DASH5
  DASH2 -- "Sim" --> DASH4["Le PerformanceDaily do periodo e do periodo anterior"] --> DASH5

  DASH5["Cards de topo"]
  DASH5 --> C1["Nota do perfil 0-100 -> AuditSnapshot mais recente + delta"]
  DASH5 --> C2["Visualizacoes = viewsSearch + viewsMaps"]
  DASH5 --> C3["Ligacoes = calls"]
  DASH5 --> C4["Solicitacoes de rota = directionRequests"]
  DASH5 --> C5["Cliques no site = websiteClicks"]
  DASH5 --> C6["Avaliacoes: nota media + total -> agregado de Review"]

  DASH5 --> B_1["Bloco Receita perdida estimada"]
  DASH5 --> B_2["Bloco Principais motivos = top ChecklistItem OPEN por peso"]
  DASH5 --> B_3["Bloco Desempenho financeiro estimado: faturamento atribuido, clientes conquistados, ticket medio"]
  DASH5 --> B_4["Bloco Fontes de receita: proporcao Search x Maps"]
  DASH5 --> B_5["Bloco Conversao do perfil vs media do segmento"]
  DASH5 --> B_6["Bloco Maior oportunidade agora: 1 recomendacao IA de maior impacto"]
  DASH5 --> B_7["Alertas nao lidos: Alert com readAt = null"]

  B_1 --> F1["Formula: clientes_estimados = calls + directionRequests + websiteClicks x taxa_conversao"]
  F1 --> F2["receita_atual = clientes_estimados x ticketMedio"]
  F2 --> F3["receita_perdida = receita_potencial do benchmark do segmento - receita_atual"]
  F3 --> F4["Link obrigatorio: entenda como calculamos isso, com a formula e a fonte do SegmentBenchmark"]
  B_5 --> F5["conversao_do_perfil = calls + directionRequests + websiteClicks / visualizacoes"]

  B_2 --> M_CHK
  B_6 --> M_CHK
  B_7 --> M_ALERT
  C1 --> M_AUD
  C6 --> M_REV
  C2 --> M_PERF
  C3 --> M_PERF
  C4 --> M_PERF
  C5 --> M_PERF
end

%% ─────────────────────────────────────────────────────────────
%% MODULOS
%% ─────────────────────────────────────────────────────────────
subgraph MOD["4. Modulos do produto"]

  %% Perfil e Auditoria
  M_AUD["Perfil e Auditoria"]
  M_AUD --> AU1["Ve nota atual + grafico de evolucao lendo AuditSnapshot por data"]
  M_AUD --> AU2["Ve checklist da auditoria: item, status, dica"]
  M_AUD --> AU3["Edita campos do perfil: nome, telefone, site, descricao, horarios, endereco, categorias, servicos"]
  AU3 --> AU4["PATCH via Business Information API"]
  AU4 --> AU5{"Google aceitou a edicao?"}
  AU5 -- "Erro de validacao / campo em revisao pelo Google" --> AU6["Mostra o motivo retornado e mantem o valor anterior"] --> AU3
  AU5 -- "OK" --> AU7[("Atualiza cache em Business e lastSyncedAt")]
  AU7 --> AU8["Reexecuta auditoria"] --> AU9[("Novo AuditSnapshot + ChecklistItem reavaliados")] --> DASH0

  %% Avaliacoes
  M_REV["Avaliacoes"]
  M_REV --> RV1["Lista Review do cache local com filtros: sem resposta, nota <= 3, periodo"]
  RV1 --> RV2["Indicador: % respondidas em ate 48h calculado com createTime e repliedAt"]
  RV1 --> RV3["Seleciona uma avaliacao"]
  RV3 --> RV4{"Como responder?"}
  RV4 -- "Gerar com IA" --> RV5["Claude gera rascunho com o tom configurado"] --> RV6[("Review.aiDraftReply")]
  RV4 -- "Escrever manualmente" --> RV7["Editor de texto"]
  RV6 --> RV7
  RV7 --> RV8["Publicar resposta via API v4"]
  RV8 --> RV9{"Publicou?"}
  RV9 -- "Erro 403 / token expirado" --> ERR1
  RV9 -- "OK" --> RV10[("Review.replyText + repliedAt")] --> RV1

  %% Desempenho
  M_PERF["Desempenho"]
  M_PERF --> PF1["Grafico de evolucao diaria por metrica lendo PerformanceDaily"]
  M_PERF --> PF2["Breakdown Search x Maps"]
  M_PERF --> PF3["Comparacao entre dois intervalos quaisquer sem chamar a API, tudo do banco"]
  M_PERF --> PF4["Nota de limitacao: cliques de WhatsApp nao sao rastreaveis pela API do Google"]

  %% Concorrentes
  M_COMP["Concorrentes"]
  M_COMP --> CP1["Busca automatica por categoria + cidade via Places API New"]
  CP1 --> CP2{"Billing ativo no Google Cloud?"}
  CP2 -- "Nao" --> CP3["Modulo indisponivel: exige billing ativo"] 
  CP2 -- "Sim" --> CP4["Lista mantendo a ordem de relevancia do Google, sem reordenar por nota"]
  CP4 --> CP5["Usuario marca quais concorrentes acompanhar"] --> CP6[("Competitor")]
  CP6 --> CP7["Comparativo eu x concorrente: nota, nº de avaliacoes, site, horarios"]
  CP7 --> CP8["Evolucao no tempo lendo CompetitorSnapshot capturedAt"]

  %% Palavras-chave
  M_KW["Palavras-chave"]
  M_KW --> KW1{"Como adicionar?"}
  KW1 -- "Sugestao por IA a partir de categoria + cidade" --> KW2["Claude sugere lista"]
  KW1 -- "Digitar manualmente" --> KW3["Input do termo"]
  KW2 --> KW3
  KW3 --> KW4{"Excede Plan.maxKeywords?"}
  KW4 -- "Sim" --> BILL1
  KW4 -- "Nao" --> KW5[("Keyword: term unico por Business, active=true")]
  KW5 --> KW6{"Keyword.volumeSyncedAt tem mais de 30 dias ou e nulo?"}
  KW6 -- "Sim" --> KW7["Consulta volume mensal no DataForSEO"]
  KW7 --> KW8{"Conta DataForSEO com billing?"}
  KW8 -- "Nao" --> KW9["Volume exibido como indisponivel"] --> M_RANK
  KW8 -- "Sim" --> KW10[("Keyword.volume + volumeSyncedAt")] --> M_RANK
  KW6 -- "Nao, cache valido" --> M_RANK

  %% Rank tracking
  M_RANK["Rank no mapa"]
  M_RANK --> RK1{"Modalidade"}
  RK1 -- "Posicao simples" --> RK2["type=SINGLE, 1 ponto na coordenada do negocio, totalPoints=1"]
  RK1 -- "Grade 3x3 ou 5x5" --> RK3["type=GRID, gridSize define os pontos ao redor de lat/lng do Business"]
  RK2 --> RK4
  RK3 --> RK4["Consulta SerpApi por ponto"]
  RK4 --> RK5{"Cota SerpApi disponivel? um 5x5 consome 25 buscas"}
  RK5 -- "Nao" --> RK6["Bloqueio com aviso de cota e sugestao de upgrade"] --> BILL1
  RK5 -- "Sim" --> RK7[("RankCheck: myPosition, avgPosition, coverage, totalPoints, centerLat, centerLng")]
  RK7 --> RK8[("RankCheckPoint por ponto: lat, lng, position, resultsJson com o top N")]
  RK8 --> RK9["Mapa de calor da grade + ranking competitivo ordenado por posicao media e cobertura"]
  RK9 --> RK10["Grafico de evolucao da posicao por palavra-chave lendo RankCheck.createdAt"]
  RK10 --> RK11["Aviso de produto: nao existe 1º lugar absoluto, todo rank e relativo ao ponto geografico"]

  %% Analise de mercado / prospeccao
  M_SCAN["Analise de mercado - prospeccao"]
  M_SCAN --> SC1["Busca QUALQUER negocio pelo nome, nao precisa ser um Business rastreado"]
  SC1 --> SC2["Seleciona o negocio retornado"]
  SC2 --> SC3{"Palavra-chave"}
  SC3 -- "Sugerida por IA" --> SC4["Claude sugere termo pela categoria + cidade"]
  SC3 -- "Digitada" --> SC5["Input livre"]
  SC4 --> SC6
  SC5 --> SC6["Consulta SerpApi sem OAuth, dado publico"]
  SC6 --> SC7[("MarketScan: queryName, businessName, placeId, keyword, position, resultJson, vinculado a Account")]
  SC7 --> SC8["Mostra posicao do lead + ranking real da cidade"]
  SC8 --> SC9["Historico de scans da Account para acompanhamento comercial"]

  %% Postagens
  M_POST["Postagens"]
  M_POST --> PS1{"Origem do texto"}
  PS1 -- "Gerar com IA" --> PS2["Claude gera texto do post"]
  PS1 -- "Escrever" --> PS3["Editor"]
  PS2 --> PS3
  PS3 --> PS4["Escolhe postType: STANDARD, EVENT ou OFFER e midia opcional"]
  PS4 --> PS5{"Publicar agora ou agendar?"}
  PS5 -- "Salvar rascunho" --> PS6[("Post state=DRAFT")]
  PS5 -- "Agendar" --> PS7[("Post state=SCHEDULED + scheduledFor")]
  PS5 -- "Publicar agora" --> PS8["POST localPosts na API v4"]
  PS7 --> JOB6
  PS8 --> PS9{"Publicou?"}
  PS9 -- "Erro" --> PS10[("Post state=FAILED + errorMessage")] --> PS3
  PS9 -- "OK" --> PS11[("Post state=PUBLISHED, gbpPostId, publishedAt")]
  PS11 --> PS12["Alimenta a metrica de frequencia de postagem no dashboard"] --> DASH0

  %% Checklist
  M_CHK["Plano de acao - checklist"]
  M_CHK --> CK1["Lista ChecklistItem OPEN agrupados por area e ordenados por prioridade"]
  CK1 --> CK2{"Acao do usuario"}
  CK2 -- "Resolver agora" --> CK3["Link direto para o modulo responsavel: perfil, avaliacoes, postagens"]
  CK2 -- "Marcar como feito" --> CK4[("status=DONE + resolvedAt")]
  CK2 -- "Dispensar" --> CK5[("status=DISMISSED")]
  CK3 --> AU3
  CK3 --> M_REV
  CK3 --> M_POST
  CK4 --> DASH0
  CK5 --> DASH0

  %% Alertas
  M_ALERT["Alertas"]
  M_ALERT --> AL1["Lista Alert por severity: INFO, WARNING, CRITICAL"]
  AL1 --> AL2{"Tipo do alerta"}
  AL2 -- "NEW_REVIEW / LOW_RATING_REVIEW" --> M_REV
  AL2 -- "RATING_DROP" --> M_REV
  AL2 -- "NO_ACTIVITY" --> M_POST
  AL2 -- "RANK_DROP" --> M_RANK
  AL2 -- "SYNC_FAILED" --> ERR1
  AL1 --> AL3[("Alert.readAt preenchido ao abrir")]

  %% Relatorios
  M_REP["Relatorios"]
  M_REP --> RP1["Escolhe periodo e formato pdf ou csv"]
  RP1 --> RP2["Render server-side do dashboard do periodo"]
  RP2 --> RP3[("Report: periodStart, periodEnd, format, fileUrl")]
  RP3 --> RP4["Download ou envio do link para o cliente final"]
end

%% ─────────────────────────────────────────────────────────────
%% JOBS EM BACKGROUND
%% ─────────────────────────────────────────────────────────────
subgraph JOBS["5. Jobs periodicos - o que faz o produto funcionar sem o usuario"]
  JOB0["Cron"]
  JOB0 --> JOB1["Diario: refresh de token, Performance, Reviews, Auditoria"]
  JOB0 --> JOB5["Semanal: Concorrentes e Rank tracking, mais caros em API"]
  JOB0 --> JOB6["A cada minuto: publica Post com state=SCHEDULED cujo scheduledFor venceu"]
  JOB0 --> JOB7["Mensal: revalida Keyword.volume no DataForSEO"]

  JOB1 --> JOB2{"Token valido ou renovavel pelo refreshToken?"}
  JOB2 -- "Nao" --> JOB3[("GoogleConnection.status = EXPIRED ou REVOKED")]
  JOB3 --> JOB4[("Alert type=SYNC_FAILED severity=CRITICAL")] --> ERR1
  JOB2 -- "Sim" --> JOB8[("Upsert PerformanceDaily por businessId+date")]
  JOB8 --> JOB9[("Upsert Review por businessId+gbpReviewId")]
  JOB9 --> JOB10[("Novo AuditSnapshot + regeneracao de ChecklistItem")]
  JOB10 --> JOB11["Compara snapshots para decidir alertas"]
  JOB11 --> JOB12[("Alert: NEW_REVIEW, LOW_RATING_REVIEW nota <= 3, RATING_DROP, NO_ACTIVITY sem post ou foto ha N dias")]
  JOB5 --> JOB13[("CompetitorSnapshot: rating, reviewCount, hasWebsite, hasHours")]
  JOB5 --> JOB14[("Novo RankCheck + RankCheckPoint")]
  JOB14 --> JOB15{"Posicao piorou vs checagem anterior?"}
  JOB15 -- "Sim" --> JOB16[("Alert type=RANK_DROP")]
  JOB12 --> B_7
  JOB16 --> B_7
  JOB8 --> DASH2
end

%% ─────────────────────────────────────────────────────────────
%% BILLING E EQUIPE
%% ─────────────────────────────────────────────────────────────
subgraph BILL["6. Plano, limites e equipe"]
  BILL1["Tela de planos: FREE, PRO, AGENCY com maxBusinesses e maxKeywords"]
  BILL1 --> BILL2["Checkout Stripe usando Plan.stripePriceId"]
  BILL2 --> BILL3{"Pagamento aprovado?"}
  BILL3 -- "Nao" --> BILL4[("Subscription.status = PAST_DUE")] --> BILL5["Funcionalidades pagas bloqueadas, dados preservados"]
  BILL3 -- "Sim" --> BILL6[("Subscription: status=ACTIVE, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd")]
  BILL6 --> BILL7["Limites recalculados, usuario volta ao fluxo que estava"]
  BILL7 --> ON11
  BILL7 --> KW3
  BILL7 --> M_RANK

  BILL8["Configuracoes da Account"]
  BILL8 --> BILL9["Convidar membro da equipe -> AccountMember role=MEMBER"]
  BILL8 --> BILL10["Gerenciar GoogleConnection: reconectar, trocar conta Google, revogar"]
  BILL8 --> BILL11["Pausar ou desconectar um Business: status PAUSED ou DISCONNECTED, para de sincronizar e libera cota do plano"]
  BILL8 --> BILL12["Configurar por Business: ticketMedio, taxaConversaoManual, tom de voz das respostas"]
  BILL10 --> ON3
end

%% ─────────────────────────────────────────────────────────────
%% RECUPERACAO DE ERRO
%% ─────────────────────────────────────────────────────────────
subgraph ERR["7. Estado degradado e recuperacao"]
  ERR1["Banner persistente: conexao com o Google perdida, dados congelados em Business.lastSyncedAt"]
  ERR1 --> ERR2["Dashboard continua exibindo o historico ja salvo, escrita bloqueada"]
  ERR2 --> ERR3["CTA: reconectar conta Google"]
  ERR3 --> ON3
  ERR3 --> ERR4{"Reconectou com a mesma conta Google?"}
  ERR4 -- "Sim" --> ERR5[("GoogleConnection.status = ACTIVE, sync retomado")] --> DASH0
  ERR4 -- "Nao, outra conta" --> ERR6["Aviso: os locais podem nao bater com os Business ja rastreados, revalidar selecao"] --> ON11
end
```

## Premissas e lacunas do material atual

Pontos que o fluxo assume porque nem o PRD nem o schema definem:

1. **Convite de membro de equipe** — o PRD cita agências multiusuário e o schema tem `AccountMember` com `role`, mas não existe model `Invite`/token de convite. O fluxo mostra o convite como ação, sem estado intermediário.
2. **Tom de voz das respostas de IA** — a seção 5.4 diz "tom configurável por negócio", mas não há campo no model `Business`. Tratado como configuração em `BILL12`.
3. **Retenção do `AuditSnapshot`** — não há política de frequência definida (o job diário gera um por dia por negócio); o gráfico de evolução assume granularidade diária.
4. **`NO_ACTIVITY` sobre fotos** — o alerta previsto em 5.10 menciona "sem post ou foto nova", mas gestão de fotos está fora da V1 (seção 6), então na prática só `Post` alimenta esse alerta.
5. **Downgrade de plano** — não está definido o que acontece com `Business` excedentes quando o plano cai (bloquear, pausar automaticamente ou pedir escolha). O fluxo cobre só o caminho de upgrade.

Se você quiser, posso resolver qualquer um desses pontos e regerar o diagrama já com o comportamento definido.
