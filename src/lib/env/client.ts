import { z } from "zod";

/**
 * Variáveis expostas ao navegador.
 *
 * Este módulo pode ser importado de qualquer lugar — Client Component,
 * Server Component, middleware. Só contém variáveis NEXT_PUBLIC_, que já vão
 * para o bundle por definição.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  // DSN do Sentry no navegador: público por natureza — só permite enviar
  // evento, não ler.
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

/*
 * Cada variável é escrita por extenso de propósito. O Next substitui
 * `process.env.NEXT_PUBLIC_X` por texto literal em tempo de build, e essa
 * substituição não acontece em acesso dinâmico — `process.env` inteiro chega
 * vazio no navegador.
 */
const bruto = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

const resultado =
  process.env.SKIP_ENV_VALIDATION === "1"
    ? { success: true as const, data: bruto as z.infer<typeof clientSchema> }
    : clientSchema.safeParse(bruto);

if (!resultado.success) {
  const detalhes = resultado.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Variáveis de ambiente inválidas (cliente):\n${detalhes}\n\n` +
      `Variáveis NEXT_PUBLIC_ são embutidas no bundle em tempo de build — ` +
      `defini-las depois do build não tem efeito, é preciso reconstruir.`,
  );
}

export const clientEnv = resultado.data;
