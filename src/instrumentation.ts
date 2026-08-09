import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade (E10-06).
 *
 * Sem `SENTRY_DSN` o SDK não é inicializado e o app roda igual — mesmo
 * critério das outras integrações opcionais. É deliberado: nenhum
 * desenvolvedor deve precisar de conta no Sentry para subir o projeto, e
 * nenhum evento de desenvolvimento deve poluir o painel de produção.
 *
 * O que **não** vai para o Sentry: dado de cliente. Os jobs já gravam o
 * histórico deles em `sync_runs`, que é a fonte de auditoria do produto; aqui
 * ficam só exceções.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const comum = {
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Amostragem baixa: o valor deste projeto está nos erros, não no APM, e
    // rastrear 100% das requisições estoura a cota do plano gratuito em dias.
    tracesSampleRate: 0.1,
    // Ninguém no time lê o console do Sentry; o log da plataforma já existe.
    debug: false,
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      ...comum,
      // Rotas de cron falham por motivo externo (allowlist, cota) com muita
      // frequência. Elas já são auditáveis em `sync_runs`, então mandá-las
      // para cá transformaria o Sentry em ruído.
      ignoreErrors: ["AllowlistPendenteError", "ApiV4IndisponivelError"],
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(comum);
  }
}

export const onRequestError = Sentry.captureRequestError;
