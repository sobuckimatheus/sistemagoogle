// Faz o build falhar se este módulo for importado de um Client Component —
// que foi exatamente o bug que motivou separar client.ts de server.ts.
import "server-only";

import { z } from "zod";

/**
 * Variáveis de servidor: segredos que nunca podem chegar ao navegador.
 *
 * As integrações sem credencial ainda (Google, SerpApi, DataForSEO, Anthropic,
 * Stripe) são opcionais de propósito — o app precisa subir antes delas
 * existirem. Conforme cada épica avançar, mova a variável para obrigatória.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message:
        "ENCRYPTION_KEY precisa ser 32 bytes em base64 — gere com: openssl rand -base64 32",
    }),
  CRON_SECRET: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  // Remetente dos e-mails transacionais. Precisa ser de um domínio verificado
  // no provedor; o padrão só funciona em teste.
  EMAIL_FROM: z.string().default("Painel GBP <onboarding@resend.dev>"),
});

const resultado =
  process.env.SKIP_ENV_VALIDATION === "1"
    ? {
        success: true as const,
        data: process.env as unknown as z.infer<typeof serverSchema>,
      }
    : serverSchema.safeParse(process.env);

if (!resultado.success) {
  const detalhes = resultado.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Variáveis de ambiente inválidas (servidor):\n${detalhes}\n\n` +
      `Confira o .env.example para o formato esperado.`,
  );
}

export const serverEnv = resultado.data;
