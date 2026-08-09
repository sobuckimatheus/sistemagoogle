import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { abrirExecucao, fecharExecucao } from "@/lib/sync/execucao";
import { criarConta, removerConta, type ContaDeTeste } from "@/lib/testes/fixtures";

/**
 * Lock de execução dos jobs (E4-03), contra um Postgres real.
 *
 * Este é o teste que justifica a suíte de integração inteira: o lock depende
 * de `pg_try_advisory_xact_lock` e de uma transação de verdade. Com o Prisma
 * mockado, o teste passaria mesmo se o lock não existisse — que é exatamente
 * o bug que ele precisa pegar.
 */

let conta: ContaDeTeste;

beforeAll(async () => {
  conta = await criarConta("execucao");
});

afterAll(async () => {
  await prisma.syncRun.deleteMany({ where: { businessId: conta.negocio.id } });
  await removerConta(conta);
});

describe("abrirExecucao", () => {
  it("a segunda chamada é recusada enquanto a primeira está aberta", async () => {
    const primeira = await abrirExecucao("sync-diario", conta.negocio.id);
    expect(primeira).not.toBeNull();

    const segunda = await abrirExecucao("sync-diario", conta.negocio.id);
    expect(segunda).toBeNull();

    await fecharExecucao(primeira!, { status: "SUCCESS", itens: 3 });
  });

  it("libera depois que a execução fecha", async () => {
    const nova = await abrirExecucao("sync-diario", conta.negocio.id);
    expect(nova).not.toBeNull();
    await fecharExecucao(nova!, { status: "SUCCESS" });
  });

  it("negócios diferentes não disputam o mesmo lock", async () => {
    const outra = await criarConta("execucao-vizinha");

    const a = await abrirExecucao("sync-diario", conta.negocio.id);
    const b = await abrirExecucao("sync-diario", outra.negocio.id);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    await fecharExecucao(a!, { status: "SUCCESS" });
    await fecharExecucao(b!, { status: "SUCCESS" });

    await prisma.syncRun.deleteMany({ where: { businessId: outra.negocio.id } });
    await removerConta(outra);
  });

  it("cinco invocações simultâneas abrem uma execução só", async () => {
    // O cenário real: o cron dispara duas vezes, ou alguém chama a rota na mão
    // enquanto o agendador roda. Sem o advisory lock, mais de uma passa pela
    // checagem de "já existe RUNNING?" antes de qualquer uma gravar.
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        abrirExecucao("publicar-agendados", conta.negocio.id),
      ),
    );

    const abertas = resultados.filter((id): id is string => id !== null);
    expect(abertas).toHaveLength(1);

    await fecharExecucao(abertas[0], { status: "SUCCESS" });
  });

  it("considera abandonada a execução RUNNING antiga", async () => {
    // Processo serverless morre sem chegar ao `finally`; sem prazo de
    // validade, essa linha travaria o negócio para sempre.
    const quarentaMinutosAtras = new Date(Date.now() - 40 * 60_000);

    await prisma.syncRun.create({
      data: {
        jobType: "sync-diario",
        businessId: conta.negocio.id,
        status: "RUNNING",
        startedAt: quarentaMinutosAtras,
      },
    });

    const nova = await abrirExecucao("sync-diario", conta.negocio.id);
    expect(nova).not.toBeNull();

    await fecharExecucao(nova!, { status: "SUCCESS" });
  });
});

describe("fecharExecucao", () => {
  it("grava status, itens e o fim da execução", async () => {
    const id = await abrirExecucao("snapshot-concorrentes", null);
    expect(id).not.toBeNull();

    await fecharExecucao(id!, {
      status: "PARTIAL",
      itens: 7,
      erro: "duas contas sem allowlist",
    });

    const registro = await prisma.syncRun.findUniqueOrThrow({
      where: { id: id! },
    });

    expect(registro.status).toBe("PARTIAL");
    expect(registro.itemsProcessed).toBe(7);
    expect(registro.errorMessage).toBe("duas contas sem allowlist");
    expect(registro.finishedAt).not.toBeNull();

    await prisma.syncRun.delete({ where: { id: id! } });
  });

  it("trunca mensagem de erro enorme em vez de estourar a coluna", async () => {
    const id = await abrirExecucao("volume-keywords", null);
    await fecharExecucao(id!, { status: "FAILED", erro: "x".repeat(5000) });

    const registro = await prisma.syncRun.findUniqueOrThrow({
      where: { id: id! },
    });
    expect(registro.errorMessage).toHaveLength(2000);

    await prisma.syncRun.delete({ where: { id: id! } });
  });
});
