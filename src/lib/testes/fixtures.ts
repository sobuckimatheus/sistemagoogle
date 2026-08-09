import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * Dados descartáveis para a suíte de integração.
 *
 * Cada conta criada recebe um sufixo aleatório e é removida no fim do teste.
 * Nada aqui é usado pela aplicação — este módulo só é importado por arquivos
 * `*.itest.ts`.
 */

export type ContaDeTeste = Awaited<ReturnType<typeof criarConta>>;

export async function criarConta(rotulo: string) {
  const sufixo = randomUUID().slice(0, 8);

  const usuario = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${rotulo}-${sufixo}@teste.local`,
      name: `Teste ${rotulo}`,
    },
  });

  const planoFree = await prisma.plan.findUniqueOrThrow({
    where: { tier: "FREE" },
  });

  const conta = await prisma.account.create({
    data: {
      name: `Conta ${rotulo} ${sufixo}`,
      members: { create: { userId: usuario.id, role: "OWNER" } },
      subscription: { create: { planId: planoFree.id, status: "ACTIVE" } },
    },
  });

  const conexao = await prisma.googleConnection.create({
    data: {
      accountId: conta.id,
      connectedByUserId: usuario.id,
      googleAccountEmail: `${rotulo}-${sufixo}@gmail.com`,
      status: "ACTIVE",
    },
  });

  const negocio = await prisma.business.create({
    data: {
      accountId: conta.id,
      googleConnectionId: conexao.id,
      locationName: `locations/${sufixo}`,
      title: `Negócio ${rotulo}`,
      primaryCategory: "Barbearia",
      city: "São Paulo",
    },
  });

  return { usuario, conta, conexao, negocio };
}

/**
 * Remove a conta e tudo que pende dela.
 *
 * `users` não cai em cascata a partir de `accounts` — o vínculo é o contrário
 * —, então precisa ser apagado à parte.
 */
export async function removerConta(dados: ContaDeTeste) {
  await prisma.account.delete({ where: { id: dados.conta.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: dados.usuario.id } }).catch(() => {});
}
