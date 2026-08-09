import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { consumirCota, type Limite } from "@/lib/rate-limit";

/**
 * Rate limiting (E10-05) contra um Postgres real.
 *
 * A regra que importa aqui só existe no banco: a contagem por janela e o
 * descarte do registro recusado. Com um contador em memória, o teste passaria
 * e a produção continuaria furada — cada instância serverless teria a própria
 * contagem.
 */

const contas: string[] = [];

function contaNova(): string {
  const id = randomUUID();
  contas.push(id);
  return id;
}

afterEach(async () => {
  await prisma.rateLimitHit.deleteMany({
    where: { chave: { in: contas.map((c) => `teste:${c}`) } },
  });
});

const limite: Limite = { recurso: "teste", maximo: 3, janelaMinutos: 60 };

describe("consumirCota", () => {
  it("libera até o máximo e recusa a partir dali", async () => {
    const conta = contaNova();

    const resultados = [];
    for (let i = 0; i < 5; i++) {
      resultados.push(await consumirCota(limite, conta));
    }

    expect(resultados.filter((r) => r.permitido)).toHaveLength(3);
    expect(resultados.filter((r) => !r.permitido)).toHaveLength(2);
  });

  it("a tentativa recusada não fica contando contra a janela", async () => {
    const conta = contaNova();

    for (let i = 0; i < 5; i++) await consumirCota(limite, conta);

    // Três permitidas gravadas; as duas recusadas foram removidas. Do
    // contrário, o usuário seria punido duas vezes pelo mesmo clique.
    const gravadas = await prisma.rateLimitHit.count({
      where: { chave: `teste:${conta}` },
    });
    expect(gravadas).toBe(3);
  });

  it("conta separado por conta", async () => {
    const uma = contaNova();
    const outra = contaNova();

    for (let i = 0; i < 3; i++) await consumirCota(limite, uma);

    const daOutra = await consumirCota(limite, outra);
    expect(daOutra.permitido).toBe(true);
  });

  it("ignora consumo fora da janela", async () => {
    const conta = contaNova();
    const chave = `teste:${conta}`;

    // Consumo antigo: dentro do limite numérico, fora do tempo.
    await prisma.rateLimitHit.createMany({
      data: Array.from({ length: 3 }, () => ({
        chave,
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
      })),
    });

    const agora = await consumirCota(limite, conta);
    expect(agora.permitido).toBe(true);
  });

  it("informa quantas restam", async () => {
    const conta = contaNova();
    const primeira = await consumirCota(limite, conta);

    expect(primeira.permitido).toBe(true);
    if (primeira.permitido) expect(primeira.restantes).toBe(2);
  });
});
