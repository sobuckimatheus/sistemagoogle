/**
 * Ambiente dos testes.
 *
 * Valores fixos e falsos de propósito: os testes não devem depender do .env
 * da máquina nem tocar em serviço externo. A chave de criptografia é uma
 * chave de teste — 32 bytes em base64, exigidos pelo AES-256.
 */
process.env.SKIP_ENV_VALIDATION = "1";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "c".repeat(64);
process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/test";
process.env.DIRECT_URL = "postgresql://u:p@localhost:5432/test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-de-teste";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
