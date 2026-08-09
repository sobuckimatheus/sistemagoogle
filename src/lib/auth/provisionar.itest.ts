import { randomUUID } from "node:crypto";

import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { provisionarUsuario } from "@/lib/auth/provisionar";
import { prisma } from "@/lib/prisma";

/**
 * Provisionamento da primeira sessão (E1-04), contra um Postgres real.
 *
 * A promessa aqui é transacional — quatro linhas ou nenhuma — e idempotente,
 * porque a função roda no callback do login **e** em todo carregamento da
 * home. Um mock provaria que o código chama `create`; só o banco prova que
 * chamar duas vezes não duplica a conta.
 */

const criados: string[] = [];

function usuarioFalso(): User {
  const id = randomUUID();
  criados.push(id);

  return {
    id,
    email: `${id.slice(0, 8)}@teste.local`,
    user_metadata: { name: "Fulano de Teste" },
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

afterEach(async () => {
  for (const id of criados) {
    const vinculos = await prisma.accountMember.findMany({
      where: { userId: id },
      select: { accountId: true },
    });
    await prisma.account.deleteMany({
      where: { id: { in: vinculos.map((v) => v.accountId) } },
    });
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  criados.length = 0;
});

describe("provisionarUsuario", () => {
  it("cria usuário, conta, vínculo OWNER e assinatura TRIALING", async () => {
    const user = usuarioFalso();
    const conta = await provisionarUsuario(user);

    const [linhaDoUsuario, vinculo, assinatura] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id } }),
      prisma.accountMember.findFirst({ where: { userId: user.id } }),
      prisma.subscription.findUnique({
        where: { accountId: conta.id },
        include: { plan: true },
      }),
    ]);

    expect(linhaDoUsuario?.email).toBe(user.email);
    expect(vinculo?.role).toBe("OWNER");
    expect(assinatura?.status).toBe("TRIALING");
    expect(assinatura?.plan.tier).toBe("FREE");
  });

  it("é idempotente: a segunda chamada devolve a mesma conta", async () => {
    const user = usuarioFalso();

    const primeira = await provisionarUsuario(user);
    const segunda = await provisionarUsuario(user);

    expect(segunda.id).toBe(primeira.id);

    const contas = await prisma.accountMember.count({
      where: { userId: user.id },
    });
    expect(contas).toBe(1);
  });

  it("recusa usuário sem e-mail em vez de criar conta órfã", async () => {
    const semEmail = { ...usuarioFalso(), email: undefined } as unknown as User;

    await expect(provisionarUsuario(semEmail)).rejects.toThrow(/e-mail/i);
  });

  it("atualiza o nome quando ele muda no provedor de identidade", async () => {
    const user = usuarioFalso();
    await provisionarUsuario(user);

    const renomeado = {
      ...user,
      user_metadata: { name: "Nome Novo" },
    } as User;
    await provisionarUsuario(renomeado);

    const linha = await prisma.user.findUnique({ where: { id: user.id } });
    expect(linha?.name).toBe("Nome Novo");
  });
});
