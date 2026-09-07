import "server-only";

import { auditar, type EntradaAuditoria } from "@/lib/auditoria";
import { listarAvaliacoes, ApiV4IndisponivelError } from "@/lib/google/avaliacoes";
import { accessTokenValido } from "@/lib/google/conexao";
import { AllowlistPendenteError } from "@/lib/google/locais";
import { buscarDesempenhoDiario } from "@/lib/google/performance";
import { prisma } from "@/lib/prisma";
import { gerarAlertas } from "@/lib/sync/alertas";

/**
 * Janela de reprocessamento do desempenho.
 *
 * A Performance API publica com atraso e corrige números já entregues. Buscar
 * só "ontem" deixaria o histórico permanentemente errado, então cada execução
 * reescreve os últimos dias.
 */
const DIAS_REPROCESSAR = 5;

export type ResultadoSync = {
  businessId: string;
  desempenho: { dias: number } | { erro: string };
  avaliacoes: { total: number } | { erro: string };
  auditoria: { score: number } | { erro: string };
  alertas?: { erro: string };
};

/** Etapas do sync que falharam, na ordem em que aparecem no resultado. */
export function errosDoSync(resultado: ResultadoSync): string[] {
  return [resultado.desempenho, resultado.avaliacoes, resultado.auditoria]
    .filter((etapa) => "erro" in etapa)
    .map((etapa) => (etapa as { erro: string }).erro);
}

/**
 * Traduz o resultado do sync no status da execução (E4-02).
 *
 * PARTIAL não é meia-falha: com a API v4 fora do allowlist, "desempenho ok +
 * avaliações bloqueadas" é o estado normal por semanas. Marcar isso como
 * FAILED faria o alerta de sync tocar todo dia sem nada que o usuário possa
 * resolver — e alerta que não se pode resolver é alerta que se aprende a
 * ignorar.
 */
export function statusDoSync(
  resultado: ResultadoSync,
): "SUCCESS" | "PARTIAL" | "FAILED" {
  const quantidade = errosDoSync(resultado).length;
  if (quantidade === 0) return "SUCCESS";
  return quantidade === 3 ? "FAILED" : "PARTIAL";
}

/** Quantidade de registros escritos, para o log de execução. */
export function itensDoSync(resultado: ResultadoSync): number {
  const dias = "dias" in resultado.desempenho ? resultado.desempenho.dias : 0;
  const avaliacoes =
    "total" in resultado.avaliacoes ? resultado.avaliacoes.total : 0;
  return dias + avaliacoes;
}

/** Motivo a exibir quando o sync inteiro falhou. */
export function primeiroErro(resultado: ResultadoSync): string {
  return errosDoSync(resultado)[0] ?? "motivo não informado";
}

/**
 * Sincroniza um negócio: desempenho, avaliações e auditoria.
 *
 * Cada etapa é isolada: se a API v4 estiver bloqueada por allowlist, o
 * desempenho ainda é gravado e a auditoria roda com o que existe. Falhar tudo
 * por causa de uma API indisponível deixaria o produto sem dado nenhum
 * durante as semanas de espera pela aprovação.
 */
export async function sincronizarNegocio(
  businessId: string,
  opcoes: { diasDeHistorico?: number } = {},
): Promise<ResultadoSync> {
  const negocio = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
  });

  // Guardado antes de qualquer escrita: é a fronteira entre "o que já
  // existia" e "o que chegou agora", e o gerador de alertas depende dela.
  const referenciaAnterior = negocio.lastSyncedAt;

  const token = await accessTokenValido(negocio.googleConnectionId);

  const resultado: ResultadoSync = {
    businessId,
    desempenho: { erro: "não executado" },
    avaliacoes: { erro: "não executado" },
    auditoria: { erro: "não executado" },
  };

  // ── Desempenho ────────────────────────────────────────────────────────────
  try {
    const fim = new Date();
    const inicio = new Date(fim);
    inicio.setUTCDate(
      inicio.getUTCDate() - (opcoes.diasDeHistorico ?? DIAS_REPROCESSAR),
    );

    const dias = await buscarDesempenhoDiario(
      token,
      negocio.locationName,
      inicio,
      fim,
    );

    for (const dia of dias) {
      const { data, ...metricas } = dia;
      await prisma.performanceDaily.upsert({
        where: { businessId_date: { businessId, date: data } },
        update: { ...metricas, syncedAt: new Date() },
        create: { businessId, date: data, ...metricas },
      });
    }

    resultado.desempenho = { dias: dias.length };
  } catch (erro) {
    resultado.desempenho = {
      erro:
        erro instanceof AllowlistPendenteError
          ? "allowlist pendente"
          : (erro as Error).message,
    };
  }

  // ── Avaliações ────────────────────────────────────────────────────────────
  try {
    if (!negocio.gbpAccountName) {
      throw new Error("negócio sem conta GBP associada");
    }

    const avaliacoes = await listarAvaliacoes(
      token,
      negocio.gbpAccountName,
      negocio.locationName,
    );

    for (const a of avaliacoes) {
      await prisma.review.upsert({
        where: {
          businessId_gbpReviewId: { businessId, gbpReviewId: a.gbpReviewId },
        },
        update: {
          starRating: a.starRating,
          comment: a.comment,
          replyText: a.replyText,
          repliedAt: a.repliedAt,
          updateTime: a.updateTime,
          syncedAt: new Date(),
        },
        create: { businessId, ...a },
      });
    }

    resultado.avaliacoes = { total: avaliacoes.length };
  } catch (erro) {
    resultado.avaliacoes = {
      erro:
        erro instanceof ApiV4IndisponivelError
          ? "API v4 sem allowlist"
          : (erro as Error).message,
    };
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────
  try {
    const score = await rodarAuditoria(businessId);
    resultado.auditoria = { score };
  } catch (erro) {
    resultado.auditoria = { erro: (erro as Error).message };
  }

  // Alertas por último: comparam o estado recém-gravado com o anterior.
  try {
    await gerarAlertas(businessId, referenciaAnterior);
  } catch (erro) {
    resultado.alertas = { erro: (erro as Error).message };
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { lastSyncedAt: new Date() },
  });

  return resultado;
}

/**
 * Recalcula a nota, grava o snapshot e regenera o checklist.
 *
 * Itens já resolvidos ou dispensados pelo usuário são preservados — regenerar
 * tudo faria o trabalho manual dele desaparecer a cada sync.
 */
export async function rodarAuditoria(businessId: string): Promise<number> {
  const negocio = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
  });

  const agora = Date.now();

  const [agregado, respondidas, postagens, recentes, termos, concorrentes] =
    await Promise.all([
      prisma.review.aggregate({
        where: { businessId },
        _count: true,
        _avg: { starRating: true },
      }),
      prisma.review.count({ where: { businessId, replyText: { not: null } } }),
      prisma.post.count({
        where: {
          businessId,
          state: "PUBLISHED",
          publishedAt: { gte: new Date(agora - 30 * 24 * 3600 * 1000) },
        },
      }),
      prisma.review.count({
        where: {
          businessId,
          createTime: { gte: new Date(agora - 90 * 24 * 3600 * 1000) },
        },
      }),
      prisma.keyword.findMany({
        where: { businessId, active: true },
        select: { term: true },
        orderBy: { volume: "desc" },
        take: 10,
      }),
      // O snapshot mais recente de cada concorrente é a régua da primeira
      // posição: "quantas avaliações bastam" só tem resposta local.
      prisma.competitor.findMany({
        where: { businessId },
        select: {
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { rating: true, reviewCount: true },
          },
        },
      }),
    ]);

  const entrada: EntradaAuditoria = {
    primaryCategory: negocio.primaryCategory,
    additionalCategories: negocio.additionalCategories,
    description: negocio.description,
    phone: negocio.phone,
    website: negocio.website,
    addressLine1: negocio.addressLine1,
    city: negocio.city,
    // Horários, serviços e fotos ainda não são espelhados no banco (E6-01).
    // `null` os declara indisponíveis: eles saem do denominador em vez de
    // virarem zero. Zerar puniria todo perfil por um dado que nós é que não
    // coletamos — e a nota diria "seu perfil está mal" onde o certo é "não
    // medimos isso ainda".
    temHorarios: null,
    temServicos: null,
    totalFotos: null,
    diasDesdeUltimaFoto: null,
    totalAvaliacoes: agregado._count,
    notaMedia: agregado._avg.starRating,
    avaliacoesRespondidas: respondidas,
    postagensUltimos30Dias: postagens,
    avaliacoesUltimos90Dias: recentes,
    termosAlvo: termos.map((t) => t.term),
    concorrentes: concorrentes
      .map((c) => c.snapshots[0])
      .filter((s) => s !== undefined)
      .map((s) => ({
        totalAvaliacoes: s.reviewCount ?? 0,
        notaMedia: s.rating,
      })),
  };

  const { score, itens } = auditar(entrada);

  await prisma.auditSnapshot.create({
    data: { businessId, score, checksJson: itens },
  });

  const preservados = await prisma.checklistItem.findMany({
    where: { businessId, status: { in: ["DONE", "DISMISSED"] } },
    select: { title: true },
  });
  const naoRecriar = new Set(preservados.map((p) => p.title));

  await prisma.checklistItem.deleteMany({
    where: { businessId, status: "OPEN" },
  });

  const pendentes = itens.filter(
    (i) => i.pontuacao < 1 && !naoRecriar.has(i.label),
  );

  if (pendentes.length > 0) {
    await prisma.checklistItem.createMany({
      data: pendentes.map((i) => ({
        businessId,
        area: i.area,
        priority: i.prioridade,
        title: i.label,
        description: i.dica,
        status: "OPEN" as const,
      })),
    });
  }

  return score;
}
