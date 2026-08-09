import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Suíte de integração (E10-02).
 *
 * Separada da suíte unitária porque exige um Postgres de verdade: o que se
 * testa aqui é justamente o que um mock esconderia — transação, índice único,
 * advisory lock e janela de tempo no banco.
 *
 * Roda contra um Postgres efêmero (service container do CI, ou um container
 * local), nunca contra produção: o `globalSetup` recusa qualquer banco que não
 * seja explicitamente de teste.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    globalSetup: ["./vitest.integration.setup.ts"],
    setupFiles: ["./vitest.integration.env.ts"],
    // As migrations e a limpeza entre arquivos compartilham o mesmo banco;
    // rodar em paralelo faria um arquivo apagar a linha do outro.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./vitest.server-only.ts", import.meta.url),
      ),
    },
  },
});
