-- ─────────────────────────────────────────────────────────────────────────────
-- 002 — Defaults no banco (opcional, mas recomendado)
--
-- Prisma resolve @default(uuid()) e @updatedAt na CAMADA DA APLICACAO, nao no
-- banco. Sem este arquivo, qualquer INSERT feito fora do Prisma (SQL editor do
-- Supabase, seed manual, script de importacao, trigger) falha por id ou
-- updatedAt nulos.
--
-- Aplicar isto NAO quebra o Prisma: ele continua enviando os valores e o
-- default so entra em acao quando a coluna e omitida.
--
-- Os ids sao TEXT no schema, entao o cast ::text e obrigatorio.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ids ──────────────────────────────────────────────────────────────────────
-- users nao entra: o id vem do Supabase Auth, nunca e gerado pelo banco.

ALTER TABLE "accounts"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "account_members"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "google_connections"   ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "businesses"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "performance_daily"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "reviews"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "audit_snapshots"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "competitors"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "competitor_snapshots" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "keywords"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "rank_checks"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "rank_check_points"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "market_scans"         ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "posts"                ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "checklist_items"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "alerts"               ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "segment_benchmarks"   ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "reports"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "plans"                ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "subscriptions"        ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- ── updatedAt ────────────────────────────────────────────────────────────────

ALTER TABLE "accounts"           ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "google_connections" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "businesses"         ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "posts"              ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "segment_benchmarks" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscriptions"      ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Mantem updatedAt correto em UPDATEs feitos fora do Prisma.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_set_updated_at           BEFORE UPDATE ON "accounts"           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER google_connections_set_updated_at BEFORE UPDATE ON "google_connections" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER businesses_set_updated_at         BEFORE UPDATE ON "businesses"         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER posts_set_updated_at              BEFORE UPDATE ON "posts"              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER segment_benchmarks_set_updated_at BEFORE UPDATE ON "segment_benchmarks" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subscriptions_set_updated_at      BEFORE UPDATE ON "subscriptions"      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- OPCIONAL — apenas se o banco for o proprio Postgres do Supabase.
-- Amarra public.users ao Supabase Auth: apagar o usuario no Auth apaga a linha
-- aqui, e em cascata as memberships. Nao aplique se o banco for externo ao
-- Supabase (a tabela auth.users nao existira).
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE "users"
--   ADD CONSTRAINT users_auth_fkey
--   FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;
