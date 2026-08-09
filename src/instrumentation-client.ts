import * as Sentry from "@sentry/nextjs";

/**
 * Sentry no navegador (E10-06).
 *
 * A variável é `NEXT_PUBLIC_` porque precisa chegar ao bundle — e o DSN é
 * público por natureza: ele só permite **enviar** eventos, não lê nada. Ainda
 * assim fica opcional, para que o app rode sem conta no Sentry.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Session Replay desligado: grava a tela do usuário, e este produto exibe
    // dados de clientes de terceiros. Ligar isso exigiria decisão de privacidade
    // que ninguém tomou.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
