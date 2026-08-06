import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    // Resolve o alias "@/..." lendo o tsconfig, sem plugin extra.
    tsconfigPaths: true,
    alias: {
      // Vários módulos de servidor importam "server-only", que lança fora do
      // contexto de React Server. Nos testes ele vira no-op.
      "server-only": fileURLToPath(
        new URL("./vitest.server-only.ts", import.meta.url),
      ),
    },
  },
});
