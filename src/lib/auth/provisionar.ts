import "server-only";

import type { User } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";

/**
 * Garante que o usuário autenticado tenha estrutura mínima no nosso banco.
 *
 * O Supabase Auth é a fonte de verdade da identidade, mas nada além disso: as
 * tabelas de negócio são nossas. Na primeira sessão de cada usuário criamos,
 * numa única transação:
 *
 *   users            espelho local, com o mesmo id do Supabase Auth
 *   accounts         o tenant
 *   account_members  vínculo com papel OWNER
 *   subscriptions    assinatura TRIALING no plano FREE
 *
 * É idempotente: chamar de novo não duplica nada, o que importa porque a
 * função roda tanto no callback quanto em todo carregamento da home.
 */
export async function provisionarUsuario(user: User) {
  const email = user.email;
  if (!email) {
    throw new Error(
      `Usuário ${user.id} não tem e-mail — provisionamento exige e-mail.`,
    );
  }

  const nome =
    (user.user_metadata?.name as string | undefined)?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: user.id },
      update: { email, ...(nome ? { name: nome } : {}) },
      create: { id: user.id, email, name: nome },
    });

    const vinculo = await tx.accountMember.findFirst({
      where: { userId: user.id },
      include: { account: true },
    });

    if (vinculo) {
      return vinculo.account;
    }

    // Sem plano FREE no banco a assinatura não pode ser criada — o seed
    // (prisma/migrations/2_seed) é pré-requisito de funcionamento, não dado
    // de exemplo.
    const planoFree = await tx.plan.findUnique({ where: { tier: "FREE" } });
    if (!planoFree) {
      throw new Error(
        "Plano FREE não encontrado. Rode o seed: prisma/migrations/2_seed/migration.sql",
      );
    }

    const conta = await tx.account.create({
      data: {
        name: nome ? `Conta de ${nome}` : email,
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
        subscription: {
          create: { planId: planoFree.id, status: "TRIALING" },
        },
      },
    });

    return conta;
  });
}
