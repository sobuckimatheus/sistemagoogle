import "server-only";

import { calcularEstimativas, variacao } from "@/lib/estimativas";
import { prisma } from "@/lib/prisma";

/**
 * Agregação do dashboard.
 *
 * Tudo aqui lê de PerformanceDaily — nenhuma chamada ao Google. É o que
 * permite comparar dois intervalos quaisquer instantaneamente, e é a razão de
 * o job de sync existir: sem série persistida, "vs. período anterior" só
 * poderia ser calculado no momento da consulta, com uma segunda chamada de
 * API e sem histórico real.
 */

export type Periodo = { inicio: Date; fim: Date; dias: number };

export function periodoDeDias(dias: number): Periodo {
  const fim = new Date();
  fim.setUTCHours(0, 0, 0, 0);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - dias);
  return { inicio, fim, dias };
}

/** Mesmo tamanho, imediatamente antes — a comparação precisa ser justa. */
export function periodoAnterior(periodo: Periodo): Periodo {
  const fim = new Date(periodo.inicio);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - periodo.dias);
  return { inicio, fim, dias: periodo.dias };
}

export type Totais = {
  visualizacoes: number;
  viewsSearch: number;
  viewsMaps: number;
  ligacoes: number;
  rotas: number;
  cliquesNoSite: number;
  conversas: number;
  agendamentos: number;
};

/**
 * Ações por dia no período, para o gráfico do card financeiro.
 *
 * Só as três ações que viram receita na fórmula — a barra do gráfico e o
 * número grande do card precisam sair da mesma conta, ou a leitura mente.
 */
async function serieDeAcoes(businessId: string, periodo: Periodo) {
  const linhas = await prisma.performanceDaily.findMany({
    where: { businessId, date: { gte: periodo.inicio, lt: periodo.fim } },
    select: {
      date: true,
      calls: true,
      directionRequests: true,
      websiteClicks: true,
    },
    orderBy: { date: "asc" },
  });

  return linhas.map((l) => ({
    data: l.date,
    acoes: l.calls + l.directionRequests + l.websiteClicks,
  }));
}

async function somar(businessId: string, periodo: Periodo): Promise<Totais> {
  const r = await prisma.performanceDaily.aggregate({
    where: {
      businessId,
      date: { gte: periodo.inicio, lt: periodo.fim },
    },
    _sum: {
      viewsSearch: true,
      viewsMaps: true,
      calls: true,
      websiteClicks: true,
      directionRequests: true,
      conversations: true,
      bookings: true,
    },
  });

  const s = r._sum;
  const viewsSearch = s.viewsSearch ?? 0;
  const viewsMaps = s.viewsMaps ?? 0;

  return {
    viewsSearch,
    viewsMaps,
    visualizacoes: viewsSearch + viewsMaps,
    ligacoes: s.calls ?? 0,
    rotas: s.directionRequests ?? 0,
    cliquesNoSite: s.websiteClicks ?? 0,
    conversas: s.conversations ?? 0,
    agendamentos: s.bookings ?? 0,
  };
}

export type DadosDashboard = Awaited<ReturnType<typeof montarDashboard>>;

export async function montarDashboard(businessId: string, dias: number) {
  const periodo = periodoDeDias(dias);
  const anterior = periodoAnterior(periodo);

  const [negocio, atual, passado, serie, snapshotAtual, snapshotAnterior] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      somar(businessId, periodo),
      somar(businessId, anterior),
      serieDeAcoes(businessId, periodo),
      prisma.auditSnapshot.findFirst({
        where: { businessId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditSnapshot.findFirst({
        where: { businessId, createdAt: { lt: periodo.inicio } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const [avaliacoes, pendencias] = await Promise.all([
    prisma.review.aggregate({
      where: { businessId },
      _count: true,
      _avg: { starRating: true },
    }),
    prisma.checklistItem.findMany({
      where: { businessId, status: "OPEN" },
      orderBy: [{ priority: "asc" }, { generatedAt: "desc" }],
      take: 5,
    }),
  ]);

  // Benchmark da categoria; se a categoria não estiver na tabela, cai no
  // fallback genérico para que o dashboard nunca fique sem número.
  const benchmark =
    (negocio.primaryCategory
      ? await prisma.segmentBenchmark.findUnique({
          where: { category: negocio.primaryCategory },
        })
      : null) ??
    (await prisma.segmentBenchmark.findUnique({
      where: { category: "Prestador de serviço" },
    }));

  const parametros = {
    ticketMedio: negocio.ticketMedio,
    taxaConversao: negocio.taxaConversaoManual,
  };
  const referencia = {
    avgTicket: benchmark?.avgTicket ?? 300,
    avgConversionRate: benchmark?.avgConversionRate ?? 0.25,
  };

  const estimativas = calcularEstimativas(
    {
      ligacoes: atual.ligacoes,
      rotas: atual.rotas,
      cliquesNoSite: atual.cliquesNoSite,
    },
    atual.visualizacoes,
    parametros,
    referencia,
  );

  // As mesmas fórmulas sobre o período anterior. É o que permite dizer
  // "receita perdida caiu 23%" sem inventar: os dois números saem da mesma
  // conta, com os mesmos parâmetros, sobre janelas de tamanho igual.
  const estimativasAnteriores = calcularEstimativas(
    {
      ligacoes: passado.ligacoes,
      rotas: passado.rotas,
      cliquesNoSite: passado.cliquesNoSite,
    },
    passado.visualizacoes,
    parametros,
    referencia,
  );

  // Sem dado no período anterior não há comparação possível — a interface
  // mostra "sem histórico" em vez de uma variação inventada.
  const temHistorico = passado.visualizacoes > 0 || passado.ligacoes > 0;

  return {
    negocio,
    periodo,
    atual,
    passado,
    temHistorico,
    variacoes: {
      visualizacoes: variacao(atual.visualizacoes, passado.visualizacoes),
      ligacoes: variacao(atual.ligacoes, passado.ligacoes),
      rotas: variacao(atual.rotas, passado.rotas),
      cliquesNoSite: variacao(atual.cliquesNoSite, passado.cliquesNoSite),
    },
    auditoria: {
      score: snapshotAtual?.score ?? null,
      variacao:
        snapshotAtual && snapshotAnterior
          ? snapshotAtual.score - snapshotAnterior.score
          : null,
    },
    avaliacoes: {
      total: avaliacoes._count,
      media: avaliacoes._avg.starRating,
    },
    pendencias,
    serie,
    estimativas,
    estimativasAnteriores,
    variacoesEstimadas: {
      receitaAtual: variacao(
        estimativas.receitaAtual,
        estimativasAnteriores.receitaAtual,
      ),
      receitaPerdida: variacao(
        estimativas.receitaPerdida,
        estimativasAnteriores.receitaPerdida,
      ),
      clientesEstimados: variacao(
        estimativas.clientesEstimados,
        estimativasAnteriores.clientesEstimados,
      ),
    },
    benchmarkUsado: benchmark?.category ?? null,
    fonteBenchmark: benchmark?.source ?? null,
  };
}
