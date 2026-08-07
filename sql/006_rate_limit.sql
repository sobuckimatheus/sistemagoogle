-- ─────────────────────────────────────────────────────────────────────────────
-- 006 — Rate limiting das APIs pagas (E10-05)
--
-- Uma linha por chamada, com a chave "<recurso>:<accountId>". O indice composto
-- (chave, createdAt) e o que faz a contagem por janela nao virar varredura.
--
-- A limpeza das linhas velhas acontece de forma oportunista no proprio caminho
-- de leitura (ver src/lib/rate-limit.ts) — nao precisa de job dedicado.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_chave_createdAt_idx" ON "rate_limit_hits"("chave", "createdAt");

ALTER TABLE "rate_limit_hits" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
