import "server-only";

import { auditar, type EntradaAuditoria } from "@/lib/auditoria";
import { listarAvaliacoes, ApiV4IndisponivelError } from "@/lib/google/avaliacoes";
import { accessTokenValido } from "@/lib/google/conexao";
import { AllowlistPendenteError } from "@/lib/google/locais";
import { buscarDesempenhoDiario } from "@/lib/google/performance";
import { prisma } from "@/lib/prisma";

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
};

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

  const [agregado, respondidas, postagens] = await Promise.all([
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
        publishedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
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
    // Horários e serviços ainda não são espelhados no banco (E6-01); por ora
    // entram como ausentes, o que deprime a nota de forma conservadora.
    temHorarios: false,
    temServicos: false,
    totalAvaliacoes: agregado._count,
    notaMedia: agregado._avg.starRating,
    avaliacoesRespondidas: respondidas,
    postagensUltimos30Dias: postagens,
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
