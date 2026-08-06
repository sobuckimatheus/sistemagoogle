import { type NextRequest } from "next/server";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { periodoDeDias } from "@/lib/dashboard/agregacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const COLUNAS = [
  "data",
  "visualizacoes_busca",
  "visualizacoes_maps",
  "visualizacoes_total",
  "ligacoes",
  "rotas",
  "cliques_site",
  "conversas",
  "agendamentos",
] as const;

/** Escapa o valor conforme RFC 4180: aspas dobradas e campo entre aspas. */
function campoCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const diasBruto = Number(request.nextUrl.searchParams.get("dias"));
  const dias = [30, 90, 365].includes(diasBruto) ? diasBruto : 30;
  const periodo = periodoDeDias(dias);

  const linhas = await prisma.performanceDaily.findMany({
    where: { businessId: id, date: { gte: periodo.inicio, lt: periodo.fim } },
    orderBy: { date: "asc" },
  });

  const corpo = [
    // Ponto e vírgula como separador: é o que o Excel em português espera, e
    // vírgula quebraria a abertura por duplo clique.
    COLUNAS.join(";"),
    ...linhas.map((l) =>
      [
        l.date.toISOString().slice(0, 10),
        l.viewsSearch,
        l.viewsMaps,
        l.viewsSearch + l.viewsMaps,
        l.calls,
        l.directionRequests,
        l.websiteClicks,
        l.conversations,
        l.bookings,
      ]
        .map(campoCsv)
        .join(";"),
    ),
  ].join("\r\n");

  const nomeArquivo = `relatorio-${negocio.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${dias}d.csv`;

  await prisma.report.create({
    data: {
      businessId: id,
      periodStart: periodo.inicio,
      periodEnd: periodo.fim,
      format: "csv",
      fileUrl: `/api/negocio/${id}/relatorio.csv?dias=${dias}`,
    },
  });

  // BOM para o Excel reconhecer UTF-8 e não estragar a acentuação.
  return new Response(`﻿${corpo}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
