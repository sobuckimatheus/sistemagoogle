import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * O wrapper do Sentry é aplicado sempre, mas só faz trabalho de verdade quando
 * há credencial: sem `SENTRY_AUTH_TOKEN` ele não tenta subir source map, e o
 * build segue igual. Isso mantém `pnpm build` funcionando em máquina de
 * desenvolvedor e no CI, que não têm — nem devem ter — token de upload.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Source maps são enviados ao Sentry e removidos do bundle público: sem
  // isso, o código-fonte do app fica servido para qualquer visitante.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Encaminha os eventos do navegador por uma rota nossa, para que
  // bloqueadores de anúncio não descartem os relatórios de erro.
  tunnelRoute: "/monitoring",

  // Remove os logs de depuração do SDK do bundle de produção.
  webpack: { treeshake: { removeDebugLogging: true } },
});
