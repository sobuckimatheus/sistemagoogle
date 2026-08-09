import "server-only";

import type { SyncRunStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Registro de execução e lock dos jobs.
 *
 * Dois problemas resolvidos no mesmo lugar porque são o mesmo ciclo de vida:
 *
 * 1. **Auditoria** (E4-02) — cada execução grava início, fim, itens
 *    processados e erro em `sync_runs`. Sem isso, "por que o negócio X ficou
 *    três dias sem dado?" só teria resposta no log da plataforma de deploy,
 *    que expira e não é consultável por negócio.
 *
 * 2. **Exclusão mútua** (E4-03) — o cron da Vercel pode disparar duas vezes
 *    (retry, redeploy, execução manual sobreposta). Sem lock, dois syncs do
 *    mesmo negócio correm juntos, gastam cota em dobro e disputam os mesmos
 *    upserts.
 *
 * O lock é a própria linha `RUNNING` em `sync_runs`, não um lock de sessão do
 * Postgres: o runtime fala com o banco pelo pooler em modo transação, onde
 * cada query pode cair em uma conexão diferente e um `pg_advisory_lock` de
 * sessão seria liberado sem aviso. O advisory lock usado aqui é o de
 * transação (`pg_try_advisory_xact_lock`), que vive só dentro da transação
 * curta que decide quem entra — o suficiente para serializar o
 * "verifica e cria", que é onde mora a corrida.
 */

/**
 * Depois disto, uma execução `RUNNING` é considerada abandonada.
 *
 * Um processo serverless pode morrer sem chegar ao `finally` (timeout da
 * função, deploy no meio da execução). Sem prazo de validade, essa linha
 * travaria o negócio para sempre.
 */
const MINUTOS_ATE_ABANDONAR = 30;

export type JobType =
  | "sync-diario"
  | "snapshot-concorrentes"
  | "publicar-agendados"
  | "volume-keywords";

export type FimDaExecucao = {
  status: Exclude<SyncRunStatus, "RUNNING">;
  itens?: number;
  erro?: string;
};

/**
 * Abre uma execução, garantindo que não haja outra igual em andamento.
 *
 * Devolve `null` quando o job já está rodando para o mesmo alvo — o chamador
 * deve pular, não esperar: em ambiente serverless, esperar é pagar tempo de
 * função para fazer nada.
 */
export async function abrirExecucao(
  jobType: JobType,
  businessId: string | null = null,
): Promise<string | null> {
  const chave = `${jobType}:${businessId ?? "global"}`;
  const limite = new Date(Date.now() - MINUTOS_ATE_ABANDONAR * 60_000);

  return prisma.$transaction(async (tx) => {
    const [{ obtido }] = await tx.$queryRaw<{ obtido: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext(${chave})) AS obtido
    `;

    // Outra invocação está exatamente neste ponto do código. Ela vai criar a
    // linha RUNNING; esta desiste.
    if (!obtido) return null;

    const emAndamento = await tx.syncRun.findFirst({
      where: {
        jobType,
        businessId,
        status: "RUNNING",
        startedAt: { gt: limite },
      },
      select: { id: true },
    });

    if (emAndamento) return null;

    const execucao = await tx.syncRun.create({
      data: { jobType, businessId, status: "RUNNING" },
      select: { id: true },
    });

    return execucao.id;
  });
}

export async function fecharExecucao(
  execucaoId: string,
  fim: FimDaExecucao,
): Promise<void> {
  await prisma.syncRun.update({
    where: { id: execucaoId },
    data: {
      status: fim.status,
      itemsProcessed: fim.itens ?? 0,
      // Mensagem de erro pode vir de API externa e ser enorme; o que importa
      // para diagnóstico está no começo.
      errorMessage: fim.erro ? fim.erro.slice(0, 2000) : null,
      finishedAt: new Date(),
    },
  });
}

/**
 * Executa `tarefa` sob lock, registrando a execução.
 *
 * A tarefa devolve como terminou (status e itens) porque só ela sabe: um sync
 * em que o desempenho gravou e as avaliações falharam por allowlist não é
 * sucesso nem falha — é PARTIAL, e essa distinção é o que evita alarme falso.
 */
export async function executarComRegistro<T>(
  jobType: JobType,
  businessId: string | null,
  tarefa: () => Promise<{ resultado: T } & Omit<FimDaExecucao, "erro">>,
): Promise<{ execucaoId: string; resultado: T } | { pulado: true }> {
  const execucaoId = await abrirExecucao(jobType, businessId);
  if (!execucaoId) return { pulado: true };

  try {
    const { resultado, status, itens } = await tarefa();
    await fecharExecucao(execucaoId, { status, itens });
    return { execucaoId, resultado };
  } catch (erro) {
    await fecharExecucao(execucaoId, {
      status: "FAILED",
      erro: (erro as Error).message,
    });
    throw erro;
  }
}
