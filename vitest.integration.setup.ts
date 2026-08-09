import { execFileSync } from "node:child_process";

/**
 * Prepara o banco da suíte de integração.
 *
 * Aplica as migrations reais, e não um `db push`: o que interessa testar é o
 * schema que vai para produção, com os defaults e triggers que só existem no
 * SQL das migrations.
 */

/** Marca obrigatória no nome do banco. É a trava contra rodar em produção. */
const MARCA_DE_TESTE = "test";

export async function setup() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. A suíte de integração precisa de um Postgres " +
        "efêmero — veja o job `integracao` em .github/workflows/ci.yml.",
    );
  }

  // Duas checagens, não uma: um banco chamado "..._test" hospedado no Supabase
  // ainda seria um banco remoto de alguém.
  const nomeDoBanco = new URL(url).pathname.replace("/", "");
  const host = new URL(url).hostname;

  if (!nomeDoBanco.includes(MARCA_DE_TESTE)) {
    throw new Error(
      `Recusando rodar: o banco "${nomeDoBanco}" não tem "${MARCA_DE_TESTE}" no nome.`,
    );
  }

  if (!["localhost", "127.0.0.1", "postgres", "db"].includes(host)) {
    throw new Error(
      `Recusando rodar: host "${host}" não parece um Postgres efêmero local.`,
    );
  }

  // `migrate deploy` usa DIRECT_URL (prisma.config.ts); no ambiente de teste as
  // duas apontam para o mesmo Postgres, sem pooler no meio.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DIRECT_URL: process.env.DIRECT_URL ?? url },
  });
}
