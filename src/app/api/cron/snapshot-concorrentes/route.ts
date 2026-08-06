import { NextResponse, type NextRequest } from "next/server";

import { segredoConfere } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { buscarConcorrentes } from "@/lib/google/places";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    concorrentes: concorrentes.length,
    capturados,
    erros,
  });
}
