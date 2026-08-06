import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { serverEnv } from "@/lib/env/server";

/**
 * Prisma Client — instância única por processo.
 *
 * Dois cuidados que este arquivo resolve:
 *
 * 1. Hot reload. Em desenvolvimento o Next recarrega os módulos a cada
 *    alteração; sem o cache em globalThis, cada reload criaria um PrismaClient
 *    novo e o Postgres derrubaria a aplicação por excesso de conexões.
 *
 * 2. Pooling. A conexão usada aqui é o transaction pooler do Supabase (6543),
 *    via driver adapter. A conexão direta (5432) fica reservada para
 *    migrations, em prisma.config.ts.
 */

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: serverEnv.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
