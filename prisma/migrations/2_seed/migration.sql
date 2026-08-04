-- ─────────────────────────────────────────────────────────────────────────────
-- 003 — Seed obrigatorio
--
-- Duas tabelas precisam existir populadas ANTES do primeiro cadastro:
--
--   plans              -> Subscription.planId e NOT NULL. Sem ao menos o plano
--                         FREE, o fluxo de cadastro nao consegue criar a
--                         assinatura TRIALING.
--   segment_benchmarks -> fallback de ticket medio e taxa de conversao quando o
--                         usuario pula a pergunta no onboarding (PRD 5.9).
--
-- Requer 002_defaults.sql aplicado (os ids sao gerados pelo banco aqui).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Planos ───────────────────────────────────────────────────────────────────
-- ATENCAO: precos e limites abaixo sao PLACEHOLDER — o PRD nao define nenhum.
-- Ajuste antes de ligar o Stripe. stripePriceId fica nulo ate criar os precos
-- no dashboard do Stripe.

INSERT INTO "plans" ("tier", "name", "priceCents", "maxBusinesses", "maxKeywords", "stripePriceId") VALUES
  ('FREE',   'Gratuito', 0,     1,  10,  NULL),
  ('PRO',    'Pro',      9700,  3,  50,  NULL),
  ('AGENCY', 'Agencia',  29700, 20, 300, NULL)
ON CONFLICT ("tier") DO NOTHING;

-- ── Benchmarks por segmento ──────────────────────────────────────────────────
-- ATENCAO: valores iniciais de referencia, NAO medidos na sua base.
-- O PRD 5.9 marca isso como risco de credibilidade: a coluna "source" existe
-- para alimentar o link "entenda como calculamos isso" na UI. Substitua pela
-- media real da base quando houver volume.
--
-- avgConversionRate: fracao de 0 a 1 sobre acoes no perfil (ligacao + rota +
-- clique no site) que viram cliente.
-- avgTicket: R$ por cliente.

INSERT INTO "segment_benchmarks" ("category", "avgConversionRate", "avgTicket", "source") VALUES
  ('Clinica de estetica',      0.25, 350.00,  'Estimativa inicial - substituir por media da base'),
  ('Salao de beleza',          0.30, 120.00,  'Estimativa inicial - substituir por media da base'),
  ('Barbearia',                0.35, 60.00,   'Estimativa inicial - substituir por media da base'),
  ('Restaurante',              0.20, 90.00,   'Estimativa inicial - substituir por media da base'),
  ('Clinica odontologica',     0.22, 600.00,  'Estimativa inicial - substituir por media da base'),
  ('Clinica medica',           0.22, 400.00,  'Estimativa inicial - substituir por media da base'),
  ('Academia',                 0.18, 150.00,  'Estimativa inicial - substituir por media da base'),
  ('Pet shop',                 0.28, 110.00,  'Estimativa inicial - substituir por media da base'),
  ('Oficina mecanica',         0.30, 500.00,  'Estimativa inicial - substituir por media da base'),
  ('Escritorio de advocacia',  0.15, 1500.00, 'Estimativa inicial - substituir por media da base'),
  ('Imobiliaria',              0.10, 3000.00, 'Estimativa inicial - substituir por media da base'),
  ('Prestador de servico',     0.25, 300.00,  'Estimativa inicial - fallback generico')
ON CONFLICT ("category") DO NOTHING;
