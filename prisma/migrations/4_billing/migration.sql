-- ─────────────────────────────────────────────────────────────────────────────
-- 005 — Billing (E9)
--
--   stripe_events                       idempotencia do webhook      (E9-04)
--   subscriptions.cancelAtPeriodEnd     cancelamento agendado        (E9-05/07)
--   indice em subscriptions.stripeCustomerId
--       o webhook chega com o id do customer, nao com o accountId; sem indice
--       cada evento faria varredura na tabela.
--
-- Aditivo: nenhuma coluna existente muda de tipo.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_stripeCustomerId_idx" ON "subscriptions"("stripeCustomerId");
