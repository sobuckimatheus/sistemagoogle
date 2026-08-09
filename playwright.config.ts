import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (E10-03).
 *
 * Sobe o app de produção contra um Postgres efêmero e um Supabase Auth de
 * mentira (`e2e/mock-supabase.mjs`). Nenhuma API externa é chamada: as
 * integrações com Google, Stripe, Anthropic e afins ficam sem credencial, e o
 * produto foi construído para funcionar assim — é o mesmo estado de quem
 * acabou de criar a conta e ainda não conectou nada.
 */
const PORTA_APP = 3100;
const PORTA_MOCK = 54321;

const bancoDeTeste =
  process.env.DATABASE_URL ??
  "postgresql://painel:painel@localhost:5432/painel_test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "html",

  use: {
    baseURL: `http://127.0.0.1:${PORTA_APP}`,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command: `node e2e/mock-supabase.mjs`,
      // Precisa ser uma rota que responda 2xx: o Playwright trata qualquer
      // outro status como "ainda não subiu" e espera até o timeout.
      url: `http://127.0.0.1:${PORTA_MOCK}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm start --port ${PORTA_APP}`,
      url: `http://127.0.0.1:${PORTA_APP}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Sem isto, um erro de Server Component aparece como teste que falhou
      // sem explicação — o log do Next fica invisível no CI.
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: bancoDeTeste,
        DIRECT_URL: bancoDeTeste,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PORTA_MOCK}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-de-teste",
        SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
        NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORTA_APP}`,
        ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
        CRON_SECRET: "c".repeat(64),
      },
    },
  ],
});
