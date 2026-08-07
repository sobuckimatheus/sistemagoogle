-- ─────────────────────────────────────────────────────────────────────────────
-- 004 — Lacunas entre o PRD e o schema inicial
--
-- Quatro itens que o PRD exige e o 001_init nao criou (ver TASKS.md,
-- "Migrations adicionais necessarias"):
--
--   invites                    convite de membro de equipe          (E1-09)
--   businesses.tomDeVoz        tom das geracoes de IA (PRD 5.4)     (E3-09)
--   sync_runs                  log de execucao dos jobs             (E4-02)
--   notification_preferences   quem recebe e-mail de alerta critico (E8-08)
--
-- Tudo aditivo: nenhuma coluna existente muda de tipo e nada e apagado.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "tomDeVoz" TEXT;

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailOnCriticalAlert" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_accountId_idx" ON "invites"("accountId");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- CreateIndex
CREATE INDEX "sync_runs_businessId_startedAt_idx" ON "sync_runs"("businessId", "startedAt");

-- CreateIndex
CREATE INDEX "sync_runs_jobType_startedAt_idx" ON "sync_runs"("jobType", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Defaults no banco, no mesmo criterio do 002_defaults: o Prisma resolve id e
-- updatedAt na aplicacao, entao sem isto qualquer INSERT feito fora dele
-- (SQL editor, script de importacao) falha por coluna nula.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "invites"                  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "sync_runs"                ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "notification_preferences" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "notification_preferences" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON "notification_preferences"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
