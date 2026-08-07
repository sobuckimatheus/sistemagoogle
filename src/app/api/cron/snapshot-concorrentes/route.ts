import { NextResponse, type NextRequest } from "next/server";

import { segredoConfere } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { buscarConcorrentes } from "@/lib/google/places";
import { prisma } from "@/lib/prisma";
import { executarComRegistro } from "@/lib/sync/execucao";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Snapshot semanal dos concorrentes.
 *
 * Semanal e não diário porque a Places API é cobrada por consulta e nota de
 * concorrente muda devagar — diário multiplicaria o custo sem melhorar a
 * leitura da tendência.
 */
export async function GET(request: NextRequest) {
  const recebido = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );

  if (!segredoConfere(recebido, serverEnv.CRON_SECRET)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const execucao = await executarComRegistro(
    "snapshot-concorrentes",
    null,
    async () => {
      const { concorrentes, capturados, erros } = await capturarSnapshots();
      return {
        resultado: { concorrentes, capturados, erros },
        status:
          erros.length === 0
            ? ("SUCCESS" as const)
            : capturados > 0
              ? ("PARTIAL" as const)
              : ("FAILED" as const),
        itens: capturados,
      };
    },
  );

  if ("pulado" in execucao) {
    return NextResponse.json({ pulado: "já em execução" }, { status: 409 });
  }

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    ...execucao.resultado,
  });
}

async function capturarSnapshots() {
  const concorrentes = await prisma.competitor.findMany({
    where: { placeId: { not: null }, business: { status: "ACTIVE" } },
    include: { business: true },
  });

  let capturados = 0;
  const erros: string[] = [];

  for (const c of concorrentes) {
    try {
      // Busca pelo nome e endereço para reencontrar o mesmo lugar; a Places
      // API não tem endpoint de "buscar por id" no plano de texto usado aqui.
      const encontrados = await buscarConcorrentes(
        `${c.name} ${c.address ?? ""}`.trim(),
        c.business.lat !== null && c.business.lng !== null
          ? { lat: c.business.lat, lng: c.business.lng }
          : undefined,
      );

      const atual = encontrados.find((e) => e.placeId === c.placeId);
      if (!atual) {
        erros.push(`${c.name}: não encontrado`);
        continue;
      }

      await prisma.competitorSnapshot.create({
        data: {
          competitorId: c.id,
          rating: atual.nota,
          reviewCount: atual.totalAvaliacoes,
          hasWebsite: Boolean(atual.site),
          hasHours: atual.temHorarios,
        },
      });
      capturados++;
    } catch (erro) {
      erros.push(`${c.name}: ${(erro as Error).message}`);
    }
  }

  return { concorrentes: concorrentes.length, capturados, erros };
}
