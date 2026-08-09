/**
 * Ambiente da suíte de integração.
 *
 * Ao contrário de `vitest.setup.ts`, este arquivo **não** sobrescreve
 * `DATABASE_URL`: o banco vem de fora, e é justamente o ponto da suíte. As
 * demais variáveis recebem valores falsos porque nenhum teste de integração
 * chama serviço externo — só o Postgres é real.
 */
process.env.SKIP_ENV_VALIDATION = "1";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "c".repeat(64);
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-de-teste";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
