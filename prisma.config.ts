// O Prisma 7 não carrega mais o .env sozinho — sem esta linha, DIRECT_URL
// chega indefinida e o CLI falha antes de qualquer comando.
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Configuração do Prisma CLI (migrate, db, studio).
 *
 * A URL daqui é usada apenas por comandos de migration, e por isso aponta para
 * a conexão DIRETA (5432): o transaction pooler do Supabase não suporta o DDL
 * que o migrate emite.
 *
 * A conexão de runtime é outra — vive em src/lib/prisma.ts, usa o pooler
 * (6543) através do driver adapter, e nunca passa por aqui.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
