import { z } from "zod";

/**
 * Validação das variáveis de ambiente.
 *
 * Roda no boot e falha alto: uma variável ausente aqui vira erro imediato com
 * o nome do que faltou, em vez de um `undefined` que só explode três telas
 * adiante numa chamada de API.
 *
 * As integrações que ainda não têm credencial (Google, SerpApi, DataForSEO,
 * Anthropic, Stripe) estão como opcionais de propósito — o app precisa subir
 * antes delas existirem. Conforme cada épica avançar, mova a variável
 * correspondente para obrigatória.
 */

const serverSchema = z.object({
  // Banco
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // Supabase (lado servidor)
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Segredos próprios da aplicação
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message:
        "ENCRYPTION_KEY precisa ser 32 bytes em base64 — gere com: openssl rand -base64 32",
    }),
  CRON_SECRET: z.string().min(32),

  // Integrações — obrigatórias só quando a épica correspondente começar
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
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

/**
 * Escape hatch para CI e para o `next build`, onde o processo não tem acesso
 * aos segredos de produção. Nunca use em runtime — o objetivo da validação é
 * exatamente falhar antes de servir tráfego com configuração incompleta.
 */
const pularValidacao = process.env.SKIP_ENV_VALIDATION === "1";

function parse<T extends z.ZodType>(schema: T, source: unknown, escopo: string) {
  if (pularValidacao) {
    return source as z.infer<T>;
  }

  const result = schema.safeParse(source);
  if (!result.success) {
    const detalhes = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Variáveis de ambiente inválidas (${escopo}):\n${detalhes}\n\n` +
        `Confira o .env.example para o formato esperado.`,
    );
  }
  return result.data as z.infer<T>;
}

/**
 * Só pode ser lido em código de servidor. Importar isto num Client Component
 * vaza segredo para o bundle — o throw abaixo existe para tornar o erro
 * impossível de ignorar.
 */
export const serverEnv = (() => {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv foi importado no cliente — use clientEnv");
  }
  return parse(serverSchema, process.env, "servidor");
})();

/**
 * Seguro no cliente: só variáveis NEXT_PUBLIC_, que já vão para o bundle.
 *
 * O objeto é montado campo a campo de propósito. O Next substitui
 * `process.env.NEXT_PUBLIC_X` em tempo de build por texto literal, e essa
 * substituição não acontece em acesso dinâmico — `process.env` inteiro chega
 * vazio no browser.
 */
export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  "cliente",
);
