import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exigirNegocioDaConta, papelNaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";
import { criarConta, removerConta, type ContaDeTeste } from "@/lib/testes/fixtures";

/**
 * Isolamento entre tenants, contra um Postgres real (E10-04 + E10-02).
 *
 * O teste estático em `isolamento.test.ts` prova que toda Server Action chama
 * uma guarda. Este prova que a guarda **funciona**: com duas contas de verdade
 * no banco, a de fora não alcança o dado da de dentro.
 *
 * Vale lembrar por que isso não é paranoia: o Prisma se conecta como dono do
 * banco e **ignora a RLS do Supabase**. Nenhuma política de linha protege
 * estas queries — só o `where`.
 */

let alice: ContaDeTeste;
let bob: ContaDeTeste;

beforeAll(async () => {
  alice = await criarConta("alice");
  bob = await criarConta("bob");
});

afterAll(async () => {
  await removerConta(alice);
  await removerConta(bob);
});

describe("exigirNegocioDaConta", () => {
  it("devolve o negócio para a conta dona", async () => {
    const negocio = await exigirNegocioDaConta(
      alice.negocio.id,
      alice.conta.id,
    );
    expect(negocio.id).toBe(alice.negocio.id);
  });

  it("recusa o negócio de outra conta", async () => {
    // `notFound()` lança — e é 404 de propósito: responder 403 confirmaria
    // que o id existe, o que já é vazamento.
    await expect(
      exigirNegocioDaConta(alice.negocio.id, bob.conta.id),
    ).rejects.toThrow();
  });

  it("recusa id inexistente do mesmo jeito que id de outra conta", async () => {
    await expect(
      exigirNegocioDaConta("nao-existe", bob.conta.id),
    ).rejects.toThrow();
  });
});

describe("papelNaConta", () => {
  it("reconhece o dono", async () => {
    expect(await papelNaConta(alice.conta.id, alice.usuario.id)).toBe("OWNER");
  });

  it("recusa quem não é membro", async () => {
    await expect(
      papelNaConta(alice.conta.id, bob.usuario.id),
    ).rejects.toThrow();
  });
});

describe("consultas escopadas por conta", () => {
  it("não conta palavras-chave de outra conta no limite do plano", async () => {
    await prisma.keyword.createMany({
      data: [
        { businessId: alice.negocio.id, term: "corte masculino" },
        { businessId: alice.negocio.id, term: "barba" },
        { businessId: bob.negocio.id, term: "corte masculino" },
      ],
    });

    const daAlice = await prisma.keyword.count({
      where: { business: { accountId: alice.conta.id } },
    });
    const doBob = await prisma.keyword.count({
      where: { business: { accountId: bob.conta.id } },
    });

    expect(daAlice).toBe(2);
    expect(doBob).toBe(1);
  });

  it("apagar a conta leva junto os dados dela, e só os dela", async () => {
    const descartavel = await criarConta("descartavel");
    await prisma.keyword.create({
      data: { businessId: descartavel.negocio.id, term: "temporario" },
    });

    await prisma.account.delete({ where: { id: descartavel.conta.id } });

    // Cascata configurada no schema: negócio e palavras-chave somem juntos.
    expect(
      await prisma.business.count({
        where: { accountId: descartavel.conta.id },
      }),
    ).toBe(0);

    // E o vizinho continua intacto.
    expect(
      await prisma.keyword.count({
        where: { business: { accountId: alice.conta.id } },
      }),
    ).toBe(2);

    await prisma.user
      .delete({ where: { id: descartavel.usuario.id } })
      .catch(() => {});
  });
});
