-- Sugestões de termo geradas por IA, guardadas para a tela abrir sem gerar.
--
-- Sem esta tabela, trazer as sugestões prontas no painel custaria uma chamada
-- à Anthropic a cada visita, inclusive em recarregar a página.

CREATE TABLE "keyword_suggestions" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "businessId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "contexto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "keyword_suggestions_businessId_term_key"
    ON "keyword_suggestions"("businessId", "term");

CREATE INDEX "keyword_suggestions_businessId_idx"
    ON "keyword_suggestions"("businessId");

ALTER TABLE "keyword_suggestions"
    ADD CONSTRAINT "keyword_suggestions_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
