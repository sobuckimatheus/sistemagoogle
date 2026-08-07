import { NextResponse, type NextRequest } from "next/server";

import { segredoConfere } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { prisma } from "@/lib/prisma";
import { alertaDeSyncFalho } from "@/lib/sync/alertas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vigia dos jobs (E10-06).
 *
 * O modo de falha mais perigoso do produto não é o job que quebra — esse
 * grava `SyncRun` FAILED e gera alerta. É o job que **para de rodar**: cron
 * desabilitado num redeploy, projeto pausado, agendamento removido. Nesse
 * caso não existe execução nenhuma para falhar, ninguém é avisado, e a tela
 * segue exibindo o dado velho como se fosse de hoje.
 *
 * Este endpoint procura por ausência, não por erro: negócio ativo cuja última
 * sincronização bem-sucedida passou do prazo vira alerta crítico.
 *
 * Roda por um agendamento separado dos demais de propósito — um vigia que
 * depende do mesmo mecanismo que ele vigia não vigia nada. O passo seguinte,
 * fora do código, é apontar um monitor externo (cron-monitor, Better Stack)
 * para esta rota: se ela mesma parar de responder, alguém precisa saber.
 */
const HORAS_ATE_SUSPEITAR = 36;

export async function GET(request: NextRequest) {
  const recebido = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );

  if (!segredoConfere(recebido, serverEnv.CRON_SECRET)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const limite = new Date(Date.now() - HORAS_ATE_SUSPEITAR * 3600_000);

  const negocios = await prisma.business.findMany({
    where: {
      status: "ACTIVE",
      googleConnection: { status: "ACTIVE" },
      account: {
        subscription: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      },
      // `lastSyncedAt` nulo é negócio recém-conectado que ainda não teve o
      // primeiro sync: não é job parado, é fila normal.
      lastSyncedAt: { lt: limite },
    },
    select: { id: true, title: true, lastSyncedAt: true },
  });

  const alertados: string[] = [];

  for (const negocio of negocios) {
    const criou = await alertaDeSyncFalho(
      negocio.id,
      `sem sincronização há mais de ${HORAS_ATE_SUSPEITAR} horas`,
    );
    if (criou) alertados.push(negocio.title);
  }

  // Também reporta a última execução de cada job, para quem abrir a rota na
  // mão conseguir ver o estado sem consultar o banco.
  const ultimasExecucoes = await prisma.syncRun.groupBy({
    by: ["jobType", "status"],
    _max: { startedAt: true },
  });

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    limiteHoras: HORAS_ATE_SUSPEITAR,
    negociosAtrasados: negocios.length,
    alertasCriados: alertados.length,
    alertados,
    ultimasExecucoes,
  });
}
